import { type ApiKey, describeTransitionObject } from '@t3x-dev/core';
import { ConflictError, TransitionHeadConflictError } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/db', () => ({
  closeDB: vi.fn(() => Promise.resolve()),
  getDB: vi.fn(() => Promise.resolve({})),
}));

const storageMock = vi.hoisted(() => {
  let workspaceDraft: Record<string, unknown> | null = null;

  return {
    reset: () => {
      workspaceDraft = null;
    },
    seedWorkspaceDraft: (state: Record<string, unknown>) => {
      workspaceDraft = state;
    },
    findMaterialsByProject: vi.fn(() => Promise.resolve([])),
    findProjectById: vi.fn((_db, projectId: string) =>
      Promise.resolve({ projectId, namespaceId: 'ns_test', ownerId: null })
    ),
    findProjectAuthorityFacts: vi.fn(
      (
        _db,
        input: {
          projectId: string;
          principal: { kind: 'human' | 'agent' | 'service'; principalId: string };
        }
      ) =>
        Promise.resolve({
          project: { projectId: input.projectId, namespaceId: 'ns_test', ownerId: null },
          namespaceMembership: null,
          projectGrant: {
            grantId: `grant_${input.principal.principalId}`,
            projectId: input.projectId,
            namespaceId: 'ns_test',
            principalKind: input.principal.kind,
            principalId: input.principal.principalId,
            role: 'editor',
            status: 'active',
            createdAt: new Date('2026-08-31T00:00:00.000Z'),
            updatedAt: new Date('2026-08-31T00:00:00.000Z'),
            revokedAt: null,
          },
        })
    ),
    findBranchByName: vi.fn((_db, _projectId: string, name: string) =>
      Promise.resolve({ name, parentBranch: name === 'main' ? null : 'main' })
    ),
    findWorkspaceDraft: vi.fn((_db, projectId: string, workspaceId: string) =>
      Promise.resolve(
        workspaceDraft
          ? {
              id: 'draft_workspace',
              project_id: projectId,
              workspace_id: workspaceId,
              workspace_state: workspaceDraft,
              target_branch:
                typeof workspaceDraft.targetBranch === 'string'
                  ? workspaceDraft.targetBranch
                  : 'main',
              title: 'PRD audience handoff',
              status: 'editing',
              revision: 1,
              nodes: [],
              constraints: [],
              created_at: '2026-07-03T00:00:00.000Z',
              updated_at: '2026-07-03T00:00:00.000Z',
            }
          : null
      )
    ),
    getLatestTransitionReviewSnapshot: vi.fn(),
    getTransitionProposalPreparation: vi.fn().mockResolvedValue(null),
    getTransitionReviewSnapshot: vi.fn(),
    listWorkspaceDrafts: vi.fn((_db, projectId: string) =>
      Promise.resolve(
        workspaceDraft
          ? [
              {
                id: 'draft_workspace',
                project_id: projectId,
                workspace_id: 'workspace_prd_handoff',
                workspace_state: workspaceDraft,
                title: 'PRD audience handoff',
                status: 'editing',
                revision: 1,
                nodes: [],
                constraints: [],
                created_at: '2026-07-03T00:00:00.000Z',
                updated_at: '2026-07-03T00:00:00.000Z',
              },
            ]
          : []
      )
    ),
    listTransitionReviewSnapshots: vi.fn(),
    upsertWorkspaceDraft: vi.fn(
      (
        _db,
        input: { workspace_id: string; workspace_state: Record<string, unknown> },
        _ifRevision?: number
      ) => {
        workspaceDraft = input.workspace_state;
        return Promise.resolve({
          id: 'draft_workspace',
          project_id: 'proj_sources',
          workspace_id: input.workspace_id,
          workspace_state: workspaceDraft,
          title: 'PRD audience handoff',
          status: 'editing',
          revision: 1,
          nodes: [],
          constraints: [],
          created_at: '2026-07-03T00:00:00.000Z',
          updated_at: '2026-07-03T00:00:00.000Z',
        });
      }
    ),
    markWorkspaceCommitted: (
      hash: string,
      override?: { kind: string; reason: string; blockers: readonly string[] }
    ) => {
      if (workspaceDraft === null) throw new Error('Workspace fixture was not initialized');
      workspaceDraft = {
        ...workspaceDraft,
        status: 'committed',
        lastCommitHash: hash,
        ...(override
          ? {
              commitOverride: {
                ...override,
                blockers: [...override.blockers],
                confirmedAt: '2026-07-03T00:00:00.000Z',
              },
            }
          : {}),
      };
      return { ...workspaceDraft, revision: 2 };
    },
    insertYOpsLogEntry: vi.fn(() =>
      Promise.resolve({
        id: 'yl_workspace',
        projectId: 'proj_sources',
        conversationId: 'conv_prd',
        source: 'workspace_draft',
        turnHash: null,
        yops: [],
        createdAt: '2026-07-03T00:00:00.000Z',
      })
    ),
  };
});

