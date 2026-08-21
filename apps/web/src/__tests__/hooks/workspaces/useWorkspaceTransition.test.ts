// @vitest-environment jsdom

import type { ChangeProjectionV1, ReviewSnapshotV1 } from '@t3x-dev/api-client';
import type { TransitionViewV1 } from '@t3x-dev/core';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceTransition } from '@/hooks/workspaces/useWorkspaceTransition';
import { ApiError } from '@/infrastructure/core';
import {
  decideWorkspaceTransition,
  reviewWorkspaceTransition,
  saveWorkspaceDraft,
} from '@/queries/workspaces';
import type { WorkspaceCandidate } from '@/types/workspaces';
import { cleanupRoots, renderHook } from '../renderHook';

vi.mock('@/queries/workspaces', () => ({
  decideWorkspaceTransition: vi.fn(),
  reviewWorkspaceTransition: vi.fn(),
  saveWorkspaceDraft: vi.fn(),
}));

const digest = (value: string) => `sha256:${value.repeat(64).slice(0, 64)}`;
const transitionId = `trn_${'1'.repeat(32)}`;

const candidate = {
  id: 'workspace_prd_handoff',
  revision: 6,
  projectId: 'proj_1',
  title: 'PRD audience handoff',
  targetBranch: 'feature/prd-audience',
} as WorkspaceCandidate;

const content = {
  trees: [{ key: 'prd', slots: { title: 'PRD audience handoff' }, children: [] }],
  relations: [],
};

const precondition = {
  workspace_revision: 7,
  ref_head: null,
  effect_digest: digest('a'),
  proposal_digest: digest('b'),
  statement_digests: [digest('c')],
  policy_digest: digest('d'),
};

function transitionView(
  mode: 'pending' | 'committed' | 'rejected'
): Extract<TransitionViewV1, { mode: 'transition' }> {
  return {
    mode: 'transition',
    decision:
      mode === 'pending'
        ? { observation: 'not_supplied' }
        : { observation: 'supplied', outcome: mode === 'rejected' ? 'rejected' : 'accepted' },
    history:
      mode === 'committed'
        ? { observation: 'committed', commit: { id: digest('e') } }
        : { observation: 'not_committed' },
  } as Extract<TransitionViewV1, { mode: 'transition' }>;
}

function reviewArtifacts(mode: 'pending' | 'committed' | 'rejected') {
  const transition = transitionView(mode);
  const objects: ReviewSnapshotV1['objects'] = {
    base: { kind: 'state', schema: 't3x/state/v1', digest: digest('1') },
    result: { kind: 'state', schema: 't3x/state/v1', digest: digest('2') },
    effect: { kind: 'effect', schema: 't3x/effect/v1', digest: precondition.effect_digest },
    proposal: {
      kind: 'statement',
      schema: 't3x/statement/v1',
      digest: precondition.proposal_digest,
    },
    statements: precondition.statement_digests.map((statementDigest) => ({
      kind: 'statement' as const,
      schema: 't3x/statement/v1' as const,
      digest: statementDigest,
    })),
  };
  if (mode === 'committed') {
    objects.commit = { kind: 'commit', schema: 't3x/commit/v2', digest: digest('e') };
    objects.decision = { kind: 'statement', schema: 't3x/statement/v1', digest: digest('f') };
  }
  if (mode === 'rejected') {
    objects.decision = { kind: 'statement', schema: 't3x/statement/v1', digest: digest('f') };
  }
  const reviewSnapshot: ReviewSnapshotV1 = {
    schema: 't3x.application/review-snapshot/v1',
    version: 1,
    snapshotId: `rvs_${mode}`,
    snapshotDigest: digest(mode[0] ?? 'z'),
    createdAt: '2026-07-30T00:00:00.000Z',
    projectId: candidate.projectId,
    workspaceId: candidate.id,
    transitionId,
    request: {
      kind: 'structured_yops',
      id: 'request:workspace_prd_handoff',
      createdAt: '2026-07-30T00:00:00.000Z',
    },
    review: {
      digest: digest('r'),
      precondition: {
        workspaceRevision: precondition.workspace_revision,
        refName: candidate.targetBranch,
        refHead: precondition.ref_head,
        effectDigest: precondition.effect_digest,
        proposalDigest: precondition.proposal_digest,
        statementDigests: precondition.statement_digests,
        policyDigest: precondition.policy_digest,
      },
    },
    objects,
    transition,
  };
  const changeProjection: ChangeProjectionV1 = {
    schema: 't3x.application/change-projection/v1',
    version: 1,
    authoritative: false,
    source: {
      kind: 'review_snapshot',
      snapshotId: reviewSnapshot.snapshotId,
      snapshotDigest: reviewSnapshot.snapshotDigest,
      snapshotCreatedAt: reviewSnapshot.createdAt,
    },
    projectId: candidate.projectId,
    workspaceId: candidate.id,
    transitionId,
    title: 'PRD audience handoff',
    status: mode === 'pending' ? 'reviewing' : mode === 'rejected' ? 'rejected' : 'committed',
    review: {
      digest: reviewSnapshot.review.digest,
      refName: candidate.targetBranch,
      refHead: precondition.ref_head,
      workspaceRevision: precondition.workspace_revision,
      policyDigest: precondition.policy_digest,
    },
    objects,
    checks: transition.checks,
    actions: transition.capabilities,
  };
  return {
    change_projection: changeProjection,
    review_snapshot: reviewSnapshot,
    transition,
  };
}

