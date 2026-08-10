// @vitest-environment jsdom

import type { TransitionViewV1 } from '@t3x-dev/core';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceSourceTransition } from '@/hooks/workspaces/useWorkspaceSourceTransition';
import { ApiError } from '@/infrastructure/core';
import {
  decideWorkspaceSourceRevert,
  decideWorkspaceSourceTransition,
  reviewWorkspaceSourceRevert,
  reviewWorkspaceSourceTransition,
  saveWorkspaceDraft,
} from '@/queries/workspaces';
import { WORKSPACE_SOURCE_ARTIFACT_FORMAT, type WorkspaceCandidate } from '@/types/workspaces';
import { cleanupRoots, renderHook } from '../renderHook';

vi.mock('@/queries/workspaces', () => ({
  decideWorkspaceSourceRevert: vi.fn(),
  decideWorkspaceSourceTransition: vi.fn(),
  reviewWorkspaceSourceRevert: vi.fn(),
  reviewWorkspaceSourceTransition: vi.fn(),
  saveWorkspaceDraft: vi.fn(),
}));

const digest = (value: string) => `sha256:${value.repeat(64).slice(0, 64)}`;
const transitionId = `trn_${'2'.repeat(32)}`;

const candidate = {
  id: 'workspace_esphome',
  revision: 6,
  projectId: 'proj_1',
  title: 'ESPHome configuration',
  targetBranch: 'main',
  sourceArtifact: {
    format: WORKSPACE_SOURCE_ARTIFACT_FORMAT,
    rootPath: 'device.yaml',
    root: { materialId: 'mat_root', contentHash: 'hash:root' },
    resources: [],
  },
} as unknown as WorkspaceCandidate;

const change = {
  mode: 'edit' as const,
  operations: [
    {
      op: 'replace_scalar' as const,
      path: ['logger', 'level'],
      expect: 'DEBUG',
      value: 'INFO',
    },
  ],
};

const precondition = {
  workspace_revision: 7,
  ref_head: digest('a'),
  source_selector_digest: digest('b'),
  source_input_manifest_digest: null,
  effect_digest: digest('c'),
  proposal_digest: digest('d'),
  statement_digests: [digest('e')],
  policy_digest: digest('f'),
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
        ? { observation: 'committed', commit: { id: digest('9') } }
        : { observation: 'not_committed' },
  } as Extract<TransitionViewV1, { mode: 'transition' }>;
}

