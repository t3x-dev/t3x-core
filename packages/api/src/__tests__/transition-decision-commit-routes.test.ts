import { type ApiKey, parseAcceptancePolicy } from '@t3x-dev/core';
import {
  type AnyDB,
  bindTransitionPolicy,
  createMaterial,
  digestTransitionRequestCanonicalJson,
  ensureMainBranch,
  findWorkspaceDraft,
  getTransitionRefHead,
  insertProject,
  recordTransitionCommandReceipt,
  TransitionCommandIntegrityError,
  upsertWorkspaceDraft,
} from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

let mockDB: AnyDB;
vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

import type { TransitionControlPlaneOptions } from '../lib/transition-control-plane';
import { createWorkspaceSourceRunnerProvider } from '../lib/workspace-source-transition';
import type { LocalOciCommandExecutor } from '../lib/workspace-validation/local-oci-provider';
import { createTransitionControlPlaneRoutes } from '../routes/transition-control-plane.openapi';

type WirePrecondition = {
  workspace_revision: number;
  ref_name: string;
  ref_head: string | null;
  effect_digest: string;
  proposal_digest: string;
  statement_digests: string[];
  policy_digest: string;
  review_digest?: string;
};

function key(
  projectId: string,
  name: string,
  kind: ApiKey['principal_kind'],
  scopes: ApiKey['transition_scopes']
): ApiKey {
  return {
    id: `ak_${name}`,
    key_prefix: 't3xk_test',
    key_hash: 'test-hash',
    name: `Transition ${name}`,
    project_id: projectId,
    user_id: kind === 'human' ? name : null,
    principal_kind: kind,
    transition_scopes: scopes,
    created_at: '2026-07-31T00:00:00.000Z',
    last_used_at: null,
    revoked_at: null,
  };
}

function app(apiKey: ApiKey, options?: TransitionControlPlaneOptions) {
  const instance = new Hono();
  instance.use('*', async (context, next) => {
    context.set('apiKey', apiKey);
    await next();
  });
  instance.route('/', createTransitionControlPlaneRoutes(options));
  return instance;
}

