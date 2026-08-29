import {
  type ApiKey,
  createAcceptancePolicyResource,
  parseAcceptancePolicy,
  type StatementObservation,
} from '@t3x-dev/core';
import {
  type AnyDB,
  bindTransitionPolicy,
  createMaterial,
  digestTransitionRequestCanonicalJson,
  ensureMainBranch,
  findTransitionCommandReceipt,
  findWorkspaceDraft,
  getTransitionRefHead,
  insertProject,
  listTransitionCommits,
  recordTransitionCommandReceipt,
  TransitionCommandIntegrityError,
  upsertWorkspaceDraft,
} from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

const decisionAuthorizationGate = vi.hoisted(() => ({
  wait: null as (() => Promise<void>) | null,
}));

vi.mock('@t3x-dev/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@t3x-dev/core')>();
  return {
    ...actual,
    async authorizeDecisionForRepository(
      input: Parameters<typeof actual.authorizeDecisionForRepository>[0]
    ) {
      if (decisionAuthorizationGate.wait !== null) await decisionAuthorizationGate.wait();
      return actual.authorizeDecisionForRepository(input);
    },
  };
});

let mockDB: AnyDB;
vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

import type { TransitionControlPlaneOptions } from '../lib/transition-control-plane';
import {
  commitTransition,
  decideTransition,
  type TransitionReviewPrecondition,
  TransitionReviewStaleError,
} from '../lib/transition-control-plane/lifecycle';
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

