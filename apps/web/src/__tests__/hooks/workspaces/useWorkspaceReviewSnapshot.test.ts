// @vitest-environment jsdom

import { waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceReviewSnapshot } from '@/hooks/workspaces/useWorkspaceReviewSnapshot';
import { fetchWorkspaceTransitionReviewSnapshot } from '@/queries/workspaces';
import { cleanupRoots, renderHook } from '../renderHook';

vi.mock('@/queries/workspaces', () => ({
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
});
