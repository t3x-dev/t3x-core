import { type ApiKey, parseAcceptancePolicy } from '@t3x-dev/core';
import {
  type AnyDB,
  bindTransitionPolicy,
  createMaterial,
  ensureMainBranch,
  getTransitionRefHead,
  insertProject,
  upsertWorkspaceDraft,
} from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { grantTestScopedCredentialProjectAccess, setupTestDB, testData } from './setup';

let mockDB: AnyDB;
vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

import { createInferenceRuntime, type InferenceRuntime } from '../lib/inference';
import type { ProposalGenerationModel } from '../lib/proposal-generation';
import type { TransitionControlPlaneOptions } from '../lib/transition-control-plane';
import { createTransitionControlPlaneRoutes } from '../routes/transition-control-plane.openapi';

type WirePrecondition = {
  workspace_revision: number;
  ref_name: string;
  ref_head: string | null;
  effect_digest: string;
  proposal_digest: string;
  statement_digests: string[];
  policy_digest: string;
};

type GenerationProjection = {
  posture: 'source_only' | 'guided' | 'recommend';
  counts: { sourceBacked: number; inferred: number; recommended: number; challenges: number };
  groups: Array<{
    id: string;
    origin: 'source_backed' | 'inferred' | 'recommended';
    values: Array<{
      path: string;
      before: { availability: string; value?: unknown };
      after: { availability: string; value?: unknown };
      changed: boolean;
    }>;
  }>;
  verification: {
    status: 'pending' | 'passed' | 'failed';
    findings: Array<{ code: string; severity: string }>;
  };
};

type WireView = {
  precondition: WirePrecondition;
  statements: Array<{ source: string; issuer: { kind: string; id: string } }>;
  generation: GenerationProjection;
};

function key(
  projectId: string,
  name: string,
  kind: ApiKey['principal_kind'],
  scopes: ApiKey['transition_scopes']
): ApiKey {
  return {
    id: `ak_${name}`,
    key_prefix: 't3xk_e2e',
    key_hash: 'test-hash',
    name: `Proposal generation E2E ${name}`,
    project_id: projectId,
    user_id: kind === 'human' ? name : null,
    principal_kind: kind,
    transition_scopes: scopes,
    created_at: '2026-08-13T00:00:00.000Z',
    last_used_at: null,
    revoked_at: null,
  };
}

const defaultInferenceRuntime = createInferenceRuntime();

function app(
  apiKey: ApiKey,
  options: TransitionControlPlaneOptions,
  inferenceRuntime: InferenceRuntime = defaultInferenceRuntime
) {
  const instance = new Hono<{
    Variables: { apiKey: ApiKey; inferenceRuntime: InferenceRuntime };
  }>();
  instance.use('*', async (context, next) => {
    await grantTestScopedCredentialProjectAccess(mockDB, apiKey);
    context.set('apiKey', apiKey);
    context.set('inferenceRuntime', inferenceRuntime);
    await next();
  });
  instance.route('/', createTransitionControlPlaneRoutes(options));
  return instance;
}