function lifecyclePrecondition(input: WirePrecondition): TransitionReviewPrecondition {
  return {
    workspaceRevision: input.workspace_revision,
    refName: input.ref_name,
    refHead: input.ref_head,
    effectDigest: input.effect_digest,
    proposalDigest: input.proposal_digest,
    statementDigests: [...input.statement_digests],
    policyDigest: input.policy_digest,
    ...(input.review_digest === undefined ? {} : { reviewDigest: input.review_digest }),
  };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function tracked<T>(promise: Promise<T>): {
  promise: Promise<T>;
  settled: () => boolean;
} {
  let didSettle = false;
  const trackedPromise = promise.finally(() => {
    didSettle = true;
  });
  void trackedPromise.catch(() => {});
  return {
    promise: trackedPromise,
    settled: () => didSettle,
  };
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

  it('rolls back CommitV2 ref advance workspace state and receipt when projection fails', async () => {
    const project = await insertProject(mockDB, testData.project({ name: 'Commit Rollback' }));
    const workspace = await createWorkspace(project.projectId, 'ws_commit_rollback');
    await bindPolicy(project.projectId, 'commit-rollback/v1');
    const writer = key(project.projectId, 'rollback-writer', 'agent', [
      'transition:propose',
      'transition:verify',
    ]);
    const reviewer = key(project.projectId, 'rollback-reviewer', 'human', [
      'transition:decide:accept',
    ]);
    const committerActor = { kind: 'service' as const, id: 'service:rollback-committer' };
    const proposed = await propose({
      projectId: project.projectId,
      workspaceId: 'ws_commit_rollback',
      requestId: 'proposal:commit-rollback',
      apiKey: writer,
    });
    const precondition = await verify({
      projectId: project.projectId,
      transitionId: proposed.transitionId,
      requestId: 'verify:commit-rollback',
      apiKey: writer,
    });
    const accepted = await decide({
      projectId: project.projectId,
      transitionId: proposed.transitionId,
      requestId: 'decision:commit-rollback',
      outcome: 'accepted',
      precondition,
      apiKey: reviewer,
    });
    expect(accepted.status).toBe(200);
    const acceptedPayload = (await accepted.json()) as { data: { decision_digest: string } };

    await expect(
      commitTransition({
        db: mockDB,
        projectId: project.projectId,
        transitionId: proposed.transitionId,
        actor: committerActor,
        requestId: 'commit:projection-fails',
        decisionDigest: acceptedPayload.data.decision_digest,
        expectedHead: null,
        workspaceProjection: {
          requestFacts: { kind: 'test:failing-workspace-projection' },
          apply() {
            throw new Error('projection failed after commit graph');
          },
        },
      })
    ).rejects.toThrow('projection failed after commit graph');

    await expect(listTransitionCommits(mockDB, project.projectId)).resolves.toEqual([]);
    await expect(
      getTransitionRefHead(mockDB, { projectId: project.projectId, refName: 'main' })
    ).resolves.toMatchObject({ format: 'empty', head: null });
    await expect(
      findTransitionCommandReceipt(mockDB, {
        projectId: project.projectId,
        transitionId: proposed.transitionId,
        actor: committerActor,
        requestId: 'commit:projection-fails',
      })
    ).resolves.toBeNull();
    await expect(
      findWorkspaceDraft(mockDB, project.projectId, 'ws_commit_rollback')
    ).resolves.toMatchObject({
      revision: workspace.revision,
      workspace_state: expect.not.objectContaining({ lastCommitHash: expect.any(String) }),
    });
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

  it('keeps every reviewed row sealed until Decision persistence completes', async () => {
    const project = await insertProject(mockDB, testData.project({ name: 'Review seal race' }));
    const workspace = await createWorkspace(project.projectId, 'ws_review_seal');
    await bindPolicy(project.projectId, 'review-seal/v1');
    const writer = key(project.projectId, 'seal-writer', 'agent', [
      'transition:propose',
      'transition:verify',
    ]);
    const reviewer = key(project.projectId, 'seal-reviewer', 'human', ['transition:decide:accept']);
    const committer = key(project.projectId, 'seal-committer', 'service', [
      'transition:commit:create',
      'transition:ref:advance',
    ]);
    const reviewed = await propose({
      projectId: project.projectId,
      workspaceId: 'ws_review_seal',
      requestId: 'proposal:review-seal',
      apiKey: writer,
    });
    const reviewedPrecondition = await verify({
      projectId: project.projectId,
      transitionId: reviewed.transitionId,
      requestId: 'verify:review-seal:1',
      apiKey: writer,
    });

    // Prepare a second accepted Transition before pausing the reviewed Decision,
    // so its Commit is a real competing ref-head mutation rather than raw SQL.
    const competing = await propose({
      projectId: project.projectId,
      workspaceId: 'ws_review_seal',
      requestId: 'proposal:review-seal:competitor',
      apiKey: writer,
    });
    const competingPrecondition = await verify({
      projectId: project.projectId,
      transitionId: competing.transitionId,
      requestId: 'verify:review-seal:competitor',
      apiKey: writer,
    });
    const competingDecision = await decide({
      projectId: project.projectId,
      transitionId: competing.transitionId,
      requestId: 'decision:review-seal:competitor',
      outcome: 'accepted',
      precondition: competingPrecondition,
      apiKey: reviewer,
    });
    expect(competingDecision.status).toBe(200);
    const competingDecisionPayload = (await competingDecision.json()) as {
      data: { decision_digest: string };
    };

    const enteredAuthorization = deferred();
    const releaseAuthorization = deferred();
    decisionAuthorizationGate.wait = async () => {
      enteredAuthorization.resolve();
      await releaseAuthorization.promise;
    };

    const pendingDecision = decide({
      projectId: project.projectId,
      transitionId: reviewed.transitionId,
      requestId: 'decision:review-seal',
      outcome: 'accepted',
      precondition: reviewedPrecondition,
      apiKey: reviewer,
    });
    const competingMutations: Promise<unknown>[] = [];

    try {
      await enteredAuthorization.promise;
      const statementMutation = tracked(
        verify({
          projectId: project.projectId,
          transitionId: reviewed.transitionId,
          requestId: 'verify:review-seal:2',
          apiKey: writer,
        })
      );
      const workspaceMutation = tracked(
        upsertWorkspaceDraft(
          mockDB,
          {
            project_id: project.projectId,
            workspace_id: 'ws_review_seal',
            title: 'Workspace changed during review',
            target_branch: 'main',
            workspace_state: {
              ...(workspace.workspace_state ?? {}),
              concurrentReviewMutation: true,
            },
          },
          workspace.revision
        )
      );
      const refMutation = tracked(
        commit({
          projectId: project.projectId,
          transitionId: competing.transitionId,
          requestId: 'commit:review-seal:competitor',
          decisionDigest: competingDecisionPayload.data.decision_digest,
          expectedHead: null,
          apiKey: committer,
        })
      );
      const policyMutation = tracked(bindPolicy(project.projectId, 'review-seal/v2', true));
      competingMutations.push(
        statementMutation.promise,
        workspaceMutation.promise,
        refMutation.promise,
        policyMutation.promise
      );

      await new Promise((resolve) => setTimeout(resolve, 100));
      expect({
        statements: statementMutation.settled(),
        workspace: workspaceMutation.settled(),
        refHead: refMutation.settled(),
        policy: policyMutation.settled(),
      }).toEqual({ statements: false, workspace: false, refHead: false, policy: false });

      releaseAuthorization.resolve();
      const response = await pendingDecision;
      expect(response.status).toBe(200);
      const payload = (await response.json()) as { data: { decision_digest: string } };
      await expect(
        findTransitionCommandReceipt(mockDB, {
          projectId: project.projectId,
          transitionId: reviewed.transitionId,
          actor: { kind: 'human', id: 'user:seal-reviewer' },
          requestId: 'decision:review-seal',
        })
      ).resolves.toMatchObject({ resultDigest: payload.data.decision_digest });

      await Promise.allSettled(competingMutations);
    } finally {
      decisionAuthorizationGate.wait = null;
      releaseAuthorization.resolve();
      await Promise.allSettled([pendingDecision, ...competingMutations]);
    }
  });

  it('rejects a custom authority whose evaluated policy differs from the reviewed digest', async () => {
    const project = await insertProject(
      mockDB,
      testData.project({ name: 'Authority policy mismatch' })
    );
    await createWorkspace(project.projectId, 'ws_authority_policy_mismatch');
    await bindPolicy(project.projectId, 'authority-policy-reviewed/v1');
    const writer = key(project.projectId, 'authority-mismatch-writer', 'agent', [
      'transition:propose',
      'transition:verify',
    ]);
    const proposed = await propose({
      projectId: project.projectId,
      workspaceId: 'ws_authority_policy_mismatch',
      requestId: 'proposal:authority-policy-mismatch',
      apiKey: writer,
    });
    const review = await verify({
      projectId: project.projectId,
      transitionId: proposed.transitionId,
      requestId: 'verify:authority-policy-mismatch',
      apiKey: writer,
    });
    const mismatched = createAcceptancePolicyResource({
      uri: 't3x://policies/authority-policy-mismatch/v2',
      policy: policy(true),
    });
    expect(mismatched.resource.digest).not.toBe(review.policy_digest);
    const actor = { kind: 'human' as const, id: 'user:authority-mismatch-reviewer' };

    await expect(
      decideTransition({
        db: mockDB,
        projectId: project.projectId,
        transitionId: proposed.transitionId,
        actor,
        requestId: 'decision:authority-policy-mismatch',
        outcome: 'accepted',
        precondition: lifecyclePrecondition(review),
        authoritySelection: {
          select({ graph }) {
            return {
              policyDigest: review.policy_digest,
              authority: {
                async resolve() {
                  return {
                    actorContext: { actor },
                    observationScope: {
                      completeness: 'complete' as const,
                      sources: ['repository:transition-statement-memberships'],
                    },
                    policy: mismatched.policy,
                    policyResource: mismatched.resource,
                    statements: graph.observations.map((observation) => ({
                      statement: observation.statement as StatementObservation['statement'],
                      issuerContext: observation.issuerContext,
                    })),
                  };
                },
              },
            };
          },
        },
      })
    ).rejects.toBeInstanceOf(TransitionReviewStaleError);
    await expect(
      findTransitionCommandReceipt(mockDB, {
        projectId: project.projectId,
        transitionId: proposed.transitionId,
        actor,
        requestId: 'decision:authority-policy-mismatch',
      })
    ).resolves.toBeNull();
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