function policy(allowSelfApproval = false) {
  return parseAcceptancePolicy({
    schema: 't3x.dev/acceptance-policy/v1',
    version: 1,
    authorization: {
      decide: { actors: { mode: 'any' } },
      override: { actors: { mode: 'any' } },
      allowSelfApproval,
    },
    claims: {
      intent: {
        allowedModes: ['unspecified'],
        minimumEvidence: 0,
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

async function bindPolicy(projectId: string, suffix: string, allowSelfApproval = false) {
  return bindTransitionPolicy(mockDB, {
    projectId,
    refName: 'main',
    uri: `t3x://policies/${suffix}`,
    policy: policy(allowSelfApproval),
    actor: { kind: 'human', id: 'user:policy-admin' },
  });
}

async function post(instance: Hono, path: string, body: unknown) {
  return instance.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function propose(input: {
  projectId: string;
  workspaceId: string;
  requestId: string;
  apiKey: ApiKey;
}) {
  const response = await post(app(input.apiKey), `/v1/projects/${input.projectId}/transitions`, {
    kind: 'structured_yops',
    request_id: input.requestId,
    workspace_id: input.workspaceId,
    operations: [{ set: { path: 'device/name', value: input.workspaceId } }],
    why: `Prepare ${input.workspaceId}.`,
  });
  expect(response.status).toBe(200);
  const payload = (await response.json()) as {
    data: { transition_id: string; view: { precondition: WirePrecondition } };
  };
  return { transitionId: payload.data.transition_id, precondition: payload.data.view.precondition };
}

async function verify(input: {
  projectId: string;
  transitionId: string;
  requestId: string;
  apiKey: ApiKey;
  options?: TransitionControlPlaneOptions;
}) {
  const response = await post(
    app(input.apiKey, input.options),
    `/v1/projects/${input.projectId}/transitions/${input.transitionId}/verify`,
    { request_id: input.requestId }
  );
  expect(response.status).toBe(200);
  const payload = (await response.json()) as {
    data: { view: { precondition: WirePrecondition } };
  };
  return payload.data.view.precondition;
}

async function decide(input: {
  projectId: string;
  transitionId: string;
  requestId: string;
  outcome: 'accepted' | 'overridden' | 'rejected';
  precondition: WirePrecondition;
  apiKey: ApiKey;
  rationale?: string;
}) {
  return post(
    app(input.apiKey),
    `/v1/projects/${input.projectId}/transitions/${input.transitionId}/decisions`,
    {
      request_id: input.requestId,
      outcome: input.outcome,
      precondition: input.precondition,
      ...(input.rationale === undefined ? {} : { rationale: input.rationale }),
    }
  );
}

async function commit(input: {
  projectId: string;
  transitionId: string;
  requestId: string;
  decisionDigest: string;
  expectedHead: string | null;
  apiKey: ApiKey;
}) {
  return post(
    app(input.apiKey),
    `/v1/projects/${input.projectId}/transitions/${input.transitionId}/commits`,
    {
      request_id: input.requestId,
      decision_digest: input.decisionDigest,
      expected_head: input.expectedHead,
    }
  );
}

let cleanup: () => Promise<void>;

beforeAll(async () => {
  const setup = await setupTestDB();
  mockDB = setup.db;
  cleanup = setup.cleanup;
});

afterAll(async () => cleanup());

describe('Transition Decision and Commit routes', () => {
  it('decides and commits from trusted facts with exact command retries', async () => {
    const project = await insertProject(mockDB, testData.project({ name: 'Decision Commit' }));
    await createWorkspace(project.projectId, 'ws_decision_commit');
    await bindPolicy(project.projectId, 'decision-commit/v1');
    const writer = key(project.projectId, 'writer', 'agent', [
      'transition:propose',
      'transition:verify',
    ]);
    const reviewer = key(project.projectId, 'reviewer', 'human', [
      'transition:decide:accept',
      'transition:decide:reject',
    ]);
    const committer = key(project.projectId, 'committer', 'service', [
      'transition:commit:create',
      'transition:ref:advance',
    ]);
    const proposed = await propose({
      projectId: project.projectId,
      workspaceId: 'ws_decision_commit',
      requestId: 'proposal:decision-commit',
      apiKey: writer,
    });
    const precondition = await verify({
      projectId: project.projectId,
      transitionId: proposed.transitionId,
      requestId: 'verify:decision-commit',
      apiKey: writer,
    });
    expect(precondition.review_digest).toMatch(/^sha256:[0-9a-f]{64}$/);

    const staleReview = await decide({
      projectId: project.projectId,
      transitionId: proposed.transitionId,
      requestId: 'decision:stale-review-digest',
      outcome: 'accepted',
      precondition: { ...precondition, review_digest: `sha256:${'0'.repeat(64)}` },
      apiKey: reviewer,
    });
    expect(staleReview.status).toBe(409);

    await expect(
      recordTransitionCommandReceipt(mockDB, {
        transitionId: proposed.transitionId,
        projectId: project.projectId,
        action: 'decide',
        actor: { kind: 'human', id: 'user:reviewer' },
        requestId: 'decision:wrong-result-type',
        requestDigest: digestTransitionRequestCanonicalJson('{}'),
        resultKind: 'decision',
        resultDigest: precondition.proposal_digest,
      })
    ).rejects.toBeInstanceOf(TransitionCommandIntegrityError);

    const accepted = await decide({
      projectId: project.projectId,
      transitionId: proposed.transitionId,
      requestId: 'decision:decision-commit',
      outcome: 'accepted',
      precondition,
      apiKey: reviewer,
    });
    expect(accepted.status).toBe(200);
    const acceptedPayload = (await accepted.json()) as {
      data: {
        reused: boolean;
        decision_digest: string;
        review_digest: string;
        decision: { actor: unknown };
      };
    };
    expect(acceptedPayload.data.reused).toBe(false);
    expect(acceptedPayload.data.review_digest).toBe(precondition.review_digest);
    expect(acceptedPayload.data.decision.actor).toEqual({ kind: 'human', id: 'user:reviewer' });

    const acceptedRetry = await decide({
      projectId: project.projectId,
      transitionId: proposed.transitionId,
      requestId: 'decision:decision-commit',
      outcome: 'accepted',
      precondition,
      apiKey: reviewer,
    });
    expect(acceptedRetry.status).toBe(200);
    const acceptedRetryPayload = (await acceptedRetry.json()) as {
      data: { reused: boolean; decision_digest: string; review_digest: string };
    };
    expect(acceptedRetryPayload.data).toMatchObject({
      reused: true,
      decision_digest: acceptedPayload.data.decision_digest,
      review_digest: acceptedPayload.data.review_digest,
    });

    const conflictingDecision = await decide({
      projectId: project.projectId,
      transitionId: proposed.transitionId,
      requestId: 'decision:decision-commit',
      outcome: 'rejected',
      precondition,
      apiKey: reviewer,
    });
    expect(conflictingDecision.status).toBe(409);

    const committed = await commit({
      projectId: project.projectId,
      transitionId: proposed.transitionId,
      requestId: 'commit:decision-commit',
      decisionDigest: acceptedPayload.data.decision_digest,
      expectedHead: null,
      apiKey: committer,
    });
    expect(committed.status).toBe(200);
    const committedPayload = (await committed.json()) as {
      data: { reused: boolean; commit_digest: string; workspace: { status: string } };
    };
    expect(committedPayload.data.reused).toBe(false);
    expect(committedPayload.data.workspace.status).toBe('committed');

    const committedRetry = await commit({
      projectId: project.projectId,
      transitionId: proposed.transitionId,
      requestId: 'commit:decision-commit',
      decisionDigest: acceptedPayload.data.decision_digest,
      expectedHead: null,
      apiKey: committer,
    });
    expect(committedRetry.status).toBe(200);
    const committedRetryPayload = (await committedRetry.json()) as {
      data: { reused: boolean; commit_digest: string };
    };
    expect(committedRetryPayload.data).toEqual(
      expect.objectContaining({
        reused: true,
        commit_digest: committedPayload.data.commit_digest,
      })
    );

    const conflictingCommit = await commit({
      projectId: project.projectId,
      transitionId: proposed.transitionId,
      requestId: 'commit:decision-commit',
      decisionDigest: acceptedPayload.data.decision_digest,
      expectedHead: committedPayload.data.commit_digest,
      apiKey: committer,
    });
    expect(conflictingCommit.status).toBe(409);
  });

  it('commits canonical exact-source import, edit, and revert with trusted projections', async () => {
    const project = await insertProject(mockDB, testData.project({ name: 'Exact Source Commit' }));
    const draft = await createWorkspace(project.projectId, 'ws_exact_source_commit');
    await bindPolicy(project.projectId, 'exact-source-commit/v1');
    const source = ['esphome:', '  name: canonical-commit', 'esp32:', '  board: esp32dev'].join(
      '\n'
    );
    const material = await createMaterial(mockDB, {
      project_id: project.projectId,
      source_type: 'document',
      title: 'canonical-commit.yaml',
      content_text: source,
      content_hash: 'sha256:canonical-exact-source-commit',
    });
    const writer = key(project.projectId, 'source-writer', 'agent', [
      'transition:propose',
      'transition:verify',
    ]);
    const reviewer = key(project.projectId, 'source-reviewer', 'human', [
      'transition:decide:accept',
    ]);
    const committer = key(project.projectId, 'source-committer', 'service', [
      'transition:commit:create',
      'transition:ref:advance',
    ]);
    let runnerCalls = 0;
    const executor: LocalOciCommandExecutor = async () => {
      runnerCalls += 1;
      return { exit_code: 0, stdout: '', stderr: '' };
    };
    const runAcceptedTransition = async (input: {
      transitionId: string;
      suffix: string;
      expectedHead: string | null;
    }) => {
      const precondition = await verify({
        projectId: project.projectId,
        transitionId: input.transitionId,
        requestId: `verify:${input.suffix}`,
        apiKey: writer,
        options: {
          nativeProviders: [createWorkspaceSourceRunnerProvider({ runner: { executor } })],
        },
      });
      const accepted = await decide({
        projectId: project.projectId,
        transitionId: input.transitionId,
        requestId: `decision:${input.suffix}`,
        outcome: 'accepted',
        precondition,
        apiKey: reviewer,
      });
      expect(accepted.status).toBe(200);
      const acceptedPayload = (await accepted.json()) as {
        data: { decision_digest: string };
      };
      const committed = await commit({
        projectId: project.projectId,
        transitionId: input.transitionId,
        requestId: `commit:${input.suffix}`,
        decisionDigest: acceptedPayload.data.decision_digest,
        expectedHead: input.expectedHead,
        apiKey: committer,
      });
      expect(committed.status).toBe(200);
      const payload = (await committed.json()) as {
        data: {
          commit_digest: string;
          workspace: {
            revision: number;
            status: string;
            sourceArtifact: Record<string, unknown>;
          };
        };
      };
      return { decisionDigest: acceptedPayload.data.decision_digest, payload };
    };
    const proposedResponse = await post(
      app(writer),
      `/v1/projects/${project.projectId}/transitions`,
      {
        kind: 'exact_source_import',
        request_id: 'proposal:exact-source-commit',
        workspace_id: 'ws_exact_source_commit',
        artifact: {
          format: 't3x.dev/workspace-source-artifact/v1',
          root_path: 'device.yaml',
          resources: [],
        },
        root: { material_id: material.id },
        why: 'Import the server-resolved exact source.',
        if_revision: draft.revision,
      }
    );
    expect(proposedResponse.status).toBe(200);
    const proposedPayload = (await proposedResponse.json()) as {
      data: { transition_id: string };
    };
    const imported = await runAcceptedTransition({
      transitionId: proposedPayload.data.transition_id,
      suffix: 'exact-source-import',
      expectedHead: null,
    });
    expect(runnerCalls).toBe(2);
    expect(imported.payload.data.workspace).toMatchObject({
      status: 'committed',
      sourceArtifact: {
        format: 't3x.dev/workspace-source-artifact/v1',
        rootPath: 'device.yaml',
        root: {
          materialId: material.id,
          contentHash: material.content_hash,
        },
        resources: [],
      },
    });
    const retried = await commit({
      projectId: project.projectId,
      transitionId: proposedPayload.data.transition_id,
      requestId: 'commit:exact-source-import',
      decisionDigest: imported.decisionDigest,
      expectedHead: null,
      apiKey: committer,
    });
    expect(retried.status).toBe(200);
    const retriedPayload = (await retried.json()) as {
      data: { reused: boolean; commit_digest: string; workspace: Record<string, unknown> };
    };
    expect(retriedPayload.data).toMatchObject({
      reused: true,
      commit_digest: imported.payload.data.commit_digest,
      workspace: imported.payload.data.workspace,
    });

    const editResponse = await post(app(writer), `/v1/projects/${project.projectId}/transitions`, {
      kind: 'exact_source_edit',
      request_id: 'proposal:exact-source-edit',
      workspace_id: 'ws_exact_source_commit',
      artifact: {
        format: 't3x.dev/workspace-source-artifact/v1',
        root_path: 'device.yaml',
        resources: [],
      },
      operations: [
        {
          op: 'replace_scalar',
          path: ['esphome', 'name'],
          expect: 'canonical-commit',
          value: 'canonical-edited',
        },
      ],
      why: 'Edit the committed exact source.',
      if_revision: imported.payload.data.workspace.revision,
    });
    expect(editResponse.status).toBe(200);
    const editProposal = (await editResponse.json()) as { data: { transition_id: string } };
    const edited = await runAcceptedTransition({
      transitionId: editProposal.data.transition_id,
      suffix: 'exact-source-edit',
      expectedHead: imported.payload.data.commit_digest,
    });
    expect(runnerCalls).toBe(4);
    expect(edited.payload.data.workspace).toMatchObject({
      status: 'committed',
      sourceArtifact: {
        format: 't3x.dev/workspace-source-artifact/v1',
        rootPath: 'device.yaml',
        resources: [],
      },
    });

    const revertResponse = await post(
      app(writer),
      `/v1/projects/${project.projectId}/transitions`,
      {
        kind: 'exact_source_revert',
        request_id: 'proposal:exact-source-revert',
        workspace_id: 'ws_exact_source_commit',
        commit_id: edited.payload.data.commit_digest,
        why: 'Revert the committed exact-source edit.',
        if_revision: edited.payload.data.workspace.revision,
      }
    );
    expect(revertResponse.status).toBe(200);
    const revertProposal = (await revertResponse.json()) as { data: { transition_id: string } };
    const reverted = await runAcceptedTransition({
      transitionId: revertProposal.data.transition_id,
      suffix: 'exact-source-revert',
      expectedHead: edited.payload.data.commit_digest,
    });
    expect(runnerCalls).toBe(6);
    expect(reverted.payload.data.workspace).toMatchObject({
      status: 'committed',
      sourceArtifact: {
        format: 't3x.dev/workspace-source-artifact/v1',
        rootPath: 'device.yaml',
        resources: [],
      },
    });
  });

  it('keeps outcome and Commit/ref scopes independent and rejected Decisions non-authorizing', async () => {
    const project = await insertProject(mockDB, testData.project({ name: 'Decision boundaries' }));
    await createWorkspace(project.projectId, 'ws_decision_boundaries');
    await bindPolicy(project.projectId, 'decision-boundaries/v1');
    const writer = key(project.projectId, 'boundary-writer', 'agent', ['transition:propose']);
    const proposed = await propose({
      projectId: project.projectId,
      workspaceId: 'ws_decision_boundaries',
      requestId: 'proposal:decision-boundaries',
      apiKey: writer,
    });
    const acceptOnly = key(project.projectId, 'accept-only', 'human', ['transition:decide:accept']);
    const rejectOnly = key(project.projectId, 'reject-only', 'human', ['transition:decide:reject']);

    const missingReplay = await decide({
      projectId: project.projectId,
      transitionId: proposed.transitionId,
      requestId: 'decision:missing-replay',
      outcome: 'accepted',
      precondition: proposed.precondition,
      apiKey: acceptOnly,
    });
    expect(missingReplay.status).toBe(409);

    const wrongOutcomeScope = await decide({
      projectId: project.projectId,
      transitionId: proposed.transitionId,
      requestId: 'decision:wrong-scope',
      outcome: 'rejected',
      precondition: proposed.precondition,
      apiKey: acceptOnly,
    });
    expect(wrongOutcomeScope.status).toBe(403);

    const rejected = await decide({
      projectId: project.projectId,
      transitionId: proposed.transitionId,
      requestId: 'decision:rejected',
      outcome: 'rejected',
      precondition: proposed.precondition,
      apiKey: rejectOnly,
    });
    expect(rejected.status).toBe(200);
    const rejectedPayload = (await rejected.json()) as { data: { decision_digest: string } };

    const commitOnly = key(project.projectId, 'commit-only', 'service', [
      'transition:commit:create',
    ]);
    const missingRefScope = await commit({
      projectId: project.projectId,
      transitionId: proposed.transitionId,
      requestId: 'commit:missing-ref-scope',
      decisionDigest: rejectedPayload.data.decision_digest,
      expectedHead: null,
      apiKey: commitOnly,
    });
    expect(missingRefScope.status).toBe(403);

    const fullCommitter = key(project.projectId, 'full-committer', 'service', [
      'transition:commit:create',
      'transition:ref:advance',
    ]);
    const rejectedCommit = await commit({
      projectId: project.projectId,
      transitionId: proposed.transitionId,
      requestId: 'commit:rejected',
      decisionDigest: rejectedPayload.data.decision_digest,
      expectedHead: null,
      apiKey: fullCommitter,
    });
    expect(rejectedCommit.status).toBe(403);

    const agentOverride = key(project.projectId, 'agent-override', 'agent', [
      'transition:decide:override',
    ]);
    const automatedOverride = await decide({
      projectId: project.projectId,
      transitionId: proposed.transitionId,
      requestId: 'decision:automated-override',
      outcome: 'overridden',
      rationale: 'An agent must not exercise this authority in rollout v1.',
      precondition: proposed.precondition,
      apiKey: agentOverride,
    });
    expect(automatedOverride.status).toBe(403);
  });

  it('invalidates reviewed facts when policy or Statement membership changes', async () => {
    const project = await insertProject(mockDB, testData.project({ name: 'Stale review' }));
    await createWorkspace(project.projectId, 'ws_stale_review');
    await bindPolicy(project.projectId, 'stale-review/v1');
    const writer = key(project.projectId, 'stale-writer', 'agent', [
      'transition:propose',
      'transition:verify',
    ]);
    const reviewer = key(project.projectId, 'stale-reviewer', 'human', [
      'transition:decide:accept',
    ]);
    const proposed = await propose({
      projectId: project.projectId,
      workspaceId: 'ws_stale_review',
      requestId: 'proposal:stale-review',
      apiKey: writer,
    });
    const firstReview = await verify({
      projectId: project.projectId,
      transitionId: proposed.transitionId,
      requestId: 'verify:stale-review:1',
      apiKey: writer,
    });

    await bindPolicy(project.projectId, 'stale-review/v2', true);
    const stalePolicy = await decide({
      projectId: project.projectId,
      transitionId: proposed.transitionId,
      requestId: 'decision:stale-policy',
      outcome: 'accepted',
      precondition: firstReview,
      apiKey: reviewer,
    });
    expect(stalePolicy.status).toBe(409);

    const refreshed = await verify({
      projectId: project.projectId,
      transitionId: proposed.transitionId,
      requestId: 'verify:stale-review:2',
      apiKey: writer,
    });
    await verify({
      projectId: project.projectId,
      transitionId: proposed.transitionId,
      requestId: 'verify:stale-review:3',
      apiKey: writer,
    });
    const staleStatements = await decide({
      projectId: project.projectId,
      transitionId: proposed.transitionId,
      requestId: 'decision:stale-statements',
      outcome: 'accepted',
      precondition: refreshed,
      apiKey: reviewer,
    });
    expect(staleStatements.status).toBe(409);
  });

  it('allows only one concurrent Commit to advance a shared ref', async () => {
    const project = await insertProject(mockDB, testData.project({ name: 'Commit race' }));
    await createWorkspace(project.projectId, 'ws_race');
    await bindPolicy(project.projectId, 'commit-race/v1');
    const writer = key(project.projectId, 'race-writer', 'agent', [
      'transition:propose',
      'transition:verify',
    ]);
    const reviewer = key(project.projectId, 'race-reviewer', 'human', ['transition:decide:accept']);
    const committer = key(project.projectId, 'race-committer', 'service', [
      'transition:commit:create',
      'transition:ref:advance',
    ]);
    const proposed = await propose({
      projectId: project.projectId,
      workspaceId: 'ws_race',
      requestId: 'proposal:race',
      apiKey: writer,
    });
    const review = await verify({
      projectId: project.projectId,
      transitionId: proposed.transitionId,
      requestId: 'verify:race',
      apiKey: writer,
    });
    const decision = await decide({
      projectId: project.projectId,
      transitionId: proposed.transitionId,
      requestId: 'decision:race',
      outcome: 'accepted',
      precondition: review,
      apiKey: reviewer,
    });
    expect(decision.status).toBe(200);
    const decisionPayload = (await decision.json()) as {
      data: { decision_digest: string };
    };

    const results = await Promise.all([
      commit({
        projectId: project.projectId,
        transitionId: proposed.transitionId,
        requestId: 'commit:race:a',
        decisionDigest: decisionPayload.data.decision_digest,
        expectedHead: null,
        apiKey: committer,
      }),
      commit({
        projectId: project.projectId,
        transitionId: proposed.transitionId,
        requestId: 'commit:race:b',
        decisionDigest: decisionPayload.data.decision_digest,
        expectedHead: null,
        apiKey: committer,
      }),
    ]);
    expect(results.map((response) => response.status).sort()).toEqual([200, 409]);

    const head = await getTransitionRefHead(mockDB, {
      projectId: project.projectId,
      refName: 'main',
    });
    expect(head.head).toMatch(/^sha256:[0-9a-f]{64}$/);
    const workspace = await findWorkspaceDraft(mockDB, project.projectId, 'ws_race');
    expect(workspace?.workspace_state?.status).toBe('committed');
  });
});