async function post(instance: ReturnType<typeof app>, path: string, body: unknown) {
  return instance.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function policy() {
  return parseAcceptancePolicy({
    schema: 't3x.dev/acceptance-policy/v1',
    version: 1,
    authorization: {
      decide: { actors: { mode: 'any' } },
      override: { actors: { mode: 'any' } },
      allowSelfApproval: true,
    },
    claims: {
      intent: {
        allowedModes: ['stated'],
        minimumEvidence: 1,
        humanConfirmation: 'not_required',
      },
      rationale: {
        allowedModes: ['authored'],
        minimumEvidence: 0,
        humanConfirmation: 'not_required',
      },
    },
    checks: {
      replay: {
        issuers: { mode: 'any' },
        tools: { mode: 'any' },
        environments: { mode: 'any' },
      },
      validation: {
        requirement: 'optional',
        issuers: { mode: 'any' },
        tools: { mode: 'any' },
        environments: { mode: 'any' },
        profiles: { mode: 'any' },
        schemas: { mode: 'any' },
        contexts: { mode: 'any' },
      },
      humanConfirmation: { issuers: { mode: 'any' } },
    },
    override: {
      allowClaimFailures: false,
      allowFailedValidation: false,
      allowMissingHumanConfirmation: false,
      allowMissingValidation: false,
    },
  });
}

async function fixture(name: string) {
  const project = await insertProject(mockDB, testData.project({ name }));
  await ensureMainBranch(mockDB, project.projectId);
  const workspaceId = `ws_${name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '_')}`;
  const sourceText = 'The launch audience is enterprise operators.';
  const material = await createMaterial(mockDB, {
    project_id: project.projectId,
    source_type: 'document',
    title: 'launch-notes.txt',
    content_text: sourceText,
    content_hash: `test:${workspaceId}`,
  });
  const workspace = await upsertWorkspaceDraft(mockDB, {
    project_id: project.projectId,
    workspace_id: workspaceId,
    title: name,
    target_branch: 'main',
    workspace_state: {
      id: workspaceId,
      projectId: project.projectId,
      title: name,
      targetBranch: 'main',
      schemaBindings: [{ canonicalName: 't3x/prd', version: 'v2', mode: 'pinned' }],
      sourceBundle: [
        {
          id: `material:${material.id}`,
          type: 'document',
          materialId: material.id,
          contentHash: material.content_hash,
        },
      ],
    },
  });
  await bindTransitionPolicy(mockDB, {
    projectId: project.projectId,
    refName: 'main',
    uri: `t3x://policies/${project.projectId}/proposal-generation-e2e`,
    policy: policy(),
    actor: { kind: 'human', id: 'user:policy-admin' },
  });
  return { project, projectId: project.projectId, workspaceId, material, workspace };
}

function draft(
  value: string,
  input: {
    posture?: 'source_only' | 'guided' | 'recommend';
    origin?: 'source_backed' | 'inferred' | 'recommended';
    path?: string;
  } = {}
) {
  const posture = input.posture ?? 'guided';
  const origin = input.origin ?? 'source_backed';
  const pointer = {
    sourceIndex: 0,
    locator: {
      scheme: 't3x.text-quote/v1',
      value: { quote: 'launch audience is enterprise operators' },
    },
  };
  return {
    schema: 't3x.dev/proposal-generation-draft/v1' as const,
    version: 1 as const,
    posture,
    intent: {
      mode: 'stated' as const,
      value: 'enterprise operators',
      evidencePointers: [pointer],
    },
    rationale: {
      mode: 'authored' as const,
      value: 'Structure the explicit audience claim',
      evidencePointers: [],
    },
    changes: [
      {
        id: 'audience',
        operations: [{ set: { path: input.path ?? 'prd/audience', value } }],
        claimedOrigin: origin,
        evidencePointers: origin === 'source_backed' ? [pointer] : [],
        basisPointers: [],
        assumptions:
          origin === 'recommended' ? ['A human must review this generated candidate.'] : [],
        reason:
          origin === 'source_backed'
            ? 'The source explicitly names the launch audience'
            : 'Offer a clearly labeled candidate for human review',
        challenges: [],
      },
    ],
    warnings: [],
  };
}

function options(value: string, generateDraft = vi.fn(async () => draft(value))) {
  const generate = vi.fn(async (input: Parameters<ProposalGenerationModel['generate']>[0]) => ({
    draft: await generateDraft(input),
    usage: { inputTokens: 29, outputTokens: 17 },
  }));
  const selected: ProposalGenerationModel = {
    provider: 'e2e-provider',
    model: 'e2e-model',
    generate,
  };
  return {
    generate,
    options: {
      proposalGeneration: {
        resolveModel: async () => selected,
      },
    } satisfies TransitionControlPlaneOptions,
  };
}

let cleanup: () => Promise<void>;

beforeAll(async () => {
  const setup = await setupTestDB();
  mockDB = setup.db;
  cleanup = setup.cleanup;
});

afterAll(async () => cleanup());

describe('Proposal generation HTTP lifecycle E2E', () => {
  it('admits with trusted scope and settles provider-reported usage', async () => {
    const data = await fixture('Proposal generation inference receipt');
    const selected = options('enterprise operators');
    const writer = key(data.projectId, 'metered-writer', 'agent', ['transition:propose']);
    const authorize = vi.fn(async () => ({
      outcome: 'admitted' as const,
      admission: { id: 'reservation:proposal-generation' },
    }));
    const settle = vi.fn(async () => {});
    const runtime = createInferenceRuntime({
      admissionPolicy: { authorize, settle, release: vi.fn(async () => {}) },
      createGenerationId: () => 'gen_proposal_generation_e2e',
      now: () => new Date('2026-08-13T00:00:00.000Z'),
    });

    const response = await post(
      app(writer, selected.options, runtime),
      `/v1/projects/${data.projectId}/proposal-generations`,
      {
        request_id: 'generation:e2e:metered',
        workspace_id: data.workspaceId,
        posture: 'guided',
        instruction: 'Structure the launch audience.',
        source_material_ids: [data.material.id],
        model: 'requested-model',
      }
    );

    expect(response.status).toBe(200);
    expect(authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        generationId: 'gen_proposal_generation_e2e',
        feature: 'transition.proposal-generation',
        requestedModel: 'requested-model',
        scope: expect.objectContaining({
          actor: { kind: 'agent', id: `agent:api-key:${writer.id}` },
          projectId: data.projectId,
          namespaceId: expect.any(String),
          projectVisibility: 'unknown',
        }),
      })
    );
    expect(settle).toHaveBeenCalledWith(
      expect.objectContaining({
        terminal: {
          kind: 'receipt',
          receipt: expect.objectContaining({
            generationId: 'gen_proposal_generation_e2e',
            requestedModel: 'requested-model',
            resolvedProvider: 'e2e-provider',
            resolvedModel: 'e2e-model',
            usage: { inputTokens: 29, outputTokens: 17 },
          }),
        },
      })
    );
  });

  it('denies before provider invocation when inference admission rejects the call', async () => {
    const data = await fixture('Proposal generation admission denial');
    const selected = options('enterprise operators');
    const writer = key(data.projectId, 'denied-writer', 'agent', ['transition:propose']);
    const runtime = createInferenceRuntime({
      admissionPolicy: {
        authorize: async () => ({
          outcome: 'denied',
          code: 'quota_exhausted',
          reason: 'Monthly inference grant exhausted',
        }),
        settle: vi.fn(async () => {}),
        release: vi.fn(async () => {}),
      },
      createGenerationId: () => 'gen_proposal_generation_denied',
    });

    const response = await post(
      app(writer, selected.options, runtime),
      `/v1/projects/${data.projectId}/proposal-generations`,
      {
        request_id: 'generation:e2e:denied',
        workspace_id: data.workspaceId,
        posture: 'guided',
        instruction: 'Structure the launch audience.',
        source_material_ids: [data.material.id],
      }
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'RATE_LIMITED',
        details: {
          admission_code: 'quota_exhausted',
          generation_id: 'gen_proposal_generation_denied',
        },
      },
    });
    expect(selected.generate).not.toHaveBeenCalled();
  });

  it('generates, verifies, requires a human Decision, and commits the exact result', async () => {
    const data = await fixture('Proposal generation happy path');
    const selected = options('enterprise operators');
    const writer = key(data.projectId, 'writer', 'agent', [
      'transition:propose',
      'transition:verify',
      'transition:inspect',
    ]);
    const reviewer = key(data.projectId, 'reviewer', 'human', ['transition:decide:accept']);
    const automatedReviewer = key(data.projectId, 'automated-reviewer', 'agent', [
      'transition:decide:accept',
    ]);
    const committer = key(data.projectId, 'committer', 'service', [
      'transition:commit:create',
      'transition:ref:advance',
    ]);
    const generationPath = `/v1/projects/${data.projectId}/proposal-generations`;
    const generationBody = {
      request_id: 'generation:e2e:happy',
      workspace_id: data.workspaceId,
      posture: 'guided',
      instruction: 'Structure the launch audience.',
      source_material_ids: [data.material.id],
      if_revision: data.workspace.revision,
    };

    const generated = await post(app(writer, selected.options), generationPath, generationBody);
    expect(generated.status).toBe(200);
    const generatedPayload = (await generated.json()) as {
      data: { transition_id: string; reused: boolean; view: WireView };
    };
    expect(generatedPayload.data.reused).toBe(false);
    expect(generatedPayload.data.view.generation).toMatchObject({
      posture: 'guided',
      counts: { sourceBacked: 1, inferred: 0, recommended: 0, challenges: 0 },
      verification: { status: 'pending', findings: [] },
    });
    expect(generatedPayload.data.view.generation.groups[0]).toMatchObject({
      id: 'audience',
      origin: 'source_backed',
      values: [
        {
          path: 'prd/audience',
          before: { availability: 'unavailable' },
          after: { availability: 'available', value: 'enterprise operators' },
          changed: true,
        },
      ],
    });

    const retry = await post(app(writer, selected.options), generationPath, generationBody);
    expect(retry.status).toBe(200);
    const retryPayload = (await retry.json()) as {
      data: { transition_id: string; reused: boolean };
    };
    expect(retryPayload.data).toMatchObject({
      transition_id: generatedPayload.data.transition_id,
      reused: true,
    });
    expect(selected.generate).toHaveBeenCalledTimes(1);

    const transitionPath = `/v1/projects/${data.projectId}/transitions/${generatedPayload.data.transition_id}`;
    const verified = await post(app(writer, selected.options), `${transitionPath}/verify`, {
      request_id: 'verify:e2e:happy',
    });
    expect(verified.status).toBe(200);
    const verifiedPayload = (await verified.json()) as {
      data: { view: WireView; statements: unknown[]; operational_results: unknown[] };
    };
    expect(verifiedPayload.data.operational_results).toEqual([]);
    expect(verifiedPayload.data.view.generation.verification).toEqual({
      status: 'passed',
      findings: [],
    });
    expect(verifiedPayload.data.view.statements.map((statement) => statement.source)).toEqual(
      expect.arrayContaining(['server:replay', 'native:proposal-generation-posture/v1'])
    );

    const automatedDecision = await post(
      app(automatedReviewer, selected.options),
      `${transitionPath}/decisions`,
      {
        request_id: 'decision:e2e:automated',
        outcome: 'accepted',
        precondition: verifiedPayload.data.view.precondition,
      }
    );
    expect(automatedDecision.status).toBe(403);
    await expect(automatedDecision.json()).resolves.toMatchObject({
      error: { details: { protocol_code: 'GENERATION_HUMAN_DECISION_REQUIRED' } },
    });

    const accepted = await post(app(reviewer, selected.options), `${transitionPath}/decisions`, {
      request_id: 'decision:e2e:human',
      outcome: 'accepted',
      precondition: verifiedPayload.data.view.precondition,
    });
    expect(accepted.status).toBe(200);
    const acceptedPayload = (await accepted.json()) as {
      data: { decision_digest: string; decision: { actor: unknown } };
    };
    expect(acceptedPayload.data.decision.actor).toEqual({
      kind: 'human',
      id: 'user:reviewer',
    });

    const committed = await post(app(committer, selected.options), `${transitionPath}/commits`, {
      request_id: 'commit:e2e:happy',
      decision_digest: acceptedPayload.data.decision_digest,
      expected_head: verifiedPayload.data.view.precondition.ref_head,
    });
    expect(committed.status).toBe(200);
    const committedPayload = (await committed.json()) as {
      data: { commit_digest: string; workspace: { status: string; lastCommitHash: string } };
    };
    expect(committedPayload.data.workspace).toMatchObject({
      status: 'committed',
      lastCommitHash: committedPayload.data.commit_digest,
    });
    const head = await getTransitionRefHead(mockDB, {
      projectId: data.projectId,
      refName: 'main',
    });
    expect(head).toMatchObject({
      format: 'transition_v2',
      head: committedPayload.data.commit_digest,
      state: { value: { prd: { audience: 'enterprise operators' } } },
    });
  });

  it('records a failed posture Statement and blocks human acceptance of invented content', async () => {
    const data = await fixture('Proposal generation adversarial path');
    const selected = options('consumer buyers');
    const writer = key(data.projectId, 'adversarial-writer', 'agent', [
      'transition:propose',
      'transition:verify',
    ]);
    const reviewer = key(data.projectId, 'adversarial-reviewer', 'human', [
      'transition:decide:accept',
    ]);
    const generated = await post(
      app(writer, selected.options),
      `/v1/projects/${data.projectId}/proposal-generations`,
      {
        request_id: 'generation:e2e:invented',
        workspace_id: data.workspaceId,
        posture: 'guided',
        instruction: 'Structure the launch audience without inventing facts.',
        source_material_ids: [data.material.id],
      }
    );
    expect(generated.status).toBe(200);
    const generatedPayload = (await generated.json()) as {
      data: { transition_id: string };
    };
    const transitionPath = `/v1/projects/${data.projectId}/transitions/${generatedPayload.data.transition_id}`;
    const verified = await post(app(writer, selected.options), `${transitionPath}/verify`, {
      request_id: 'verify:e2e:invented',
    });
    expect(verified.status).toBe(200);
    const verifiedPayload = (await verified.json()) as { data: { view: WireView } };
    expect(verifiedPayload.data.view.generation.verification.status).toBe('failed');
    expect(
      verifiedPayload.data.view.generation.verification.findings.map((finding) => finding.code)
    ).toContain('SOURCE_SUPPORT_REQUIRED');

    const accepted = await post(app(reviewer, selected.options), `${transitionPath}/decisions`, {
      request_id: 'decision:e2e:invented',
      outcome: 'accepted',
      precondition: verifiedPayload.data.view.precondition,
    });
    expect(accepted.status).toBe(409);
    await expect(accepted.json()).resolves.toMatchObject({
      error: { code: 'CONFLICT', details: { protocol_code: 'TRANSITION_DECISION_DENIED' } },
    });
    const head = await getTransitionRefHead(mockDB, {
      projectId: data.projectId,
      refName: 'main',
    });
    expect(head).toEqual({ format: 'empty', refName: 'main', head: null });
  });

  it.each([
    {
      posture: 'source_only' as const,
      origin: 'source_backed' as const,
      path: 'prd/audience',
      stateKey: 'audience',
      value: 'enterprise operators',
      counts: { sourceBacked: 1, inferred: 0, recommended: 0, challenges: 0 },
    },
    {
      posture: 'recommend' as const,
      origin: 'recommended' as const,
      path: 'prd/onboarding',
      stateKey: 'onboarding',
      value: 'guided setup',
      counts: { sourceBacked: 0, inferred: 0, recommended: 1, challenges: 0 },
    },
  ])('persists a verified $posture Proposal through human Decision and CommitV2', async ({
    posture,
    origin,
    path,
    stateKey,
    value,
    counts,
  }) => {
    const data = await fixture(`Proposal generation ${posture} lifecycle`);
    const generate = vi.fn(async () => draft(value, { posture, origin, path }));
    const selected = options(value, generate);
    const writer = key(data.projectId, `${posture}-writer`, 'agent', [
      'transition:propose',
      'transition:verify',
    ]);
    const reviewer = key(data.projectId, `${posture}-reviewer`, 'human', [
      'transition:decide:accept',
    ]);
    const committer = key(data.projectId, `${posture}-committer`, 'service', [
      'transition:commit:create',
      'transition:ref:advance',
    ]);
    const generated = await post(
      app(writer, selected.options),
      `/v1/projects/${data.projectId}/proposal-generations`,
      {
        request_id: `generation:e2e:${posture}`,
        workspace_id: data.workspaceId,
        posture,
        instruction: `Exercise the ${posture} lifecycle.`,
        source_material_ids: [data.material.id],
      }
    );
    expect(generated.status).toBe(200);
    const generatedPayload = (await generated.json()) as {
      data: { transition_id: string; view: WireView };
    };
    expect(generatedPayload.data.view.generation).toMatchObject({
      posture,
      counts,
      verification: { status: 'pending', findings: [] },
    });
    expect(generatedPayload.data.view.generation.groups[0]).toMatchObject({
      origin,
      paths: [path],
      values: [{ after: { availability: 'available', value }, changed: true }],
    });

    const transitionPath = `/v1/projects/${data.projectId}/transitions/${generatedPayload.data.transition_id}`;
    const verified = await post(app(writer, selected.options), `${transitionPath}/verify`, {
      request_id: `verify:e2e:${posture}`,
    });
    expect(verified.status).toBe(200);
    const verifiedPayload = (await verified.json()) as { data: { view: WireView } };
    expect(verifiedPayload.data.view.generation.verification).toEqual({
      status: 'passed',
      findings: [],
    });

    const accepted = await post(app(reviewer, selected.options), `${transitionPath}/decisions`, {
      request_id: `decision:e2e:${posture}`,
      outcome: 'accepted',
      precondition: verifiedPayload.data.view.precondition,
    });
    expect(accepted.status).toBe(200);
    const acceptedPayload = (await accepted.json()) as { data: { decision_digest: string } };
    const committed = await post(app(committer, selected.options), `${transitionPath}/commits`, {
      request_id: `commit:e2e:${posture}`,
      decision_digest: acceptedPayload.data.decision_digest,
      expected_head: verifiedPayload.data.view.precondition.ref_head,
    });
    expect(committed.status).toBe(200);
    const head = await getTransitionRefHead(mockDB, {
      projectId: data.projectId,
      refName: 'main',
    });
    expect(head).toMatchObject({
      format: 'transition_v2',
      state: { value: { prd: { [stateKey]: value } } },
    });
  });
});