vi.mock('@t3x-dev/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@t3x-dev/storage')>();
  return {
    ...actual,
    findMaterialsByProject: storageMock.findMaterialsByProject,
    findProjectById: storageMock.findProjectById,
    findProjectAuthorityFacts: storageMock.findProjectAuthorityFacts,
    findBranchByName: storageMock.findBranchByName,
    findWorkspaceDraft: storageMock.findWorkspaceDraft,
    getLatestTransitionReviewSnapshot: storageMock.getLatestTransitionReviewSnapshot,
    getTransitionProposalPreparation: storageMock.getTransitionProposalPreparation,
    getTransitionPolicyBinding: vi.fn(() => Promise.resolve(null)),
    getTransitionReviewSnapshot: storageMock.getTransitionReviewSnapshot,
    insertYOpsLogEntry: storageMock.insertYOpsLogEntry,
    listTransitionReviewSnapshots: storageMock.listTransitionReviewSnapshots,
    listWorkspaceDrafts: storageMock.listWorkspaceDrafts,
    upsertWorkspaceDraft: storageMock.upsertWorkspaceDraft,
  };
});

const transitionMock = vi.hoisted(() => ({
  reviewWorkspaceTransition: vi.fn(),
  decideWorkspaceTransition: vi.fn(),
}));

vi.mock('../lib/workspace-transition', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/workspace-transition')>();
  return {
    ...actual,
    reviewWorkspaceTransition: transitionMock.reviewWorkspaceTransition,
    decideWorkspaceTransition: transitionMock.decideWorkspaceTransition,
  };
});

import { workspaceRoutes } from '../routes/workspaces.openapi';

const mockCommitV2 = {
  schema: 't3x/commit/v2' as const,
  parents: [],
  decision: {
    kind: 'statement' as const,
    schema: 't3x/statement/v1' as const,
    digest: `sha256:${'d'.repeat(64)}` as const,
  },
  result: {
    kind: 'state' as const,
    schema: 't3x/state/v1' as const,
    digest: `sha256:${'e'.repeat(64)}` as const,
  },
};
const mockCommitDigest = describeTransitionObject(mockCommitV2).digest;
const mockTransitionId = `trn_${'1'.repeat(32)}`;
const mockPrecondition = {
  workspaceRevision: 1,
  refHead: null,
  effectDigest: `sha256:${'a'.repeat(64)}`,
  proposalDigest: `sha256:${'b'.repeat(64)}`,
  statementDigests: [`sha256:${'c'.repeat(64)}`],
  policyDigest: `sha256:${'f'.repeat(64)}`,
};
const mockReviewDigest = `sha256:${'9'.repeat(64)}`;
const mockSnapshotDigest = `sha256:${'8'.repeat(64)}`;
const mockDescriptor = {
  kind: 'state',
  schema: 't3x/state/v1',
  digest: `sha256:${'7'.repeat(64)}`,
};

function mockReviewArtifacts(status: 'reviewing' | 'committed' = 'reviewing') {
  const reviewSnapshot = {
    schema: 't3x.application/review-snapshot/v1',
    version: 1,
    snapshotId: 'rvs_88888888888888888888888888888888',
    snapshotDigest: mockSnapshotDigest,
    createdAt: '2026-08-17T00:00:00.000Z',
    projectId: 'proj_sources',
    workspaceId: 'workspace_prd_handoff',
    transitionId: mockTransitionId,
    request: {
      kind: 'structured_yops',
      id: 'request:workspace-review',
      createdAt: '2026-08-17T00:00:00.000Z',
    },
    review: {
      digest: mockReviewDigest,
      precondition: {
        workspaceRevision: mockPrecondition.workspaceRevision,
        refName: 'main',
        refHead: mockPrecondition.refHead,
        effectDigest: mockPrecondition.effectDigest,
        proposalDigest: mockPrecondition.proposalDigest,
        statementDigests: mockPrecondition.statementDigests,
        policyDigest: mockPrecondition.policyDigest,
      },
    },
    objects: {
      base: mockDescriptor,
      result: mockDescriptor,
      effect: { ...mockDescriptor, kind: 'effect', schema: 't3x/effect/v1' },
      proposal: { ...mockDescriptor, kind: 'statement', schema: 't3x/statement/v1' },
      statements: [],
      ...(status === 'committed'
        ? { commit: { ...mockDescriptor, kind: 'commit', schema: 't3x/commit/v2' } }
        : {}),
    },
    transition: {},
  };
  return {
    reviewSnapshot,
    changeProjection: {
      schema: 't3x.application/change-projection/v1',
      version: 1,
      authoritative: false,
      source: {
        kind: 'review_snapshot',
        snapshotId: reviewSnapshot.snapshotId,
        snapshotDigest: reviewSnapshot.snapshotDigest,
        snapshotCreatedAt: reviewSnapshot.createdAt,
      },
      projectId: reviewSnapshot.projectId,
      workspaceId: reviewSnapshot.workspaceId,
      transitionId: reviewSnapshot.transitionId,
      title: 'PRD audience handoff',
      status,
      review: {
        digest: mockReviewDigest,
        refName: 'main',
        refHead: mockPrecondition.refHead,
        workspaceRevision: mockPrecondition.workspaceRevision,
        policyDigest: mockPrecondition.policyDigest,
      },
      objects: reviewSnapshot.objects,
      checks: {},
      actions: {},
    },
  };
}

