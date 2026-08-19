// @vitest-environment jsdom

import { waitFor } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceReviewSnapshot } from '@/hooks/workspaces/useWorkspaceReviewSnapshot';
import {
  decideWorkspaceTransition,
  fetchWorkspaceTransitionReviewSnapshot,
} from '@/queries/workspaces';
import { cleanupRoots, renderHook } from '../renderHook';

vi.mock('@/queries/workspaces', () => ({
  decideWorkspaceTransition: vi.fn(),
  fetchWorkspaceTransitionReviewSnapshot: vi.fn(),
}));

describe('useWorkspaceReviewSnapshot', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cleanupRoots();
  });

  it('loads one immutable Workspace ReviewSnapshot with abortable transport', async () => {
    vi.mocked(fetchWorkspaceTransitionReviewSnapshot).mockResolvedValue({
      snapshot_id: 'rvs_88888888888888888888888888888888',
      snapshot_digest: `sha256:${'8'.repeat(64)}`,
      project_id: 'proj_1',
      workspace_id: 'workspace_prd_handoff',
      transition_id: `trn_${'1'.repeat(32)}`,
      review_digest: `sha256:${'9'.repeat(64)}`,
      supersedes_snapshot_id: null,
      supersedes_snapshot_digest: null,
      snapshot: { snapshotId: 'rvs_88888888888888888888888888888888' },
      change_projection: { title: 'Reduce device log volume' },
      created_at: '2026-08-17T00:00:00.000Z',
    } as never);

    const { result } = renderHook(() =>
      useWorkspaceReviewSnapshot(
        'proj_1',
        'workspace_prd_handoff',
        'rvs_88888888888888888888888888888888'
      )
    );

    await waitFor(() => expect(result.current.state.loading).toBe(false));

    expect(fetchWorkspaceTransitionReviewSnapshot).toHaveBeenCalledWith(
      'proj_1',
      'workspace_prd_handoff',
      'rvs_88888888888888888888888888888888',
      expect.any(AbortSignal)
    );
    expect(result.current.state.data?.change_projection.title).toBe('Reduce device log volume');
    expect(result.current.state.loading).toBe(false);
  });

  it('decides from the immutable snapshot without replaying Workspace content in Web', async () => {
    vi.mocked(fetchWorkspaceTransitionReviewSnapshot).mockResolvedValue(
      snapshotEnvelope('reviewing')
    );
    vi.mocked(decideWorkspaceTransition).mockResolvedValue({
      ...decisionEnvelope('committed'),
      workspace: { id: 'workspace_prd_handoff', projectId: 'proj_1' },
    } as never);
    const commitCreated = vi.fn();
    window.addEventListener('t3x:commit-created', commitCreated);
    const { result } = renderHook(() =>
      useWorkspaceReviewSnapshot(
        'proj_1',
        'workspace_prd_handoff',
        'rvs_88888888888888888888888888888888'
      )
    );

    await waitFor(() => expect(result.current.state.loading).toBe(false));
    await act(async () => {
      await result.current.decide('accepted');
    });

    expect(decideWorkspaceTransition).toHaveBeenCalledWith('proj_1', 'workspace_prd_handoff', {
      transitionId: `trn_${'1'.repeat(32)}`,
      outcome: 'accepted',
      precondition: {
        workspace_revision: 7,
        ref_head: null,
        effect_digest: `sha256:${'a'.repeat(64)}`,
        proposal_digest: `sha256:${'b'.repeat(64)}`,
        statement_digests: [`sha256:${'c'.repeat(64)}`],
        policy_digest: `sha256:${'d'.repeat(64)}`,
      },
    });
    expect(result.current.state.data?.change_projection.status).toBe('committed');
    expect(commitCreated).toHaveBeenCalledOnce();
    window.removeEventListener('t3x:commit-created', commitCreated);
  });
});

function snapshotEnvelope(status: 'reviewing' | 'committed') {
  const snapshot = reviewSnapshot(status);
  const changeProjection = changeProjectionFor(status, snapshot);
  return {
    snapshot_id: snapshot.snapshotId,
    snapshot_digest: snapshot.snapshotDigest,
    project_id: snapshot.projectId,
    workspace_id: snapshot.workspaceId,
    transition_id: snapshot.transitionId,
    review_digest: snapshot.review.digest,
    supersedes_snapshot_id: null,
    supersedes_snapshot_digest: null,
    snapshot,
    change_projection: changeProjection,
    created_at: snapshot.createdAt,
  } as never;
}

