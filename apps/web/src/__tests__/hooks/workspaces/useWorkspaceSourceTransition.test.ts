// @vitest-environment jsdom

import type { TransitionViewV1 } from '@t3x-dev/core';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceSourceTransition } from '@/hooks/workspaces/useWorkspaceSourceTransition';
import {
  reviewWorkspaceSourceRevert,
  reviewWorkspaceSourceTransition,
  saveWorkspaceDraft,
} from '@/queries/workspaces';
import { WORKSPACE_SOURCE_ARTIFACT_FORMAT, type WorkspaceCandidate } from '@/types/workspaces';
import { cleanupRoots, renderHook } from '../renderHook';

vi.mock('@/queries/workspaces', () => ({
  reviewWorkspaceSourceRevert: vi.fn(),
  reviewWorkspaceSourceTransition: vi.fn(),
  saveWorkspaceDraft: vi.fn(),
}));

const digest = (value: string) => `sha256:${value.repeat(64).slice(0, 64)}`;
const transitionId = `trn_${'2'.repeat(32)}`;
const snapshotId = `rvs_${'3'.repeat(32)}`;

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

function transitionView(): Extract<TransitionViewV1, { mode: 'transition' }> {
  return {
    mode: 'transition',
    decision: { observation: 'not_supplied' },
    history: { observation: 'not_committed' },
  } as Extract<TransitionViewV1, { mode: 'transition' }>;
}

function reviewArtifacts() {
  const review_snapshot = {
    schema: 't3x.application/review-snapshot/v1',
    version: 1,
    snapshotId,
    snapshotDigest: digest('s'),
    projectId: 'proj_1',
    workspaceId: 'workspace_esphome',
    transitionId,
    request: { kind: 'exact_source_edit', id: 'request_1', createdAt: '2026-01-01T00:00:00.000Z' },
    review: {
      digest: digest('r'),
      precondition: {
        workspaceRevision: 7,
        refName: 'main',
        refHead: digest('a'),
        effectDigest: digest('c'),
        proposalDigest: digest('d'),
        statementDigests: [digest('e')],
        policyDigest: digest('f'),
      },
    },
  };
  return {
    review_snapshot,
    change_projection: {
      schema: 't3x.application/change-projection/v1',
      version: 1,
      authoritative: false,
      status: 'reviewing',
      source: {
        kind: 'review_snapshot',
        snapshotId,
        snapshotDigest: digest('s'),
        snapshotCreatedAt: '2026-01-01T00:00:00.000Z',
      },
      title: 'ESPHome configuration change',
    },
  } as const;
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
      transition: transitionView(),
      precondition,
      runner: { mode: 'statement', statementDigest: digest('1'), outcome: 'passed' },
      ...reviewArtifacts(),
    });
    vi.mocked(reviewWorkspaceSourceRevert).mockResolvedValue({
      transition_id: transitionId,
      transition: transitionView(),
      precondition,
      runner: { mode: 'statement', statementDigest: digest('1'), outcome: 'passed' },
      ...reviewArtifacts(),
    });
  });

  afterEach(() => cleanupRoots());

  it('persists the source selector before Review and exposes the immutable Changes handoff', async () => {
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
    expect(result.current.state).toMatchObject({
      phase: 'reviewed',
      reviewSnapshot: { snapshotId },
      changeProjection: { status: 'reviewing' },
      runner: { mode: 'statement', outcome: 'passed' },
      task: 'change',
    });
  });

  it('saves before revert Review and exposes the same Changes handoff', async () => {
    const commitId = digest('8');
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
    expect(result.current.state).toMatchObject({
      phase: 'reviewed',
      reviewSnapshot: { snapshotId },
      changeProjection: { status: 'reviewing' },
      task: 'revert',
    });
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
});
