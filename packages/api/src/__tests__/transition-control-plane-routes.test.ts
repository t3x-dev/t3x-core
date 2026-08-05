import {
  type ApiKey,
  createYOpsEffect,
  createYOpsState,
  describeTransitionObject,
  type ProposalStatement,
  sha256,
} from '@t3x-dev/core';
import {
  type AnyDB,
  createTransitionProposalMembership,
  digestTransitionRequestCanonicalJson,
  ensureMainBranch,
  insertConversation,
  insertProject,
  insertTurn,
  upsertWorkspaceDraft,
} from '@t3x-dev/storage';
import { canonicalizeProtocolValue, type ProtocolValue } from '@t3x-dev/transition';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { TransitionControlPlaneOptions } from '../lib/transition-control-plane';
import { setupTestDB, testData } from './setup';

let mockDB: AnyDB;
vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

import { createTransitionControlPlaneRoutes } from '../routes/transition-control-plane.openapi';

function key(projectId: string, scopes: ApiKey['transition_scopes']): ApiKey {
  return {
    id: `ak_${scopes.join('_')}`,
    key_prefix: 't3xk_test',
    key_hash: 'test-hash',
    name: 'Transition test key',
    project_id: projectId,
    user_id: null,
    principal_kind: 'agent',
    transition_scopes: scopes,
    created_at: '2026-07-31T00:00:00.000Z',
    last_used_at: null,
    revoked_at: null,
  };
}

function app(input?: { apiKey?: ApiKey; options?: TransitionControlPlaneOptions }) {
  const instance = new Hono();
  if (input?.apiKey !== undefined) {
    instance.use('*', async (context, next) => {
      context.set('apiKey', input.apiKey);
      await next();
    });
  }
  instance.route('/', createTransitionControlPlaneRoutes(input?.options));
  return instance;
}

async function createWorkspace(projectId: string, workspaceId: string) {
  await ensureMainBranch(mockDB, projectId);
  return upsertWorkspaceDraft(mockDB, {
    project_id: projectId,
    workspace_id: workspaceId,
    title: `Workspace ${workspaceId}`,
    target_branch: 'main',
    workspace_state: {
      id: workspaceId,
      projectId,
      title: `Workspace ${workspaceId}`,
      targetBranch: 'main',
    },
  });
}

function proposeBody(requestId: string, workspaceId: string) {
  return {
    kind: 'structured_yops',
    request_id: requestId,
    workspace_id: workspaceId,
    operations: [{ set: { path: 'device', value: { name: 'greenhouse-sensor' } } }],
    why: 'Create the reviewed device configuration.',
  };
}

function extractionCandidate(workspaceId: string, sourceThreadId: string, turnHash: string) {
  const sourceSelector = {
    type: 'conversation' as const,
    id: sourceThreadId,
    turnHashes: [turnHash],
  };
  const sourceSelectorDigest = `sha256:${sha256(
    `t3x-workspace-extraction-source-selector-v1\0${canonicalizeProtocolValue(sourceSelector)}`
  )}`;
  const operations = [
    {
      set: { path: 'device/name', value: 'server-selected' },
      source: {
        type: 'llm',
        model: 'test',
        at: '2026-08-05T00:00:00.000Z',
        turn_ref: { turn_hash: turnHash, quote: 'server selected' },
      },
    },
  ];
  const candidateFacts = {
    sourceSelectorDigest,
    baseCommitHash: null,
    operations,
  };
  const candidateId = `candidate:${sha256(
    `t3x-workspace-extraction-candidate-v1\0${canonicalizeProtocolValue(
      candidateFacts as ProtocolValue
    )}`
  )}`;
  return {
    candidateId,
    workspaceState: {
      id: workspaceId,
      projectId: '',
      title: `Workspace ${workspaceId}`,
      targetBranch: 'main',
      backendCandidateId: candidateId,
      extractionProposal: {
        schema: 't3x.dev/workspace-extraction-proposal/v1',
        sourceSelector,
        sourceSelectorDigest,
        baseCommitHash: null,
        mode: 'bootstrap',
        operations,
        result: {
          trees: [{ key: 'device', slots: { name: 'server-selected' }, children: [] }],
          relations: [],
        },
        actor: { kind: 'agent', id: 'agent:extractor' },
        createdAt: '2026-08-05T00:00:00.000Z',
      },
    },
  };
}

