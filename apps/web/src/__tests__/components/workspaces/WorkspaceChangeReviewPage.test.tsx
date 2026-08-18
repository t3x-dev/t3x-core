// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceChangeReviewPage } from '@/components/workspaces/WorkspaceChangeReviewPage';
import { useWorkspaceReviewSnapshot } from '@/hooks/workspaces/useWorkspaceReviewSnapshot';

vi.mock('@/hooks/workspaces/useWorkspaceReviewSnapshot', () => ({
  useWorkspaceReviewSnapshot: vi.fn(),
}));

vi.mock('@/components/workspaces/TransitionReviewPanel', () => ({
  TransitionReviewPanel: ({
    changeProjection,
    reviewSnapshot,
  }: {
    changeProjection: { title?: string } | null;
    reviewSnapshot: { snapshotId?: string } | null;
  }) => (
    <section aria-label="Snapshot panel">
      {reviewSnapshot?.snapshotId} · {changeProjection?.title}
    </section>
  ),
}));

function snapshotResponse() {
  return {
    snapshot_id: 'rvs_88888888888888888888888888888888',
    snapshot_digest: `sha256:${'8'.repeat(64)}`,
    project_id: 'proj_1',
    workspace_id: 'workspace_prd_handoff',
    transition_id: `trn_${'1'.repeat(32)}`,
    review_digest: `sha256:${'9'.repeat(64)}`,
    supersedes_snapshot_id: null,
    supersedes_snapshot_digest: null,
    snapshot: {
      schema: 't3x.application/review-snapshot/v1',
      version: 1,
      snapshotId: 'rvs_88888888888888888888888888888888',
      snapshotDigest: `sha256:${'8'.repeat(64)}`,
      createdAt: '2026-08-17T00:00:00.000Z',
      projectId: 'proj_1',
      workspaceId: 'workspace_prd_handoff',
      transitionId: `trn_${'1'.repeat(32)}`,
      transition: { mode: 'transition' },
    },
    change_projection: {
      schema: 't3x.application/change-projection/v1',
      version: 1,
      authoritative: false,
      source: {
        kind: 'review_snapshot',
        snapshotId: 'rvs_88888888888888888888888888888888',
        snapshotDigest: `sha256:${'8'.repeat(64)}`,
        snapshotCreatedAt: '2026-08-17T00:00:00.000Z',
      },
      projectId: 'proj_1',
      workspaceId: 'workspace_prd_handoff',
      transitionId: `trn_${'1'.repeat(32)}`,
      title: 'Reduce device log volume',
      status: 'reviewing',
    },
    created_at: '2026-08-17T00:00:00.000Z',
  };
}

describe('WorkspaceChangeReviewPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads a stored ReviewSnapshot into the read-only Changes view', async () => {
    const load = vi.fn();
    vi.mocked(useWorkspaceReviewSnapshot).mockReturnValue({
      load,
      state: { data: snapshotResponse() as never, error: null, loading: false },
    });

    render(
      <WorkspaceChangeReviewPage
        projectId="proj_1"
        snapshotId="rvs_88888888888888888888888888888888"
        workspaceId="workspace_prd_handoff"
      />
    );

    expect(screen.getByRole('link', { name: 'Workspace' })).toHaveAttribute(
      'href',
      '/project/proj_1/workspaces?tab=workspaces&workspace=workspace_prd_handoff'
    );
    expect(await screen.findByText('Reduce device log volume')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Snapshot panel' })).toHaveTextContent(
      'rvs_88888888888888888888888888888888'
    );
    expect(useWorkspaceReviewSnapshot).toHaveBeenCalledWith(
      'proj_1',
      'workspace_prd_handoff',
      'rvs_88888888888888888888888888888888'
    );
  });

  it('refreshes the same immutable snapshot explicitly', async () => {
    const load = vi.fn();
    vi.mocked(useWorkspaceReviewSnapshot).mockReturnValue({
      load,
      state: { data: snapshotResponse() as never, error: null, loading: false },
    });

    render(
      <WorkspaceChangeReviewPage
        projectId="proj_1"
        snapshotId="rvs_88888888888888888888888888888888"
        workspaceId="workspace_prd_handoff"
      />
    );

    await screen.findByText('Reduce device log volume');
    fireEvent.click(screen.getByRole('button', { name: /Refresh/ }));
    await waitFor(() => expect(load).toHaveBeenCalledOnce());
  });
});