describe('useWorkspaceTransition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(saveWorkspaceDraft).mockResolvedValue({
      candidate_id: 'candidate:workspace_prd_handoff',
      workspace: { ...candidate, revision: 7 },
    });
    vi.mocked(reviewWorkspaceTransition).mockResolvedValue({
      ...reviewArtifacts('pending'),
      transition_id: transitionId,
      precondition,
    });
  });

  afterEach(() => {
    cleanupRoots();
  });

  it('saves before review and commits only through the reviewed Decision', async () => {
    const commitCreated = vi.fn();
    window.addEventListener('t3x:commit-created', commitCreated);
    vi.mocked(decideWorkspaceTransition).mockResolvedValue({
      ...reviewArtifacts('committed'),
      transition_id: transitionId,
      precondition,
      decision_digest: digest('f'),
      commit: {},
      workspace: { ...candidate, revision: 8, status: 'committed', lastCommitHash: digest('e') },
    });
    const { result } = renderHook(() => useWorkspaceTransition(candidate));

    await act(async () => {
      await result.current.review(content, '  Keep the audience current.  ');
    });

    expect(saveWorkspaceDraft).toHaveBeenCalledWith('proj_1', 'workspace_prd_handoff', candidate);
    expect(reviewWorkspaceTransition).toHaveBeenCalledWith(
      'proj_1',
      'workspace_prd_handoff',
      content,
      'Keep the audience current.',
      7
    );
    expect(vi.mocked(saveWorkspaceDraft).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(reviewWorkspaceTransition).mock.invocationCallOrder[0]!
    );
    expect(result.current.state.phase).toBe('reviewed');
    expect(result.current.state.reviewSnapshot?.snapshotId).toBe('rvs_pending');
    expect(result.current.state.changeProjection?.status).toBe('reviewing');

    let committed: { commitId: string; workspace: WorkspaceCandidate } | null = null;
    await act(async () => {
      committed = await result.current.decide('accepted');
    });

    expect(decideWorkspaceTransition).toHaveBeenCalledWith('proj_1', 'workspace_prd_handoff', {
      transitionId,
      content,
      why: 'Keep the audience current.',
      outcome: 'accepted',
      decisionReason: undefined,
      precondition,
    });
    expect(committed).toEqual({
      commitId: digest('e'),
      workspace: { ...candidate, revision: 8, status: 'committed', lastCommitHash: digest('e') },
    });
    expect(result.current.state.reviewSnapshot?.snapshotId).toBe('rvs_committed');
    expect(result.current.state.changeProjection?.status).toBe('committed');
    expect(commitCreated).toHaveBeenCalledOnce();
    expect((commitCreated.mock.calls[0]?.[0] as CustomEvent).detail.payload.hash).toBe(digest('e'));
    window.removeEventListener('t3x:commit-created', commitCreated);
  });

  it('requires an authored reason before requesting an override', async () => {
    const { result } = renderHook(() => useWorkspaceTransition(candidate));
    await act(async () => {
      await result.current.review(content);
      await result.current.decide('overridden', '   ');
    });

    expect(decideWorkspaceTransition).not.toHaveBeenCalled();
    expect(result.current.state.errorCode).toBe('OVERRIDE_REASON_REQUIRED');
    expect(result.current.state.phase).toBe('reviewed');
  });

  it('keeps rejection out of commit events while retaining the returned view', async () => {
    const commitCreated = vi.fn();
    window.addEventListener('t3x:commit-created', commitCreated);
    vi.mocked(decideWorkspaceTransition).mockResolvedValue({
      ...reviewArtifacts('rejected'),
      transition_id: transitionId,
      precondition,
      decision_digest: digest('f'),
    });
    const { result } = renderHook(() => useWorkspaceTransition(candidate));

    await act(async () => {
      await result.current.review(content);
      await result.current.decide('rejected');
    });

    expect(result.current.state.phase).toBe('rejected');
    expect(result.current.state.view).toEqual(transitionView('rejected'));
    expect(commitCreated).not.toHaveBeenCalled();
    window.removeEventListener('t3x:commit-created', commitCreated);
  });

  it('clears a stale precondition and does not retry the Decision', async () => {
    vi.mocked(decideWorkspaceTransition).mockRejectedValue(
      new ApiError('STALE_REVIEW', 'Workspace or ref facts changed; review again.')
    );
    const { result } = renderHook(() => useWorkspaceTransition(candidate));

    await act(async () => {
      await result.current.review(content);
      await result.current.decide('accepted');
    });
    expect(result.current.state.errorCode).toBe('STALE_REVIEW');
    expect(result.current.state.view).toBeNull();

    await act(async () => {
      await result.current.decide('accepted');
    });
    expect(decideWorkspaceTransition).toHaveBeenCalledOnce();
    expect(result.current.state.errorCode).toBe('REVIEW_REQUIRED');
  });

  it('does not restore a review invalidated while the request was in flight', async () => {
    let resolveReview!: (value: {
      change_projection: ChangeProjectionV1;
      review_snapshot: ReviewSnapshotV1;
      transition_id: string;
      transition: TransitionViewV1;
      precondition: typeof precondition;
    }) => void;
    vi.mocked(reviewWorkspaceTransition).mockReturnValue(
      new Promise((resolve) => {
        resolveReview = resolve;
      })
    );
    const { result } = renderHook(() => useWorkspaceTransition(candidate));
    let reviewPromise!: Promise<boolean>;

    await act(async () => {
      reviewPromise = result.current.review(content);
      await Promise.resolve();
    });
    expect(reviewWorkspaceTransition).toHaveBeenCalledOnce();
    act(() => result.current.reset());
    await act(async () => {
      resolveReview({
        ...reviewArtifacts('pending'),
        transition_id: transitionId,
        precondition,
      });
      await reviewPromise;
    });

    expect(result.current.state).toEqual({
      changeProjection: null,
      error: null,
      errorCode: null,
      phase: 'idle',
      reviewSnapshot: null,
      view: null,
    });
  });

  it('surfaces a non-transition migration boundary without calling Decide or a removed commit path', async () => {
    vi.mocked(reviewWorkspaceTransition).mockRejectedValue(
      new ApiError('LEGACY_HEAD_READ_ONLY', 'Legacy heads are read-only')
    );
    const { result } = renderHook(() => useWorkspaceTransition(candidate));

    await act(async () => {
      await result.current.review(content);
    });

    expect(result.current.state.errorCode).toBe('LEGACY_HEAD_READ_ONLY');
    expect(result.current.state.error).toMatch(/explicit migration/i);
    expect(decideWorkspaceTransition).not.toHaveBeenCalled();
  });
});