function mockStoredReviewSnapshot(status: 'reviewing' | 'committed' = 'reviewing') {
  const artifacts = mockReviewArtifacts(status);
  return {
    snapshotId: artifacts.reviewSnapshot.snapshotId,
    snapshotDigest: artifacts.reviewSnapshot.snapshotDigest,
    projectId: artifacts.reviewSnapshot.projectId,
    workspaceId: artifacts.reviewSnapshot.workspaceId,
    transitionId: artifacts.reviewSnapshot.transitionId,
    reviewDigest: artifacts.reviewSnapshot.review.digest,
    supersedesSnapshotId: null,
    supersedesSnapshotDigest: null,
    snapshot: artifacts.reviewSnapshot,
    changeProjection: artifacts.changeProjection,
    createdAt: artifacts.reviewSnapshot.createdAt,
  };
}

// biome-ignore lint/suspicious/noExplicitAny: route responses are intentionally schema-flexible here.
type ApiResponse = any;

describe('Workspace routes', () => {
  const app = new Hono();

  app.route('/', workspaceRoutes);

  function appWithApiKey(apiKey: ApiKey) {
    const authenticatedApp = new Hono();
    authenticatedApp.use('*', async (context, next) => {
      context.set('apiKey', apiKey);
      await next();
    });
    authenticatedApp.route('/', workspaceRoutes);
    return authenticatedApp;
  }

  beforeEach(() => {
    storageMock.reset();
    storageMock.findMaterialsByProject.mockClear();
    storageMock.findProjectById.mockClear();
    storageMock.findBranchByName.mockClear();
    storageMock.findWorkspaceDraft.mockClear();
    storageMock.getLatestTransitionReviewSnapshot.mockReset();
    storageMock.getTransitionReviewSnapshot.mockReset();
    storageMock.insertYOpsLogEntry.mockClear();
    storageMock.listTransitionReviewSnapshots.mockReset();
    storageMock.listWorkspaceDrafts.mockClear();
    storageMock.upsertWorkspaceDraft.mockClear();
    transitionMock.reviewWorkspaceTransition.mockReset();
    transitionMock.reviewWorkspaceTransition.mockResolvedValue({
      transitionId: mockTransitionId,
      transition: {},
      precondition: mockPrecondition,
      ...mockReviewArtifacts(),
    });
    transitionMock.decideWorkspaceTransition.mockReset();
    transitionMock.decideWorkspaceTransition.mockImplementation(
      (
        _db: unknown,
        input: {
          transitionId?: string;
          precondition: typeof mockPrecondition;
          workspaceCommitOverride?: {
            kind: string;
            reason: string;
            blockers: readonly string[];
          };
        }
      ) =>
        Promise.resolve({
          transitionId: input.transitionId ?? mockTransitionId,
          transition: {},
          precondition: input.precondition,
          decisionDigest: mockCommitV2.decision.digest,
          commit: mockCommitV2,
          workspace: storageMock.markWorkspaceCommitted(
            mockCommitDigest,
            input.workspaceCommitOverride
          ),
          ...mockReviewArtifacts('committed'),
        })
    );
  });

  it.each([
    '/v1/projects/proj_sources/workspaces/workspace_prd_handoff/transition/review',
    '/v1/projects/proj_sources/workspaces/workspace_prd_handoff/transition/decide',
  ])('does not publish retirement metadata before canonical parity: %s', async (path) => {
    const response = await app.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

    expect(response.status).toBe(400);
    expect(response.headers.has('Deprecation')).toBe(false);
    expect(response.headers.has('Link')).toBe(false);
    expect(response.headers.has('Sunset')).toBe(false);
  });

  it('rejects client-supplied trust facts on Transition review requests', async () => {
    const res = await app.request(
      '/v1/projects/proj_sources/workspaces/workspace_prd_handoff/transition/review',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: { trees: [], relations: [] },
          actor: { kind: 'human', id: 'attacker-controlled' },
        }),
      }
    );

    expect(res.status).toBe(400);
    expect(storageMock.findWorkspaceDraft).not.toHaveBeenCalled();
  });

  it('preserves agent principals on scoped Transition review', async () => {
    storageMock.seedWorkspaceDraft({
      id: 'workspace_prd_handoff',
      projectId: 'proj_sources',
      targetBranch: 'main',
    });
    const agentApp = appWithApiKey({
      id: 'ak_workspace_agent',
      key_prefix: 't3xk_test',
      key_hash: 'test-hash',
      name: 'Workspace agent',
      project_id: 'proj_sources',
      user_id: null,
      principal_kind: 'agent',
      transition_scopes: ['transition:inspect', 'transition:propose'],
      created_at: '2026-08-05T00:00:00.000Z',
      last_used_at: null,
      revoked_at: null,
    });

    const listed = await agentApp.request('/v1/projects/proj_sources/workspaces');
    expect(listed.status).toBe(200);

    const reviewed = await agentApp.request(
      '/v1/projects/proj_sources/workspaces/workspace_prd_handoff/transition/review',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: { trees: [], relations: [] } }),
      }
    );
    expect(reviewed.status).toBe(200);
    expect(transitionMock.reviewWorkspaceTransition).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actor: { kind: 'agent', id: 'agent:api-key:ak_workspace_agent' },
        policyBinding: null,
      })
    );
  });

  it('returns and binds the durable Transition identity across review and decide', async () => {
    storageMock.seedWorkspaceDraft({
      id: 'workspace_prd_handoff',
      projectId: 'proj_sources',
      targetBranch: 'main',
    });
    const content = { trees: [], relations: [] };
    const reviewed = await app.request(
      '/v1/projects/proj_sources/workspaces/workspace_prd_handoff/transition/review',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, if_revision: 1 }),
      }
    );
    expect(reviewed.status).toBe(200);
    await expect(reviewed.json()).resolves.toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          transition_id: mockTransitionId,
          review_snapshot: expect.objectContaining({
            schema: 't3x.application/review-snapshot/v1',
            snapshotDigest: mockSnapshotDigest,
          }),
          change_projection: expect.objectContaining({
            schema: 't3x.application/change-projection/v1',
            authoritative: false,
            status: 'reviewing',
          }),
        }),
      })
    );
    transitionMock.decideWorkspaceTransition.mockResolvedValueOnce({
      transitionId: mockTransitionId,
      transition: {},
      precondition: mockPrecondition,
      decisionDigest: mockCommitV2.decision.digest,
      ...mockReviewArtifacts('committed'),
    });

    const decided = await app.request(
      '/v1/projects/proj_sources/workspaces/workspace_prd_handoff/transition/decide',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transition_id: mockTransitionId,
          content,
          outcome: 'accepted',
          precondition: {
            workspace_revision: mockPrecondition.workspaceRevision,
            ref_head: mockPrecondition.refHead,
            effect_digest: mockPrecondition.effectDigest,
            proposal_digest: mockPrecondition.proposalDigest,
            statement_digests: mockPrecondition.statementDigests,
            policy_digest: mockPrecondition.policyDigest,
          },
        }),
      }
    );
    expect(decided.status).toBe(200);
    await expect(decided.json()).resolves.toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          transition_id: mockTransitionId,
          review_snapshot: expect.objectContaining({ snapshotDigest: mockSnapshotDigest }),
          change_projection: expect.objectContaining({ status: 'committed' }),
        }),
      })
    );
    expect(transitionMock.decideWorkspaceTransition).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ transitionId: mockTransitionId })
    );
  });

  it('reads immutable Workspace ReviewSnapshots without re-deriving Transition facts', async () => {
    const stored = mockStoredReviewSnapshot('committed');
    storageMock.listTransitionReviewSnapshots.mockResolvedValueOnce([stored]);
    storageMock.getLatestTransitionReviewSnapshot.mockResolvedValueOnce(stored);
    storageMock.getTransitionReviewSnapshot.mockResolvedValueOnce(stored);

    const listed = await app.request(
      `/v1/projects/proj_sources/workspaces/workspace_prd_handoff/transition/review-snapshots?transition_id=${mockTransitionId}&limit=5`
    );
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toEqual(
      expect.objectContaining({
        data: {
          snapshots: [
            expect.objectContaining({
              snapshot_id: stored.snapshotId,
              snapshot_digest: stored.snapshotDigest,
              change_projection: expect.objectContaining({ status: 'committed' }),
            }),
          ],
        },
      })
    );
    expect(storageMock.listTransitionReviewSnapshots).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        projectId: 'proj_sources',
        workspaceId: 'workspace_prd_handoff',
        transitionId: mockTransitionId,
        limit: 5,
      })
    );

    const latest = await app.request(
      `/v1/projects/proj_sources/workspaces/workspace_prd_handoff/transition/review-snapshots/latest?transition_id=${mockTransitionId}`
    );
    expect(latest.status).toBe(200);
    await expect(latest.json()).resolves.toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          snapshot_id: stored.snapshotId,
          review_digest: stored.reviewDigest,
        }),
      })
    );
    expect(storageMock.getLatestTransitionReviewSnapshot).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        projectId: 'proj_sources',
        workspaceId: 'workspace_prd_handoff',
        transitionId: mockTransitionId,
      })
    );

    const fetched = await app.request(
      `/v1/projects/proj_sources/workspaces/workspace_prd_handoff/transition/review-snapshots/${stored.snapshotId}`
    );
    expect(fetched.status).toBe(200);
    await expect(fetched.json()).resolves.toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          snapshot: expect.objectContaining({ snapshotId: stored.snapshotId }),
        }),
      })
    );
    expect(transitionMock.reviewWorkspaceTransition).not.toHaveBeenCalled();
    expect(transitionMock.decideWorkspaceTransition).not.toHaveBeenCalled();
  });

  it('recovers the complete Schema/content Review from immutable preparation, not the current Draft', async () => {
    const stored = mockStoredReviewSnapshot('committed');
    const schemaReview = {
      schema: 't3x.application/workspace-schema-review/v1',
      base: { status: 'unbound', schemaHash: null, definition: null, bindings: [] },
      draft: {
        status: 'bound',
        schemaHash: `sha256:${'a'.repeat(64)}`,
        definition: { nodes: { advantage: {} } },
        bindings: [],
      },
      actionCount: 2,
      changes: [],
      baseContent: {},
      draftContent: { advantage: 'Frozen content' },
    };
    storageMock.getTransitionReviewSnapshot.mockResolvedValueOnce(stored);
    storageMock.getTransitionProposalPreparation.mockResolvedValueOnce({
      canonicalJson: JSON.stringify({ schemaReview }),
    });
    const response = await app.request(
      `/v1/projects/proj_sources/workspaces/workspace_prd_handoff/transition/review-snapshots/${stored.snapshotId}`
    );
    expect(response.status).toBe(200);
    expect((await response.json()).data.schema_review).toEqual(schemaReview);
    expect(storageMock.getTransitionProposalPreparation).toHaveBeenCalledWith(
      expect.anything(),
      stored.transitionId
    );
  });

  it('does not expose a ReviewSnapshot through a different Workspace route', async () => {
    const stored = mockStoredReviewSnapshot('reviewing');
    storageMock.getTransitionReviewSnapshot.mockResolvedValueOnce({
      ...stored,
      workspaceId: 'workspace_elsewhere',
    });

    const fetched = await app.request(
      `/v1/projects/proj_sources/workspaces/workspace_prd_handoff/transition/review-snapshots/${stored.snapshotId}`
    );

    expect(fetched.status).toBe(404);
  });

  it('lists and reads persisted workspace state', async () => {
    await app.request('/v1/projects/proj_sources/workspaces/workspace_prd_handoff', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace: {
          id: 'workspace_prd_handoff',
          projectId: 'proj_sources',
          title: 'PRD audience handoff',
          schemaBindings: [{ schemaName: 'PRD Schema v2' }],
          sourceBundle: [],
        },
      }),
    });

    const listRes = await app.request('/v1/projects/proj_sources/workspaces');
    expect(listRes.status).toBe(200);
    const listBody: ApiResponse = await listRes.json();
    expect(listBody.data.workspaces[0].id).toBe('workspace_prd_handoff');
    expect(listBody.data.workspaces[0].revision).toBe(1);

    const getRes = await app.request('/v1/projects/proj_sources/workspaces/workspace_prd_handoff');
    expect(getRes.status).toBe(200);
    const getBody: ApiResponse = await getRes.json();
    expect(getBody.data.workspace.id).toBe('workspace_prd_handoff');
    expect(getBody.data.workspace.revision).toBe(1);
  });

  it('saves reviewed workspace draft state for later recovery', async () => {
    const res = await app.request('/v1/projects/proj_sources/workspaces/workspace_prd_handoff', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace: {
          id: 'client_side_id_is_ignored',
          projectId: 'client_project_is_ignored',
          revision: 999,
          title: 'Reviewed PRD workspace',
          status: 'schema_review',
          updatedAt: '2026-01-01T00:00:00.000Z',
          targetBranch: 'feature/reviewed-prd',
          baseCommitHash: 'sha256:review-base',
          sourceBundle: [{ id: 'src_1', type: 'document', title: 'Reviewed source' }],
          schemaBindings: [{ schemaName: 'PRD Schema v2' }],
          schemaCandidate: {
            summary: 'User reviewed candidate.',
            fields: [],
          },
          schemaReview: {
            verdict: 'ready',
            summary: 'Ready after user review.',
            gaps: [],
          },
          yopsDraft: {
            id: 'draft:reviewed',
            operations: [],
          },
          outputTargets: [],
        },
      }),
    });

    expect(res.status).toBe(200);
    const body: ApiResponse = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.workspace).toEqual(
      expect.objectContaining({
        id: 'workspace_prd_handoff',
        projectId: 'proj_sources',
        title: 'Reviewed PRD workspace',
        status: 'schema_review',
        revision: 1,
      })
    );
    expect(body.data.workspace.updatedAt).toEqual(expect.any(String));
    expect(body.data.workspace.updatedAt).not.toBe('2026-01-01T00:00:00.000Z');
    expect(Number.isNaN(Date.parse(body.data.workspace.updatedAt))).toBe(false);
    expect(storageMock.upsertWorkspaceDraft).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        project_id: 'proj_sources',
        workspace_id: 'workspace_prd_handoff',
        title: 'Reviewed PRD workspace',
        parent_commit_hash: 'sha256:review-base',
        target_branch: 'feature/reviewed-prd',
      }),
      undefined
    );
    expect(
      storageMock.upsertWorkspaceDraft.mock.calls.at(-1)?.[1].workspace_state
    ).not.toHaveProperty('revision');

    const getRes = await app.request('/v1/projects/proj_sources/workspaces/workspace_prd_handoff');
    expect(getRes.status).toBe(200);
    const getBody: ApiResponse = await getRes.json();
    expect(getBody.data.workspace.schemaCandidate.summary).toBe('User reviewed candidate.');
  });

  it('maps workspace write conflicts to 409', async () => {
    const conflicts = [
      {
        error: Object.assign(new Error('duplicate open workspace'), {
          code: '23505',
          constraint: 'idx_drafts_open_workspace_branch',
        }),
        code: 'CONFLICT',
      },
      {
        error: new ConflictError('draft_workspace', 1),
        code: 'CONFLICT',
      },
      {
        error: Object.assign(new Error('duplicate workspace id'), {
          code: '23505',
          constraint_name: 'idx_drafts_workspace',
        }),
        code: 'CONFLICT',
      },
    ];

    for (const conflict of conflicts) {
      storageMock.upsertWorkspaceDraft.mockRejectedValueOnce(conflict.error);

      const res = await app.request('/v1/projects/proj_sources/workspaces/workspace_conflict', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace: {
            id: 'workspace_conflict',
            projectId: 'proj_sources',
            status: 'draft',
            targetBranch: 'main',
          },
        }),
      });

      expect(res.status).toBe(409);
      const body: ApiResponse = await res.json();
      expect(body.error.code).toBe(conflict.code);
    }
  });

  it('rejects workspace state for a branch that is not registered', async () => {
    storageMock.findBranchByName.mockResolvedValueOnce(null);

    const res = await app.request('/v1/projects/proj_sources/workspaces/workspace_phantom', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace: {
          id: 'workspace_phantom',
          projectId: 'proj_sources',
          status: 'draft',
          targetBranch: 'feature/prd-audience',
        },
      }),
    });

    expect(res.status).toBe(404);
    const body: ApiResponse = await res.json();
    expect(body).toEqual({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Target branch not found: feature/prd-audience',
      },
    });
    expect(storageMock.upsertWorkspaceDraft).not.toHaveBeenCalled();
  });

  it('does not let review saves mark the workspace committed', async () => {
    const res = await app.request('/v1/projects/proj_sources/workspaces/workspace_prd_handoff', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace: {
          id: 'workspace_prd_handoff',
          projectId: 'proj_sources',
          title: 'Reviewed but not committed',
          status: 'committed',
          lastCommitHash: 'sha256:client-forged-commit',
          schemaBindings: [{ schemaName: 'PRD Schema v2' }],
          sourceBundle: [],
          yopsDraft: { id: 'draft:review-save', operations: [] },
        },
      }),
    });

    expect(res.status).toBe(200);
    const body: ApiResponse = await res.json();
    expect(body.data.workspace.status).toBe('schema_review');
    expect(body.data.workspace.lastCommitHash).toBeUndefined();
  });

  it('does not let generic Workspace saves replace server-managed Schema candidates or pending tasks', async () => {
    const serverCandidate = {
      candidateId: 'schema-edit:server',
      revision: 2,
      retryKey: 'server-retry',
    };
    const serverPending = { pendingId: 'server-pending', workspaceRevision: 1 };
    const serverPreparations = [{ requestId: 'server-request', previewHash: 'server-hash' }];
    const serverSchemaBase = { refHead: 'server-commit', snapshot: { status: 'bound' } };
    const serverSettings = {
      settingsId: 'server-only',
      status: 'pending',
      baseDefinition: { private: true },
    };
    storageMock.seedWorkspaceDraft({
      id: 'workspace_prd_handoff',
      projectId: 'proj_sources',
      title: 'Schema editing workspace',
      targetBranch: 'main',
      status: 'draft',
      schemaEditCandidate: serverCandidate,
      assistantSchemaSettings: serverSettings,
      schemaPending: serverPending,
      schemaPreparations: serverPreparations,
      workspaceSchemaBase: serverSchemaBase,
    });
    const response = await app.request(
      '/v1/projects/proj_sources/workspaces/workspace_prd_handoff',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          if_revision: 1,
          workspace: {
            title: 'Renamed workspace',
            targetBranch: 'main',
            schemaEditCandidate: { candidateId: 'schema-edit:forged', revision: 999 },
            assistantSchemaSettings: { settingsId: 'forged', status: 'confirmed' },
            schemaPending: { pendingId: 'forged' },
            schemaPreparations: [{ requestId: 'forged' }],
            workspaceSchemaBase: { refHead: 'forged-commit', snapshot: { status: 'unbound' } },
          },
        }),
      }
    );

    expect(response.status).toBe(200);
    const body: ApiResponse = await response.json();
    expect(body.data.workspace.schemaEditCandidate).toEqual(serverCandidate);
    expect(body.data.workspace.assistantSchemaSettings).toBeUndefined();
    expect(
      storageMock.upsertWorkspaceDraft.mock.calls.at(-1)?.[1].workspace_state
        .assistantSchemaSettings
    ).toEqual(serverSettings);
    expect(body.data.workspace.schemaPending).toEqual(serverPending);
    expect(body.data.workspace.schemaPreparations).toEqual(serverPreparations);
    expect(body.data.workspace.workspaceSchemaBase).toEqual(serverSchemaBase);
    expect(
      storageMock.upsertWorkspaceDraft.mock.calls.at(-1)?.[1].workspace_state.schemaEditCandidate
    ).toEqual(serverCandidate);
  });

  it('normalizes invalid review save statuses before persisting', async () => {
    const res = await app.request('/v1/projects/proj_sources/workspaces/workspace_prd_handoff', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace: {
          id: 'workspace_prd_handoff',
          projectId: 'proj_sources',
          title: 'Invalid status workspace',
          status: 'not_a_real_workspace_status',
          schemaBindings: [{ schemaName: 'PRD Schema v2' }],
          sourceBundle: [],
          yopsDraft: { id: 'draft:invalid-status', operations: [] },
        },
      }),
    });

    expect(res.status).toBe(200);
    const body: ApiResponse = await res.json();
    expect(body.data.workspace.status).toBe('draft');
  });

  it('creates a commit and marks the workspace staged state committed', async () => {
    await app.request('/v1/projects/proj_sources/workspaces/workspace_prd_handoff', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace: {
          id: 'workspace_prd_handoff',
          projectId: 'proj_sources',
          title: 'PRD audience handoff',
          status: 'schema_review',
          baseCommitHash: 'sha256:review-base',
          targetBranch: 'feature/reviewed-prd',
          schemaBindings: [{ schemaName: 'PRD Schema v2' }],
          sourceBundle: [
            {
              conversationId: 'conv_prd',
              id: 'source_chat:conv_prd',
              type: 'chat',
              title: 'Reviewed source',
            },
          ],
          yopsDraft: {
            id: 'draft:reviewed',
            operations: [
              {
                afterValue: 'PRD audience handoff',
                id: 'op_backend_1',
                op: 'set',
                path: 'prd/title',
                summary: 'Set title',
              },
            ],
          },
        },
      }),
    });

    const commitPath = '/v1/projects/proj_sources/workspaces/workspace_prd_handoff/commit';
    const content = {
      trees: [{ key: 'prd', slots: { title: 'PRD audience handoff' }, children: [] }],
      relations: [],
    };
    const stale = await app.request(commitPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, if_revision: 999 }),
    });
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toEqual(
      expect.objectContaining({ error: expect.objectContaining({ code: 'CONFLICT' }) })
    );
    expect(storageMock.insertYOpsLogEntry).not.toHaveBeenCalled();
    expect(transitionMock.reviewWorkspaceTransition).not.toHaveBeenCalled();
    expect(transitionMock.decideWorkspaceTransition).not.toHaveBeenCalled();

    const res = await app.request(commitPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, if_revision: 1 }),
    });

    expect(res.status).toBe(200);
    const body: ApiResponse = await res.json();
    expect(body.data.commit).toEqual({
      hash: mockCommitDigest,
      schema: 't3x/commit/v2',
      parents: [],
      decision: mockCommitV2.decision.digest,
      result: mockCommitV2.result.digest,
    });
    expect(body.data.workspace).toEqual(
      expect.objectContaining({
        id: 'workspace_prd_handoff',
        projectId: 'proj_sources',
        status: 'committed',
        lastCommitHash: mockCommitDigest,
      })
    );
    expect(storageMock.insertYOpsLogEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        conversationId: 'conv_prd',
        projectId: 'proj_sources',
        source: 'workspace_draft',
        yops: [
          expect.objectContaining({
            set: { path: 'prd/title', value: 'PRD audience handoff' },
          }),
        ],
      })
    );
    expect(transitionMock.reviewWorkspaceTransition).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actor: { id: 'human:local-user', kind: 'human' },
        content: {
          trees: [{ key: 'prd', slots: { title: 'PRD audience handoff' }, children: [] }],
          relations: [],
        },
        expectedRevision: 1,
        projectId: 'proj_sources',
        why: 'Workspace commit: PRD audience handoff',
        workspaceId: 'workspace_prd_handoff',
      })
    );
    expect(transitionMock.decideWorkspaceTransition).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        outcome: 'accepted',
        precondition: mockPrecondition,
        yopsLogIds: ['yl_workspace'],
      })
    );
  });

  it('requires explicit confirmation for schema review gaps and audits the override', async () => {
    const blocker = 'Schema review gap: requirements.trip.acceptance';
    await app.request('/v1/projects/proj_sources/workspaces/workspace_prd_handoff', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace: {
          id: 'workspace_prd_handoff',
          projectId: 'proj_sources',
          title: 'Trip PRD with a review gap',
          status: 'schema_review',
          targetBranch: 'feature/trip-prd',
          sourceBundle: [{ id: 'source_chat:conv_prd', type: 'chat', title: 'Trip source' }],
          schemaReview: {
            verdict: 'needs_review',
            summary: 'Acceptance criteria are incomplete.',
            gaps: ['requirements.trip.acceptance'],
          },
          yopsDraft: { id: 'draft:trip', operations: [] },
        },
      }),
    });
    const content = {
      trees: [
        {
          key: 'prd',
          slots: { title: 'Trip PRD' },
          children: [
            {
              key: 'requirements',
              slots: {},
              children: [{ key: 'trip', slots: {}, children: [] }],
            },
          ],
        },
      ],
      relations: [],
    };
    const commitPath = '/v1/projects/proj_sources/workspaces/workspace_prd_handoff/commit';

    const blocked = await app.request(commitPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, if_revision: 1 }),
    });

    expect(blocked.status).toBe(409);
    await expect(blocked.json()).resolves.toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'REVIEW_REQUIRED',
          details: { blockers: [blocker] },
        }),
      })
    );
    expect(transitionMock.reviewWorkspaceTransition).not.toHaveBeenCalled();

    const validationOverride = {
      kind: 'schema_review',
      reason: 'User explicitly confirmed unresolved schema review gaps.',
      blockers: [blocker],
    };
    const committed = await app.request(commitPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, validationOverride, if_revision: 1 }),
    });

    expect(committed.status).toBe(200);
    const body: ApiResponse = await committed.json();
    expect(body.data.workspace.commitOverride).toEqual(expect.objectContaining(validationOverride));
    expect(transitionMock.decideWorkspaceTransition).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        outcome: 'overridden',
        decisionReason: validationOverride.reason,
        workspaceCommitOverride: validationOverride,
      })
    );
  });

  it('rejects the task commit when Transition review observes a stale ref', async () => {
    await app.request('/v1/projects/proj_sources/workspaces/workspace_prd_handoff', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace: {
          id: 'workspace_prd_handoff',
          projectId: 'proj_sources',
          title: 'PRD audience handoff',
          status: 'schema_review',
          baseCommitHash: 'sha256:feature-base',
          targetBranch: 'main',
          schemaBindings: [{ schemaName: 'PRD Schema v2' }],
          sourceBundle: [{ id: 'src_1', type: 'document', title: 'Reviewed source' }],
          yopsDraft: { id: 'draft:reviewed', operations: [] },
        },
      }),
    });
    transitionMock.reviewWorkspaceTransition.mockRejectedValueOnce(
      new TransitionHeadConflictError(`sha256:${'1'.repeat(64)}`, `sha256:${'2'.repeat(64)}`)
    );

    const res = await app.request(
      '/v1/projects/proj_sources/workspaces/workspace_prd_handoff/commit',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: {
            trees: [{ key: 'prd', slots: { title: 'PRD audience handoff' }, children: [] }],
            relations: [],
          },
          if_revision: 1,
        }),
      }
    );

    expect(res.status).toBe(409);
    const body: ApiResponse = await res.json();
    expect(body).toEqual({
      success: false,
      error: {
        code: 'STALE_REVIEW',
        message: 'Workspace or ref facts changed; review again.',
      },
    });
    expect(transitionMock.decideWorkspaceTransition).not.toHaveBeenCalled();
  });

  it('rejects a ref change between task review and Decision instead of rebasing silently', async () => {
    await app.request('/v1/projects/proj_sources/workspaces/workspace_prd_handoff', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace: {
          id: 'workspace_prd_handoff',
          projectId: 'proj_sources',
          title: 'PRD audience handoff',
          status: 'schema_review',
          baseCommitHash: 'sha256:stale-base',
          targetBranch: 'feature/reviewed-prd',
          schemaBindings: [{ schemaName: 'PRD Schema v2' }],
          sourceBundle: [{ id: 'src_1', type: 'document', title: 'Reviewed source' }],
          yopsDraft: { id: 'draft:reviewed', operations: [] },
        },
      }),
    });
    transitionMock.decideWorkspaceTransition.mockRejectedValueOnce(
      new TransitionHeadConflictError(`sha256:${'1'.repeat(64)}`, `sha256:${'2'.repeat(64)}`)
    );

    const res = await app.request(
      '/v1/projects/proj_sources/workspaces/workspace_prd_handoff/commit',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: {
            trees: [{ key: 'prd', slots: { title: 'PRD audience handoff' }, children: [] }],
            relations: [],
          },
          if_revision: 1,
        }),
      }
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: {
        code: 'STALE_REVIEW',
        message: 'Workspace or ref facts changed; review again.',
      },
    });
    expect(transitionMock.reviewWorkspaceTransition).toHaveBeenCalledTimes(1);
    expect(transitionMock.decideWorkspaceTransition).toHaveBeenCalledTimes(1);
  });

  it('records a full Transition even when the proposed content matches prior content', async () => {
    const committedContent = {
      trees: [{ key: 'prd', slots: { title: 'PRD audience handoff' }, children: [] }],
      relations: [],
    };
    await app.request('/v1/projects/proj_sources/workspaces/workspace_prd_handoff', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace: {
          id: 'workspace_prd_handoff',
          projectId: 'proj_sources',
          title: 'PRD audience handoff',
          status: 'schema_review',
          baseCommitHash: 'sha256:stale-base',
          targetBranch: 'feature/reviewed-prd',
          schemaBindings: [{ schemaName: 'PRD Schema v2' }],
          sourceBundle: [{ id: 'src_1', type: 'document', title: 'Reviewed source' }],
          yopsDraft: { id: 'draft:reviewed', operations: [] },
        },
      }),
    });
    const res = await app.request(
      '/v1/projects/proj_sources/workspaces/workspace_prd_handoff/commit',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: committedContent, if_revision: 1 }),
      }
    );

    expect(res.status).toBe(200);
    const body: ApiResponse = await res.json();
    expect(body.data.commit.hash).toBe(mockCommitDigest);
    expect(body.data.workspace).toEqual(
      expect.objectContaining({
        status: 'committed',
        lastCommitHash: mockCommitDigest,
      })
    );
    expect(transitionMock.reviewWorkspaceTransition).toHaveBeenCalledTimes(1);
    expect(transitionMock.decideWorkspaceTransition).toHaveBeenCalledTimes(1);
  });
});