function decisionEnvelope(status: 'committed') {
  const snapshot = reviewSnapshot(status);
  return {
    transition_id: snapshot.transitionId,
    transition: snapshot.transition,
    precondition: {
      workspace_revision: 7,
      ref_head: null,
      effect_digest: `sha256:${'a'.repeat(64)}`,
      proposal_digest: `sha256:${'b'.repeat(64)}`,
      statement_digests: [`sha256:${'c'.repeat(64)}`],
      policy_digest: `sha256:${'d'.repeat(64)}`,
    },
    decision_digest: `sha256:${'f'.repeat(64)}`,
    review_snapshot: snapshot,
    change_projection: changeProjectionFor(status, snapshot),
  };
}

function changeProjectionFor(
  status: 'reviewing' | 'committed',
  snapshot: ReturnType<typeof reviewSnapshot>
) {
  return {
    schema: 't3x.application/change-projection/v1',
    version: 1,
    authoritative: false,
    source: {
      kind: 'review_snapshot',
      snapshotId: snapshot.snapshotId,
      snapshotDigest: snapshot.snapshotDigest,
      snapshotCreatedAt: snapshot.createdAt,
    },
    projectId: snapshot.projectId,
    workspaceId: snapshot.workspaceId,
    transitionId: snapshot.transitionId,
    title: 'Reduce device log volume',
    status,
    review: {
      digest: snapshot.review.digest,
      refName: 'feature/prd-audience',
      refHead: null,
      workspaceRevision: 7,
      policyDigest: `sha256:${'d'.repeat(64)}`,
    },
    objects: snapshot.objects,
    checks: {},
    actions: {},
  };
}

function reviewSnapshot(status: 'reviewing' | 'committed') {
  return {
    schema: 't3x.application/review-snapshot/v1',
    version: 1,
    snapshotId:
      status === 'reviewing'
        ? 'rvs_88888888888888888888888888888888'
        : 'rvs_99999999999999999999999999999999',
    snapshotDigest:
      status === 'reviewing' ? `sha256:${'8'.repeat(64)}` : `sha256:${'9'.repeat(64)}`,
    createdAt: '2026-08-17T00:00:00.000Z',
    projectId: 'proj_1',
    workspaceId: 'workspace_prd_handoff',
    transitionId: `trn_${'1'.repeat(32)}`,
    request: {
      kind: 'structured_yops',
      id: 'request:workspace_prd_handoff',
      createdAt: '2026-08-17T00:00:00.000Z',
    },
    review: {
      digest: `sha256:${'r'.repeat(64)}`,
      precondition: {
        workspaceRevision: 7,
        refName: 'feature/prd-audience',
        refHead: null,
        effectDigest: `sha256:${'a'.repeat(64)}`,
        proposalDigest: `sha256:${'b'.repeat(64)}`,
        statementDigests: [`sha256:${'c'.repeat(64)}`],
        policyDigest: `sha256:${'d'.repeat(64)}`,
      },
    },
    objects: {
      base: { kind: 'state', schema: 't3x/state/v1', digest: `sha256:${'1'.repeat(64)}` },
      result: { kind: 'state', schema: 't3x/state/v1', digest: `sha256:${'2'.repeat(64)}` },
      effect: { kind: 'effect', schema: 't3x/effect/v1', digest: `sha256:${'a'.repeat(64)}` },
      proposal: {
        kind: 'statement',
        schema: 't3x/statement/v1',
        digest: `sha256:${'b'.repeat(64)}`,
      },
      statements: [
        {
          kind: 'statement',
          schema: 't3x/statement/v1',
          digest: `sha256:${'c'.repeat(64)}`,
        },
      ],
      ...(status === 'committed'
        ? {
            commit: {
              kind: 'commit',
              schema: 't3x/commit/v2',
              digest: `sha256:${'e'.repeat(64)}`,
            },
            decision: {
              kind: 'statement',
              schema: 't3x/statement/v1',
              digest: `sha256:${'f'.repeat(64)}`,
            },
          }
        : {}),
    },
    transition: {
      mode: 'transition',
      decision:
        status === 'reviewing'
          ? { observation: 'not_supplied' }
          : { observation: 'supplied', outcome: 'accepted' },
      history:
        status === 'committed'
          ? { observation: 'committed', commit: { id: `sha256:${'e'.repeat(64)}` } }
          : { observation: 'not_committed' },
    },
  };
}
