// @vitest-environment jsdom

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

describe('useWorkspaceTransition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(saveWorkspaceDraft).mockResolvedValue({
      candidate_id: 'candidate:workspace_prd_handoff',
      workspace: { ...candidate, revision: 7 },
    });
    vi.mocked(reviewWorkspaceTransition).mockResolvedValue({
      transition: transitionView('pending'),
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
      transition: transitionView('committed'),
      precondition,
      decision_digest: digest('f'),
      commit: {},
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

    let commitId: string | null = null;
    await act(async () => {
      commitId = await result.current.decide('accepted');
    });

    expect(decideWorkspaceTransition).toHaveBeenCalledWith('proj_1', 'workspace_prd_handoff', {
      content,
      why: 'Keep the audience current.',
      outcome: 'accepted',
      decisionReason: undefined,
      precondition,
    });
    expect(commitId).toBe(digest('e'));
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
      transition: transitionView('rejected'),
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
      resolveReview({ transition: transitionView('pending'), precondition });
      await reviewPromise;
    });

    expect(result.current.state).toEqual({
      error: null,
      errorCode: null,
      phase: 'idle',
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
