// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceChangeReviewPage } from '@/components/workspaces/WorkspaceChangeReviewPage';
import { useReviewedFieldChanges } from '@/hooks/workspaces/useReviewedFieldChanges';
import { useWorkspaceReviewSnapshot } from '@/hooks/workspaces/useWorkspaceReviewSnapshot';

const replace = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

vi.mock('@/hooks/workspaces/useWorkspaceReviewSnapshot', () => ({
  useWorkspaceReviewSnapshot: vi.fn(),
}));

vi.mock('@/hooks/workspaces/useReviewedFieldChanges', () => ({
  useReviewedFieldChanges: vi.fn(() => [
    {
      id: 'release',
      label: 'Reduce device log volume',
      breadcrumb: null,
      kind: 'changed',
      fields: [{ name: 'Title', before: null, after: 'Reduce device log volume', kind: 'added' }],
    },
  ]),
}));

vi.mock('@/components/workspaces/TransitionReviewPanel', () => ({
  TransitionAuditDetails: ({
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

vi.mock('@/components/workspaces/ChangeReviewChanges', () => ({
  ChangeReviewChanges: () => <section aria-label="Changes" />,
}));

vi.mock('@/components/workspaces/ChangeDecisionPanel', () => ({
  ChangeDecisionPanel: ({
    onDecide,
    commitBlocker,
  }: {
    onDecide: (outcome: 'accepted' | 'overridden' | 'rejected', reason?: string) => void;
    commitBlocker?: string;
  }) => (
    <button
      disabled={Boolean(commitBlocker)}
      title={commitBlocker}
      onClick={() => onDecide('accepted')}
      type="button"
    >
      Approve and commit
    </button>
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
      review: { precondition: { refName: 'feature/release', workspaceRevision: 3 } },
      transition: {
        mode: 'transition',
        checks: { validation: { runs: [] } },
        change: { operations: [{ op: 'set' }, { op: 'set' }] },
        claims: {
          intent: { mode: 'authored', value: 'Cut log noise' },
          rationale: { mode: 'unspecified' },
        },
      },
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

  it('loads a stored ReviewSnapshot into the Changes decision view', async () => {
    const decide = vi.fn();
    const load = vi.fn();
    vi.mocked(useWorkspaceReviewSnapshot).mockReturnValue({
      decide,
      load,
      overrideReason: '',
      setOverrideReason: vi.fn(),
      state: { data: snapshotResponse() as never, deciding: false, error: null, loading: false },
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
      '/project/proj_1?tab=workspaces&workspace=workspace_prd_handoff&workspaceMode=review&branch=feature%2Frelease'
    );
    expect(
      await screen.findByRole('heading', { name: 'Review Workspace change' })
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Snapshot panel' })).toHaveTextContent(
      'rvs_88888888888888888888888888888888'
    );
    const summary = screen.getByRole('region', { name: 'Change summary' });
    expect(summary).toHaveTextContent('Reduce device log volume');
    expect(summary).toHaveTextContent('1 field · 2 operations into feature/release');
    expect(summary).toHaveTextContent('Cut log noise');
    expect(useReviewedFieldChanges).toHaveBeenCalledWith('proj_1', 'workspace_prd_handoff', 3);
    fireEvent.click(screen.getByRole('button', { name: 'Approve and commit' }));
    expect(decide).toHaveBeenCalledWith('accepted', undefined);
    expect(useWorkspaceReviewSnapshot).toHaveBeenCalledWith(
      'proj_1',
      'workspace_prd_handoff',
      'rvs_88888888888888888888888888888888'
    );
  });

  it('refreshes the same immutable snapshot explicitly', async () => {
    const load = vi.fn();
    vi.mocked(useWorkspaceReviewSnapshot).mockReturnValue({
      decide: vi.fn(),
      load,
      overrideReason: '',
      setOverrideReason: vi.fn(),
      state: { data: snapshotResponse() as never, deciding: false, error: null, loading: false },
    });

    render(
      <WorkspaceChangeReviewPage
        projectId="proj_1"
        snapshotId="rvs_88888888888888888888888888888888"
        workspaceId="workspace_prd_handoff"
      />
    );

    await screen.findByRole('heading', { name: 'Review Workspace change' });
    fireEvent.click(screen.getByRole('button', { name: /Refresh/ }));
    await waitFor(() => expect(load).toHaveBeenCalledOnce());
  });
});

it('links the exact committed State and replaces the obsolete pre-decision snapshot URL', () => {
  const data = snapshotResponse();
  data.snapshot.snapshotId = 'rvs_committed';
  Object.assign(data.snapshot, { objects: { commit: { digest: 'sha256:committed' } } });
  vi.mocked(useWorkspaceReviewSnapshot).mockReturnValue({
    decide: vi.fn(),
    load: vi.fn(),
    overrideReason: '',
    setOverrideReason: vi.fn(),
    state: { data: data as never, deciding: false, error: null, loading: false },
  });
  render(
    <WorkspaceChangeReviewPage
      projectId="proj_1"
      workspaceId="workspace_prd_handoff"
      snapshotId="rvs_old"
    />
  );
  expect(screen.getByRole('link', { name: 'View State & export' })).toHaveAttribute(
    'href',
    '/project/proj_1?branch=feature%2Frelease&commit=sha256%3Acommitted&view=overview'
  );
  expect(replace).toHaveBeenCalledWith(
    '/project/proj_1/changes/workspace_prd_handoff/rvs_committed'
  );
});

it('keeps the complete frozen Schema and content visible without loading a newer Draft for comparison', () => {
  const data = snapshotResponse();
  Object.assign(data, {
    schema_review: {
      schema: 't3x.application/workspace-schema-review/v1',
      base: { status: 'unbound', schemaHash: null, definition: null, bindings: [] },
      draft: {
        status: 'bound',
        schemaHash: `sha256:${'a'.repeat(64)}`,
        definition: { nodes: { advantage: {} } },
        bindings: [],
      },
      actionCount: 2,
      changes: [{ kind: 'ADD', path: 'nodes.advantage', summary: 'Contract path added.' }],
      baseContent: {},
      draftContent: { title: 'Frozen complete Draft' },
    },
  });
  vi.mocked(useWorkspaceReviewSnapshot).mockReturnValue({
    decide: vi.fn(),
    load: vi.fn(),
    overrideReason: '',
    setOverrideReason: vi.fn(),
    state: { data: data as never, deciding: false, loading: false, error: null },
  });
  render(
    <WorkspaceChangeReviewPage
      projectId="proj_1"
      workspaceId="workspace_prd_handoff"
      snapshotId={data.snapshot_id}
    />
  );
  expect(screen.getByRole('button', { name: 'Approve and commit' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Approve and commit' })).toHaveAttribute(
    'title',
    expect.stringContaining('no conclusive validation result')
  );
  expect(screen.getByText('ADD nodes.advantage')).toBeInTheDocument();
  expect(
    screen.getByRole('region', { name: 'Complete Draft content', hidden: true })
  ).toHaveTextContent('Frozen complete Draft');
  expect(useReviewedFieldChanges).toHaveBeenLastCalledWith(
    'proj_1',
    'workspace_prd_handoff',
    undefined
  );
});