async function jsonRequest(instance: Hono, path: string, body: unknown) {
  return instance.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

let cleanup: () => Promise<void>;

beforeAll(async () => {
  const setup = await setupTestDB();
  mockDB = setup.db;
  cleanup = setup.cleanup;
});

afterAll(async () => cleanup());

describe('Transition control-plane routes', () => {
  it('loads canonical YOps from a Workspace extraction candidate and reuses exact retries', async () => {
    const project = await insertProject(mockDB, testData.project({ name: 'Extraction Proposal' }));
    await ensureMainBranch(mockDB, project.projectId);
    const workspaceId = 'ws_extraction_transition';
    const conversation = await insertConversation(mockDB, {
      projectId: project.projectId,
      title: 'Immutable extraction Source',
    });
    const turn = await insertTurn(mockDB, {
      projectId: project.projectId,
      conversationId: conversation.conversationId,
      role: 'user',
      content: 'Use the server selected device name.',
    });
    const candidate = extractionCandidate(workspaceId, conversation.conversationId, turn.turnHash);
    const draft = await upsertWorkspaceDraft(mockDB, {
      project_id: project.projectId,
      workspace_id: workspaceId,
      title: `Workspace ${workspaceId}`,
      target_branch: 'main',
      workspace_state: { ...candidate.workspaceState, projectId: project.projectId },
    });
    const instance = app({
      apiKey: key(project.projectId, ['transition:propose', 'transition:inspect']),
    });
    const body = {
      kind: 'structured_yops',
      request_id: 'proposal:workspace-extraction',
      workspace_id: workspaceId,
      extraction_candidate_id: candidate.candidateId,
      if_revision: draft.revision,
    };

    const proposed = await jsonRequest(
      instance,
      `/v1/projects/${project.projectId}/transitions`,
      body
    );
    const proposedJson = (await proposed.json()) as {
      data: {
        reused: boolean;
        view: {
          request_kind: string;
          transition: { change: { operations: unknown[] }; claims: { actor: unknown } };
        };
      };
    };
    expect(proposed.status, JSON.stringify(proposedJson)).toBe(200);
    const payload = proposedJson;
    expect(payload.data.reused).toBe(false);
    expect(payload.data.view).toMatchObject({
      request_kind: 'structured_yops',
      transition: {
        change: {
          operations: [{ set: { path: 'device/name', value: 'server-selected' } }],
        },
        claims: {
          actor: {
            kind: 'agent',
            id: 'agent:api-key:ak_transition:propose_transition:inspect',
          },
        },
      },
    });

    await upsertWorkspaceDraft(
      mockDB,
      {
        project_id: project.projectId,
        workspace_id: workspaceId,
        title: `Workspace ${workspaceId}`,
        target_branch: 'main',
        workspace_state: {
          ...candidate.workspaceState,
          projectId: project.projectId,
          backendCandidateId: 'candidate:replaced',
          extractionProposal: undefined,
        },
      },
      draft.revision
    );
    const repeated = await jsonRequest(
      instance,
      `/v1/projects/${project.projectId}/transitions`,
      body
    );
    expect(repeated.status).toBe(200);
    await expect(repeated.json()).resolves.toMatchObject({ data: { reused: true } });
  });

  it('keeps propose, inspect, verify, and Statement authority independently scoped', async () => {
    const project = await insertProject(mockDB, testData.project({ name: 'Scoped Control Plane' }));
    await createWorkspace(project.projectId, 'ws_scoped');
    const proposeOnly = app({ apiKey: key(project.projectId, ['transition:propose']) });
    const proposed = await jsonRequest(
      proposeOnly,
      `/v1/projects/${project.projectId}/transitions`,
      proposeBody('proposal:scoped', 'ws_scoped')
    );
    expect(proposed.status).toBe(200);
    const payload = (await proposed.json()) as {
      data: { transition_id: string; view: { transition: { claims: { actor: unknown } } } };
    };
    expect(payload.data.view.transition.claims.actor).toEqual({
      kind: 'agent',
      id: `agent:api-key:ak_${'transition:propose'}`,
    });

    const denied = await proposeOnly.request(
      `/v1/projects/${project.projectId}/transitions/${payload.data.transition_id}`
    );
    expect(denied.status).toBe(403);
  });

  it('runs mandatory replay, isolates provider failures, and preserves exact retry identity', async () => {
    const project = await insertProject(mockDB, testData.project({ name: 'Verify Control Plane' }));
    await createWorkspace(project.projectId, 'ws_verify');
    const scopes: ApiKey['transition_scopes'] = [
      'transition:propose',
      'transition:inspect',
      'transition:verify',
      'transition:statement:issue',
    ];
    const options: TransitionControlPlaneOptions = {
      allowedExternalPredicateTypes: [
        'example.test/provider-validation/v1',
        'example.test/manual-review/v1',
      ],
      providers: [
        {
          source: 'provider:test-validation',
          issuer: { kind: 'service', id: 'service:test-validation' },
          predicateTypes: ['example.test/provider-validation/v1'],
          async verify(input) {
            return {
              outcome: 'statement',
              statement: {
                predicateType: 'example.test/provider-validation/v1',
                predicate: { outcome: 'passed', run: input.run },
                subjects: ['result'],
              },
            };
          },
        },
        {
          source: 'provider:no-statement',
          issuer: { kind: 'service', id: 'service:no-statement' },
          predicateTypes: ['example.test/provider-validation/v1'],
          async verify() {
            return {
              outcome: 'no_statement',
              code: 'ENVIRONMENT_UNAVAILABLE',
              message: 'The optional validation environment is not configured.',
            };
          },
        },
        {
          source: 'provider:unavailable',
          issuer: { kind: 'service', id: 'service:unavailable' },
          predicateTypes: ['example.test/provider-validation/v1'],
          async verify() {
            throw new Error('Provider is temporarily unavailable');
          },
        },
      ],
    };
    const instance = app({ apiKey: key(project.projectId, scopes), options });
    const proposed = await jsonRequest(
      instance,
      `/v1/projects/${project.projectId}/transitions`,
      proposeBody('proposal:verify', 'ws_verify')
    );
    const proposal = (await proposed.json()) as { data: { transition_id: string } };
    const transitionId = proposal.data.transition_id;

    const first = await jsonRequest(
      instance,
      `/v1/projects/${project.projectId}/transitions/${transitionId}/verify`,
      { request_id: 'verify:1' }
    );
    expect(first.status).toBe(200);
    const firstPayload = (await first.json()) as {
      data: {
        reused: boolean;
        statements: Array<{ source: string }>;
        operational_results: Array<{ source: string; outcome: string }>;
        view: { transition: { checks: { replay: { outcomes: string[] } } } };
      };
    };
    expect(firstPayload.data.reused).toBe(false);
    expect(firstPayload.data.statements.map((item) => item.source).sort()).toEqual([
      'provider:test-validation',
      'server:replay',
    ]);
    expect(firstPayload.data.operational_results).toEqual([
      expect.objectContaining({ source: 'provider:no-statement', outcome: 'no_statement' }),
      expect.objectContaining({ source: 'provider:unavailable', outcome: 'failed' }),
    ]);
    expect(firstPayload.data.view.transition.checks.replay.outcomes).toEqual(['verified']);

    const repeated = await jsonRequest(
      instance,
      `/v1/projects/${project.projectId}/transitions/${transitionId}/verify`,
      { request_id: 'verify:1' }
    );
    expect(repeated.status).toBe(200);
    const repeatedPayload = (await repeated.json()) as {
      data: { reused: boolean; statements: unknown[] };
    };
    expect(repeatedPayload.data).toMatchObject({ reused: true });
    expect(repeatedPayload.data.statements).toHaveLength(2);

    const nextRun = await jsonRequest(
      instance,
      `/v1/projects/${project.projectId}/transitions/${transitionId}/verify`,
      { request_id: 'verify:2' }
    );
    expect(nextRun.status).toBe(200);
    const nextRunPayload = (await nextRun.json()) as {
      data: {
        statements: unknown[];
        view: { statements: Array<{ digest: string }> };
      };
    };
    expect(nextRunPayload.data.statements).toHaveLength(2);
    expect(nextRunPayload.data.view.statements).toHaveLength(4);
    expect(nextRunPayload.data.view.statements.map((item) => item.digest)).toEqual(
      [...nextRunPayload.data.view.statements.map((item) => item.digest)].sort()
    );

    const attached = await jsonRequest(
      instance,
      `/v1/projects/${project.projectId}/transitions/${transitionId}/statements`,
      {
        request_id: 'statement:1',
        predicate_type: 'example.test/manual-review/v1',
        predicate: { outcome: 'reviewed' },
        subjects: ['proposal'],
      }
    );
    expect(attached.status).toBe(200);

    const impersonation = await jsonRequest(
      instance,
      `/v1/projects/${project.projectId}/transitions/${transitionId}/statements`,
      {
        request_id: 'statement:core-forgery',
        predicate_type: 't3x.proposal/v1',
        predicate: { intent: { mode: 'unspecified' }, rationale: { mode: 'unspecified' } },
        subjects: ['effect'],
      }
    );
    expect(impersonation.status).toBe(400);

    const unallowed = await jsonRequest(
      instance,
      `/v1/projects/${project.projectId}/transitions/${transitionId}/statements`,
      {
        request_id: 'statement:unallowed',
        predicate_type: 'example.test/not-configured/v1',
        predicate: { outcome: 'reviewed' },
        subjects: ['proposal'],
      }
    );
    expect(unallowed.status).toBe(400);
  });

  it('denies every cross-scope operation and a wrong-project credential', async () => {
    const project = await insertProject(mockDB, testData.project({ name: 'Exact Scopes' }));
    const other = await insertProject(
      mockDB,
      testData.project({ name: 'Wrong Credential Project' })
    );
    await createWorkspace(project.projectId, 'ws_exact_scopes');
    const full = app({
      apiKey: key(project.projectId, [
        'transition:propose',
        'transition:inspect',
        'transition:verify',
        'transition:statement:issue',
      ]),
      options: { allowedExternalPredicateTypes: ['example.test/manual-review/v1'] },
    });
    const proposed = await jsonRequest(
      full,
      `/v1/projects/${project.projectId}/transitions`,
      proposeBody('proposal:exact-scopes', 'ws_exact_scopes')
    );
    const payload = (await proposed.json()) as { data: { transition_id: string } };
    const transitionId = payload.data.transition_id;

    const inspectOnly = app({ apiKey: key(project.projectId, ['transition:inspect']) });
    expect(
      (
        await jsonRequest(
          inspectOnly,
          `/v1/projects/${project.projectId}/transitions`,
          proposeBody('proposal:denied', 'ws_exact_scopes')
        )
      ).status
    ).toBe(403);

    const verifyOnly = app({ apiKey: key(project.projectId, ['transition:verify']) });
    expect(
      (await verifyOnly.request(`/v1/projects/${project.projectId}/transitions/${transitionId}`))
        .status
    ).toBe(403);

    expect(
      (
        await jsonRequest(
          inspectOnly,
          `/v1/projects/${project.projectId}/transitions/${transitionId}/verify`,
          { request_id: 'verify:denied' }
        )
      ).status
    ).toBe(403);

    expect(
      (
        await jsonRequest(
          verifyOnly,
          `/v1/projects/${project.projectId}/transitions/${transitionId}/statements`,
          {
            request_id: 'statement:denied',
            predicate_type: 'example.test/manual-review/v1',
            predicate: { outcome: 'reviewed' },
            subjects: ['proposal'],
          }
        )
      ).status
    ).toBe(403);

    const wrongProject = app({ apiKey: key(other.projectId, ['transition:inspect']) });
    expect(
      (await wrongProject.request(`/v1/projects/${project.projectId}/transitions/${transitionId}`))
        .status
    ).toBe(403);
  });

  it('records Replay falsehood as a Statement before any external provider can run', async () => {
    const project = await insertProject(mockDB, testData.project({ name: 'False Replay' }));
    const verifyKey = key(project.projectId, ['transition:verify']);
    const actor = { kind: 'agent' as const, id: `agent:api-key:${verifyKey.id}` };
    const base = createYOpsState({ device: { enabled: false } });
    const valid = createYOpsEffect({
      base,
      operations: [{ set: { path: 'device/enabled', value: true } }],
      expectedBase: describeTransitionObject(base),
    });
    const claimedResult = createYOpsState({ device: { enabled: 'not-the-replayed-result' } });
    const falseEffect = { ...valid.effect, result: describeTransitionObject(claimedResult) };
    const proposal: ProposalStatement = {
      schema: 't3x/statement/v1',
      subjects: [describeTransitionObject(falseEffect)],
      actor,
      predicateType: 't3x.proposal/v1',
      predicate: {
        intent: { mode: 'unspecified' },
        rationale: { mode: 'authored', value: 'Exercise false Replay.', evidence: [] },
      },
    };
    const requestCanonicalJson = '{"kind":"structured_yops","workspace_id":"ws_false"}';
    const created = await createTransitionProposalMembership(mockDB, {
      projectId: project.projectId,
      workspaceId: 'ws_false',
      workspaceRevision: 1,
      refName: 'main',
      refHead: null,
      requestKind: 'structured_yops',
      requestCanonicalJson,
      requestDigest: digestTransitionRequestCanonicalJson(requestCanonicalJson),
      requestId: 'proposal:false-replay',
      actor,
      base,
      result: claimedResult,
      effect: falseEffect,
      proposal,
    });

    let providerCalled = false;
    const instance = app({
      apiKey: verifyKey,
      options: {
        allowedExternalPredicateTypes: ['example.test/provider-validation/v1'],
        providers: [
          {
            source: 'provider:must-run-after-replay',
            issuer: { kind: 'service', id: 'service:after-replay' },
            predicateTypes: ['example.test/provider-validation/v1'],
            async verify() {
              providerCalled = true;
              return { outcome: 'no_statement', code: 'NOT_NEEDED', message: 'No result.' };
            },
          },
        ],
      },
    });
    const response = await jsonRequest(
      instance,
      `/v1/projects/${project.projectId}/transitions/${created.membership.transitionId}/verify`,
      { request_id: 'verify:false-replay' }
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: {
        statements: Array<{ source: string }>;
        view: { transition: { checks: { replay: { outcomes: string[] } } } };
      };
    };
    expect(payload.data.statements).toHaveLength(1);
    expect(payload.data.statements[0]?.source).toBe('server:replay');
    expect(payload.data.view.transition.checks.replay.outcomes).toEqual(['false']);
    expect(providerCalled).toBe(true);
  });

  it('rejects authority fields and cannot inspect a Transition through another project', async () => {
    const owner = await insertProject(mockDB, testData.project({ name: 'Control Plane Owner' }));
    const other = await insertProject(mockDB, testData.project({ name: 'Control Plane Other' }));
    await createWorkspace(owner.projectId, 'ws_isolation');
    const local = app();
    const spoofed = await jsonRequest(local, `/v1/projects/${owner.projectId}/transitions`, {
      ...proposeBody('proposal:spoofed', 'ws_isolation'),
      actor: { kind: 'service', id: 'service:spoofed' },
    });
    expect(spoofed.status).toBe(400);

    const proposed = await jsonRequest(
      local,
      `/v1/projects/${owner.projectId}/transitions`,
      proposeBody('proposal:isolation', 'ws_isolation')
    );
    expect(proposed.status).toBe(200);
    const payload = (await proposed.json()) as { data: { transition_id: string } };
    const crossProject = await local.request(
      `/v1/projects/${other.projectId}/transitions/${payload.data.transition_id}`
    );
    expect(crossProject.status).toBe(404);

    const issuerSpoof = await jsonRequest(
      local,
      `/v1/projects/${owner.projectId}/transitions/${payload.data.transition_id}/statements`,
      {
        request_id: 'statement:issuer-spoof',
        predicate_type: 'example.test/manual-review/v1',
        predicate: { outcome: 'reviewed' },
        subjects: ['proposal'],
        issuer: { kind: 'service', id: 'service:spoofed' },
      }
    );
    expect(issuerSpoof.status).toBe(400);
  });
});