describe('useWorkspaceSourceTransition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(saveWorkspaceDraft).mockResolvedValue({
      candidate_id: 'candidate:workspace_esphome',
      workspace: { ...candidate, revision: 7 },
    });
    vi.mocked(reviewWorkspaceSourceTransition).mockResolvedValue({
      transition_id: transitionId,
      transition: transitionView('pending'),
      precondition,
      runner: { mode: 'statement', statementDigest: digest('1'), outcome: 'passed' },
    });
    vi.mocked(reviewWorkspaceSourceRevert).mockResolvedValue({
      transition_id: transitionId,
      transition: transitionView('pending'),
      precondition,
      runner: { mode: 'statement', statementDigest: digest('1'), outcome: 'passed' },
    });
  });

  afterEach(() => cleanupRoots());

  it('persists the source selector before Review and decides only the bound session', async () => {
    const commitCreated = vi.fn();
    window.addEventListener('t3x:commit-created', commitCreated);
    vi.mocked(decideWorkspaceSourceTransition).mockResolvedValue({
      transition_id: transitionId,
      transition: transitionView('committed'),
      precondition,
      runner: { mode: 'statement', statementDigest: digest('1'), outcome: 'passed' },
      decision_digest: digest('2'),
      commit: {},
      workspace: { ...candidate, revision: 8, status: 'committed', lastCommitHash: digest('9') },
    });
    const { result } = renderHook(() => useWorkspaceSourceTransition(candidate));

    await act(async () => {
      await result.current.review(change, '  Reduce production log volume.  ');
    });

    expect(saveWorkspaceDraft).toHaveBeenCalledWith('proj_1', 'workspace_esphome', candidate);
    expect(reviewWorkspaceSourceTransition).toHaveBeenCalledWith('proj_1', 'workspace_esphome', {
      artifact: candidate.sourceArtifact,
      change,
      why: 'Reduce production log volume.',
      ifRevision: 7,
    });
    expect(vi.mocked(saveWorkspaceDraft).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(reviewWorkspaceSourceTransition).mock.invocationCallOrder[0]!
    );
    expect(result.current.state.runner).toMatchObject({ mode: 'statement', outcome: 'passed' });

    await act(async () => {
      await result.current.decide('accepted');
    });

    expect(decideWorkspaceSourceTransition).toHaveBeenCalledWith('proj_1', 'workspace_esphome', {
      transitionId,
      artifact: candidate.sourceArtifact,
      change,
      why: 'Reduce production log volume.',
      outcome: 'accepted',
      decisionReason: undefined,
      precondition,
    });
    expect(commitCreated).toHaveBeenCalledOnce();
    window.removeEventListener('t3x:commit-created', commitCreated);
  });

  it('retains rejection without emitting a commit event', async () => {
    const commitCreated = vi.fn();
    window.addEventListener('t3x:commit-created', commitCreated);
    vi.mocked(decideWorkspaceSourceTransition).mockResolvedValue({
      transition_id: transitionId,
      transition: transitionView('rejected'),
      precondition,
      runner: { mode: 'not_configured' },
      decision_digest: digest('3'),
    });
    const { result } = renderHook(() => useWorkspaceSourceTransition(candidate));

    await act(async () => {
      await result.current.review(change);
      await result.current.decide('rejected');
    });

    expect(result.current.state.phase).toBe('rejected');
    expect(result.current.state.view).toEqual(transitionView('rejected'));
    expect(commitCreated).not.toHaveBeenCalled();
    window.removeEventListener('t3x:commit-created', commitCreated);
  });

  it('requires a reason for override and clears a stale review session', async () => {
    const { result } = renderHook(() => useWorkspaceSourceTransition(candidate));
    await act(async () => {
      await result.current.review(change);
      await result.current.decide('overridden', '   ');
    });
    expect(decideWorkspaceSourceTransition).not.toHaveBeenCalled();
    expect(result.current.state.errorCode).toBe('OVERRIDE_REASON_REQUIRED');

    vi.mocked(decideWorkspaceSourceTransition).mockRejectedValue(
      new ApiError('STALE_REVIEW', 'Workspace or ref facts changed; review again.')
    );
    await act(async () => {
      await result.current.decide('accepted');
    });
    expect(result.current.state.errorCode).toBe('STALE_REVIEW');
    expect(result.current.state.view).toBeNull();

    await act(async () => {
      await result.current.decide('accepted');
    });
    expect(decideWorkspaceSourceTransition).toHaveBeenCalledOnce();
    expect(result.current.state.errorCode).toBe('REVIEW_REQUIRED');
  });

  it('refuses Review when no root Material is selected', async () => {
    const { result } = renderHook(() =>
      useWorkspaceSourceTransition({ ...candidate, sourceArtifact: undefined })
    );
    await act(async () => {
      await result.current.review(change);
    });
    expect(saveWorkspaceDraft).not.toHaveBeenCalled();
    expect(reviewWorkspaceSourceTransition).not.toHaveBeenCalled();
    expect(result.current.state.errorCode).toBe('SOURCE_ROOT_REQUIRED');
  });

  it('saves before revert Review and decides only the commit-bound opaque session', async () => {
    const commitId = digest('8');
    vi.mocked(decideWorkspaceSourceRevert).mockResolvedValue({
      transition_id: transitionId,
      transition: transitionView('committed'),
      precondition,
      runner: { mode: 'statement', statementDigest: digest('1'), outcome: 'passed' },
      decision_digest: digest('2'),
      commit: {},
      workspace: { ...candidate, revision: 8, status: 'committed', lastCommitHash: digest('9') },
    });
    const { result } = renderHook(() => useWorkspaceSourceTransition(candidate));

    await act(async () => {
      await result.current.reviewRevert(commitId, '  Restore the previous configuration.  ');
    });

    expect(saveWorkspaceDraft).toHaveBeenCalledWith('proj_1', 'workspace_esphome', candidate);
    expect(reviewWorkspaceSourceRevert).toHaveBeenCalledWith('proj_1', 'workspace_esphome', {
      commitId,
      why: 'Restore the previous configuration.',
      ifRevision: 7,
    });
    expect(vi.mocked(saveWorkspaceDraft).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(reviewWorkspaceSourceRevert).mock.invocationCallOrder[0]!
    );
    expect(result.current.state.task).toBe('revert');

    await act(async () => {
      await result.current.decide('accepted');
    });

    expect(decideWorkspaceSourceRevert).toHaveBeenCalledWith('proj_1', 'workspace_esphome', {
      transitionId,
      commitId,
      why: 'Restore the previous configuration.',
      outcome: 'accepted',
      decisionReason: undefined,
      precondition,
    });
    expect(decideWorkspaceSourceTransition).not.toHaveBeenCalled();
  });

  it('clears a stale revert Review so it cannot be retried as authority', async () => {
    vi.mocked(decideWorkspaceSourceRevert).mockRejectedValue(
      new ApiError('STALE_REVIEW', 'Workspace or ref facts changed; review again.')
    );
    const { result } = renderHook(() => useWorkspaceSourceTransition(candidate));
    await act(async () => {
      await result.current.reviewRevert(digest('8'));
      await result.current.decide('accepted');
    });
    expect(result.current.state).toMatchObject({
      errorCode: 'STALE_REVIEW',
      phase: 'idle',
      task: null,
      view: null,
    });

    await act(async () => {
      await result.current.decide('accepted');
    });
    expect(decideWorkspaceSourceRevert).toHaveBeenCalledOnce();
    expect(result.current.state.errorCode).toBe('REVIEW_REQUIRED');
  });
});
