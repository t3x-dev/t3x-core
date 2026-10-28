// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceSnapshotReview } from '@/components/workspaces/WorkspaceSnapshotReview';
import { useReviewedFieldChanges } from '@/hooks/workspaces/useReviewedFieldChanges';
import { useWorkspaceReviewSnapshot } from '@/hooks/workspaces/useWorkspaceReviewSnapshot';

const replace = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());
const route = vi.hoisted(() => ({ query: 'reviewPane=yaml' }));
beforeEach(() => {
  localStorage.clear();
  route.query = 'reviewPane=yaml';
});
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push }),
  useSearchParams: () => new URLSearchParams(route.query),
}));

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

vi.mock('@/components/workspaces/ChangeReviewChanges', () => ({
  ChangeReviewChanges: () => <section aria-label="Changes" />,
}));

vi.mock('@/components/workspaces/ChangeDecisionPanel', () => ({
  ChangeDecisionPanel: ({
    onDecide,
    commitBlocker,
    busy,
    checksHref,
  }: {
    onDecide: (outcome: 'accepted' | 'overridden' | 'rejected', reason?: string) => void;
    commitBlocker?: string;
    busy?: boolean;
    checksHref?: string;
  }) => (
    <>
      <a href={checksHref}>View run</a>
      <button
        disabled={Boolean(commitBlocker) || busy}
        title={commitBlocker}
        onClick={() => onDecide('accepted')}
        type="button"
      >
        Approve and commit
      </button>
    </>
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

describe('WorkspaceSnapshotReview', () => {
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
      <WorkspaceSnapshotReview
        projectId="proj_1"
        snapshotId="rvs_88888888888888888888888888888888"
        workspaceId="workspace_prd_handoff"
      />
    );

    expect(screen.getByRole('link', { name: 'Current draft' })).toHaveAttribute(
      'href',
      '/project/proj_1?tab=workspaces&workspace=workspace_prd_handoff&workspaceMode=review&branch=feature%2Frelease&reviewPane=yaml'
    );
    expect(await screen.findByRole('heading', { name: /^Review ·/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Review' })).toHaveAttribute('aria-selected', 'true');
    const checks = new URL(
      screen.getByRole('link', { name: 'View run' }).getAttribute('href')!,
      'http://localhost'
    );
    const back = new URL(checks.searchParams.get('returnTo')!, 'http://localhost');
    expect(back.searchParams.get('reviewSnapshot')).toBe('rvs_88888888888888888888888888888888');
    expect(back.searchParams.get('reviewPane')).toBe('yaml');
    const history = new URL(
      screen.getByRole('link', { name: 'View History' }).getAttribute('href')!,
      'http://localhost'
    );
    expect(history.pathname).toBe('/project/proj_1/history');
    expect(history.searchParams.get('branch')).toBe('feature/release');
    expect(history.searchParams.get('returnTo')).toBe(back.pathname + back.search);
    expect(decide).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('tab', { name: 'Compose' }));
    expect(push).toHaveBeenCalledWith(
      '/project/proj_1?tab=workspaces&workspace=workspace_prd_handoff&workspaceMode=compose&branch=feature%2Frelease'
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
      <WorkspaceSnapshotReview
        projectId="proj_1"
        snapshotId="rvs_88888888888888888888888888888888"
        workspaceId="workspace_prd_handoff"
      />
    );

    await screen.findByRole('heading', { name: /^Review ·/ });
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
    <WorkspaceSnapshotReview
      projectId="proj_1"
      workspaceId="workspace_prd_handoff"
      snapshotId="rvs_old"
    />
  );
  expect(screen.getByRole('link', { name: 'View State & export' })).toHaveAttribute(
    'href',
    '/project/proj_1?branch=feature%2Frelease&commit=sha256%3Acommitted&view=overview'
  );
  const delivery = new URL(
    screen.getByRole('link', { name: 'Open Delivery' }).getAttribute('href')!,
    'http://localhost'
  );
  expect(delivery.searchParams.get('workspaceTool')).toBe('delivery');
  expect(delivery.searchParams.get('returnTo')).toContain('reviewSnapshot=rvs_committed');
  const history = new URL(
    screen.getByRole('link', { name: 'View commit in History' }).getAttribute('href')!,
    'http://localhost'
  );
  expect(history.searchParams.get('commit')).toBe('sha256:committed');
  expect(replace).toHaveBeenCalledWith(
    '/project/proj_1?tab=workspaces&workspace=workspace_prd_handoff&workspaceMode=review&branch=feature%2Frelease&reviewSnapshot=rvs_committed&reviewPane=yaml',
    { scroll: false }
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
  const rendered = render(
    <WorkspaceSnapshotReview
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
  expect(screen.getByRole('region', { name: 'Reviewed Content' })).toHaveTextContent(
    'Frozen complete Draft'
  );
  fireEvent.click(screen.getByRole('button', { name: 'Schema', exact: true }));
  expect(screen.getByRole('region', { name: 'Reviewed Schema' })).toHaveTextContent('advantage');
  fireEvent.click(screen.getByRole('button', { name: 'Changes', exact: true }));
  route.query = 'reviewPane=changes';
  rendered.rerender(
    <WorkspaceSnapshotReview
      projectId="proj_1"
      workspaceId="workspace_prd_handoff"
      snapshotId={data.snapshot_id}
    />
  );
  expect(screen.getByText('ADD nodes.advantage')).toBeInTheDocument();
  expect(useReviewedFieldChanges).toHaveBeenLastCalledWith(
    'proj_1',
    'workspace_prd_handoff',
    undefined
  );
});

it('keeps recovery explicit on a stale decision and disables actions during refresh', () => {
  const data = snapshotResponse();
  vi.mocked(useWorkspaceReviewSnapshot).mockReturnValue({
    decide: vi.fn(),
    load: vi.fn(),
    overrideReason: '',
    setOverrideReason: vi.fn(),
    state: {
      data: data as never,
      deciding: false,
      loading: true,
      error: 'Workspace revision changed',
    },
  });
  render(
    <WorkspaceSnapshotReview
      projectId="proj_1"
      workspaceId="workspace_prd_handoff"
      snapshotId={data.snapshot_id}
    />
  );
  expect(screen.getByRole('alert')).toHaveTextContent('Workspace revision changed');
  expect(screen.getByRole('button', { name: 'Approve and commit' })).toBeDisabled();
  const recovery = new URL(
    screen
      .getByRole('link', { name: 'open the current draft and prepare a new review' })
      .getAttribute('href')!,
    'http://localhost'
  );
  expect(recovery.searchParams.get('workspace')).toBe('workspace_prd_handoff');
  expect(recovery.searchParams.has('reviewSnapshot')).toBe(false);
});

it('keeps Schema review and its decided snapshot in Schema while exposing the complete content scope', () => {
  const data = snapshotResponse();
  data.snapshot.snapshotId = 'rvs_schema_decided';
  Object.assign(data, {
    schema_review: {
      schema: 't3x.application/workspace-schema-review/v1',
      base: { status: 'unbound', schemaHash: null, definition: null, bindings: [] },
      draft: {
        status: 'bound',
        schemaHash: 'sha256:draft',
        definition: { nodes: { item: {} } },
        bindings: [],
      },
      changes: [{ kind: 'ADD', path: 'nodes.item', summary: 'Item added' }],
      actionCount: 2,
      contentValidation: 'not_applicable',
      baseContent: {},
      draftContent: { unrelated: 'Also in this decision' },
    },
  });
  const decide = vi.fn();
  vi.mocked(useWorkspaceReviewSnapshot).mockReturnValue({
    decide,
    load: vi.fn(),
    overrideReason: '',
    setOverrideReason: vi.fn(),
    state: { data: data as never, deciding: false, loading: false, error: null },
  });
  render(
    <WorkspaceSnapshotReview
      projectId="proj_1"
      workspaceId="workspace_prd_handoff"
      snapshotId="rvs_old"
      context="schema"
    />
  );
  expect(screen.getByRole('heading', { name: 'Review Schema changes' })).toBeVisible();
  expect(screen.getByText('This decision covers the complete Workspace Draft.')).toBeVisible();
  expect(screen.getByText('nodes.item')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /All content changes/ }));
  fireEvent.click(screen.getByText('Compare complete content'));
  expect(screen.getByText(/Also in this decision/)).toBeVisible();
  const destination = new URL(replace.mock.calls.at(-1)![0], 'http://local');
  expect(destination.searchParams.get('tab')).toBe('schemas');
  expect(destination.searchParams.get('schemaView')).toBe('review');
  expect(destination.searchParams.get('reviewSnapshot')).toBe('rvs_schema_decided');
  fireEvent.click(screen.getByRole('button', { name: 'Approve and commit' }));
  expect(decide).toHaveBeenCalledWith('accepted', undefined);
});

it('restores the same Workspace view preference in a snapshot and respects an explicit URL', () => {
  const data = snapshotResponse();
  const key = 't3x.workspace-view:proj_1:workspace_prd_handoff:review';
  localStorage.setItem(key, 'yaml');
  route.query = '';
  vi.mocked(useWorkspaceReviewSnapshot).mockReturnValue({
    decide: vi.fn(),
    load: vi.fn(),
    overrideReason: '',
    setOverrideReason: vi.fn(),
    state: { data: data as never, deciding: false, loading: false, error: null },
  });
  const ui = (
    <WorkspaceSnapshotReview
      projectId="proj_1"
      workspaceId="workspace_prd_handoff"
      snapshotId={data.snapshot_id}
    />
  );
  const rendered = render(ui);
  expect(screen.getByRole('button', { name: 'YAML', exact: true })).toHaveAttribute(
    'aria-current',
    'page'
  );
  route.query = 'reviewPane=changes';
  rendered.rerender(
    <WorkspaceSnapshotReview
      projectId="proj_1"
      workspaceId="workspace_prd_handoff"
      snapshotId={data.snapshot_id}
    />
  );
  expect(screen.getByRole('button', { name: 'Changes', exact: true })).toHaveAttribute(
    'aria-current',
    'page'
  );
  fireEvent.click(screen.getByRole('button', { name: 'Preview', exact: true }));
  expect(localStorage.getItem(key)).toBe('rendered');
  expect(replace).toHaveBeenLastCalledWith(expect.stringContaining('reviewPane=rendered'), {
    scroll: false,
  });
  rendered.unmount();
  route.query = '';
  render(ui);
  expect(screen.getByRole('button', { name: 'Preview', exact: true })).toHaveAttribute(
    'aria-current',
    'page'
  );
  expect(
    screen.getByText('The complete content is unavailable for this revision.')
  ).toBeInTheDocument();
});
