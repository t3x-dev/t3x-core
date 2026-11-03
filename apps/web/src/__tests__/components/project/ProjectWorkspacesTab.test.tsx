// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectWorkspacesTab } from '@/components/project/ProjectWorkspacesTab';
import type { WorkspaceWorkbench } from '@/components/workspaces/WorkspaceWorkbench';
import { getProjectWorkspaceStarterCandidate } from '@/data/workspaceCandidates';
import type { WorkspaceCandidate } from '@/types/workspaces';

const mocks = vi.hoisted(() => ({
  query: 'tab=workspaces',
  workspaces: [] as WorkspaceCandidate[],
  branchHeads: { main: null } as Record<string, string | null>,
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn().mockResolvedValue(undefined),
  create: vi.fn().mockResolvedValue({ name: 'feature/new' }),
  props: {} as ComponentProps<typeof WorkspaceWorkbench>,
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/project/proj_test',
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(mocks.query),
}));
vi.mock('@/components/workspaces/WorkspaceSnapshotReview', () => ({
  WorkspaceSnapshotReview: ({
    snapshotId,
    workspaceId,
  }: {
    snapshotId: string;
    workspaceId: string;
  }) => (
    <section aria-label="Fixed review">
      {workspaceId} · {snapshotId}
    </section>
  ),
}));
vi.mock('@/hooks/materials/useProjectMaterials', () => ({
  useProjectMaterials: () => ({ materials: [], refresh: mocks.refresh }),
}));
vi.mock('@/hooks/shared/useBranches', () => ({
  useBranches: () => ({
    branchHeads: mocks.branchHeads,
    branches: Object.keys(mocks.branchHeads),
    loading: false,
    refresh: mocks.refresh,
    create: mocks.create,
  }),
}));
vi.mock('@/hooks/workspaces/useProjectWorkspaces', () => ({
  useProjectWorkspaces: () => ({
    workspaces: mocks.workspaces,
    loading: false,
    error: null,
    refresh: mocks.refresh,
  }),
}));
vi.mock('@/components/workspaces/WorkspaceWorkbench', () => ({
  WorkspaceWorkbench: (props: ComponentProps<typeof WorkspaceWorkbench>) => {
    mocks.props = props;
    return (
      <button
        type="button"
        onClick={() => props.onViewCommitInState?.('sha256:saved', 'feature/test')}
      >
        View State
      </button>
    );
  },
}));
function draft(id: string, branch = 'main'): WorkspaceCandidate {
  return {
    ...getProjectWorkspaceStarterCandidate('proj_test'),
    id,
    title: id,
    targetBranch: branch,
    revision: 4,
  };
}
describe('ProjectWorkspacesTab navigation and persisted drafts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query = 'tab=workspaces';
    mocks.workspaces = [];
    mocks.branchHeads = { main: null };
  });
  it('starts with a clean draft and exposes branch options to Compose', () => {
    render(<ProjectWorkspacesTab projectId="proj_test" />);
    expect(mocks.props.candidates[0]).toMatchObject({
      projectId: 'proj_test',
      targetBranch: 'main',
      yopsDraft: { operations: [] },
      schemaBindings: [],
    });
    expect(mocks.props.branchOptions).toEqual(['main']);
  });
  it('preserves the explicitly requested draft when several share a branch', () => {
    mocks.workspaces = [draft('first'), draft('requested')];
    mocks.query = 'tab=workspaces&branch=main&workspace=requested';
    render(<ProjectWorkspacesTab projectId="proj_test" />);
    expect(mocks.props.selectedWorkspaceId).toBe('requested');
    expect(mocks.props.candidates).toHaveLength(1);
    expect(mocks.props.candidates[0]).toMatchObject({ id: 'requested', revision: 4 });
  });
  it('does not silently open another Workspace for a stale deep link', () => {
    mocks.workspaces = [draft('available')];
    mocks.query = 'tab=workspaces&workspace=missing';
    render(<ProjectWorkspacesTab projectId="proj_test" />);
    expect(mocks.props.viewState).toBe('error');
    expect(mocks.props.errorMessage).toContain('Workspace missing was not found');
  });
  it('does not silently switch the branch of an explicitly requested Workspace', () => {
    mocks.workspaces = [draft('requested', 'release')];
    mocks.branchHeads = { main: null, release: null };
    mocks.query = 'tab=workspaces&branch=main&workspace=requested';
    render(<ProjectWorkspacesTab projectId="proj_test" />);
    expect(mocks.props.viewState).toBe('error');
    expect(mocks.props.errorMessage).toContain('belongs to release, not main');
  });
  it('keeps persisted unbound drafts unbound', () => {
    mocks.workspaces = [draft('persisted')];
    mocks.query = 'tab=workspaces&workspace=persisted';
    render(<ProjectWorkspacesTab projectId="proj_test" />);
    expect(
      mocks.props.candidates.find((item: WorkspaceCandidate) => item.id === 'persisted')
    ).toMatchObject({ schemaBindings: [], title: 'persisted' });
  });
  it('starts the next draft from the advanced main HEAD', () => {
    mocks.branchHeads = { main: 'sha256:advanced' };
    mocks.workspaces = [
      { ...draft('committed'), status: 'committed', lastCommitHash: 'sha256:previous' },
    ];
    mocks.query = 'tab=workspaces&branch=main';
    render(<ProjectWorkspacesTab projectId="proj_test" />);
    expect(mocks.props.candidates[0]).toMatchObject({
      status: 'draft',
      baseCommitHash: 'sha256:advanced',
      yopsDraft: { operations: [] },
    });
  });
  it('opens the exact committed revision and branch in State', () => {
    render(<ProjectWorkspacesTab projectId="proj_test" />);
    fireEvent.click(screen.getByRole('button', { name: 'View State' }));
    const url = new URL(mocks.push.mock.calls[0]![0], 'http://localhost:3000');
    expect(url.pathname).toBe('/project/proj_test');
    expect(url.searchParams.get('commit')).toBe('sha256:saved');
    expect(url.searchParams.get('branch')).toBe('feature/test');
  });
});

it('loads an exact historical snapshot without mounting the live authoring workbench', () => {
  mocks.query = 'tab=workspaces&workspace=ws%3Amain&workspaceMode=review&reviewSnapshot=rvs_old';
  render(<ProjectWorkspacesTab projectId="proj_test" />);
  expect(screen.getByRole('region', { name: 'Fixed review' })).toHaveTextContent(
    'ws:main · rvs_old'
  );
  expect(screen.queryByRole('button', { name: 'View State' })).not.toBeInTheDocument();
});
it('does not silently fall back to a mutable draft for a malformed snapshot link', () => {
  mocks.query = 'tab=workspaces&reviewSnapshot=rvs_old';
  render(<ProjectWorkspacesTab projectId="proj_test" />);
  expect(screen.getByRole('alert')).toHaveTextContent('Workspace ID is required');
  expect(screen.queryByRole('button', { name: 'View State' })).not.toBeInTheDocument();
});

it('redirects a legacy Checks pane for a fixed snapshot to its exact check details', () => {
  mocks.query =
    'tab=workspaces&workspace=ws%3Amain&workspaceMode=review&reviewSnapshot=rvs_saved&reviewPane=checks';
  render(<ProjectWorkspacesTab projectId="proj_test" />);
  const href = new URL(mocks.replace.mock.calls.at(-1)![0], 'http://localhost');
  expect(href.pathname).toBe('/project/proj_test/checks/review%3Arvs_saved');
  const back = new URL(href.searchParams.get('returnTo')!, 'http://localhost');
  expect(back.searchParams.get('reviewSnapshot')).toBe('rvs_saved');
  expect(back.searchParams.has('reviewPane')).toBe(false);
});

it('creates from the selected branch and stays in Workspace with a fresh workspace selection', async () => {
  mocks.query = 'tab=workspaces&branch=main&workspace=old&workspaceMode=compose';
  render(<ProjectWorkspacesTab projectId="proj_test" />);
  await mocks.props.onCreateWorkspaceBranch?.('feature/new', 'main');
  expect(mocks.create).toHaveBeenCalledWith('feature/new', 'main');
  const url = new URL(mocks.replace.mock.calls.at(-1)![0], 'http://local');
  expect(url.searchParams.get('branch')).toBe('feature/new');
  expect(url.searchParams.has('workspace')).toBe(false);
  expect(url.searchParams.get('workspaceMode')).toBe('compose');
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe('Workspace branch navigation ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query = 'tab=workspaces&branch=main';
    mocks.workspaces = [draft('main-draft'), draft('release-draft', 'release')];
    mocks.branchHeads = { main: null, release: null };
    mocks.create.mockResolvedValue({ name: 'feature/new' });
    mocks.refresh.mockResolvedValue(undefined);
  });

  it.each([
    'route',
    'project',
    'unmount',
    'return',
  ] as const)('ignores branch creation after a %s context change', async (change) => {
    const creation = deferred<{ name: string }>();
    mocks.create.mockReturnValueOnce(creation.promise);
    const view = render(<ProjectWorkspacesTab projectId="proj_test" />);
    const pending = mocks.props.onCreateWorkspaceBranch!('feature/new', 'main');
    if (change === 'unmount') view.unmount();
    else if (change === 'project') view.rerender(<ProjectWorkspacesTab projectId="other" />);
    else {
      mocks.query = 'tab=workspaces&branch=release';
      view.rerender(<ProjectWorkspacesTab projectId="proj_test" />);
      if (change === 'return') {
        mocks.query = 'tab=workspaces&branch=main';
        view.rerender(<ProjectWorkspacesTab projectId="proj_test" />);
      }
    }
    await act(async () => {
      creation.resolve({ name: 'feature/new' });
      await pending;
    });
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('does not navigate if the context changes while creation refreshes its workspace', async () => {
    const refresh = deferred<void>();
    mocks.refresh.mockReturnValueOnce(refresh.promise);
    const view = render(<ProjectWorkspacesTab projectId="proj_test" />);
    let pending: Promise<void>;
    await act(async () => {
      pending = mocks.props.onCreateWorkspaceBranch!('feature/new', 'main');
      await Promise.resolve();
    });
    mocks.query = 'tab=workspaces&branch=release';
    view.rerender(<ProjectWorkspacesTab projectId="proj_test" />);
    await act(async () => {
      refresh.resolve();
      await pending;
    });
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('honors the latest branch choice when refreshes finish out of order', async () => {
    const first = deferred<void>();
    mocks.refresh.mockReturnValueOnce(first.promise);
    render(<ProjectWorkspacesTab projectId="proj_test" />);
    const pending = mocks.props.onWorkspaceBranchChange!('release');
    await act(async () => {
      await mocks.props.onWorkspaceBranchChange!('main');
    });
    expect(mocks.replace).toHaveBeenCalledTimes(1);
    expect(mocks.replace.mock.calls[0][0]).toContain('branch=main');
    await act(async () => {
      first.resolve();
      await pending;
    });
    expect(mocks.replace).toHaveBeenCalledTimes(1);
  });

  it('does not follow a creation response after a newer branch choice', async () => {
    const creation = deferred<{ name: string }>();
    mocks.create.mockReturnValueOnce(creation.promise);
    render(<ProjectWorkspacesTab projectId="proj_test" />);
    const pending = mocks.props.onCreateWorkspaceBranch!('feature/new', 'main');
    await act(async () => {
      await mocks.props.onWorkspaceBranchChange!('release');
    });
    await act(async () => {
      creation.resolve({ name: 'feature/new' });
      await pending;
    });
    expect(mocks.replace).toHaveBeenCalledTimes(1);
    expect(mocks.replace.mock.calls[0][0]).toContain('branch=release');
  });
});

it('rechecks newly unsaved edits after branch creation and guards a deferred final redirect', async () => {
  mocks.query = 'tab=workspaces&branch=main';
  mocks.workspaces = [draft('main-draft'), draft('release-draft', 'release')];
  mocks.create.mockResolvedValue({ name: 'feature/new' });
  mocks.refresh.mockResolvedValue(undefined);
  mocks.replace.mockClear();
  let navigate: (() => void) | undefined;
  const guard = vi.fn((next: () => void) => {
    navigate = next;
  });
  const view = render(<ProjectWorkspacesTab projectId="proj_test" />);
  await act(async () => {
    await mocks.props.onCreateWorkspaceBranch!('feature/new', 'main', guard);
  });
  expect(guard).toHaveBeenCalledTimes(1);
  expect(mocks.replace).not.toHaveBeenCalled();
  mocks.query = 'tab=workspaces&branch=release';
  view.rerender(<ProjectWorkspacesTab projectId="proj_test" />);
  act(() => navigate?.());
  expect(mocks.replace).not.toHaveBeenCalled();
});

it('refuses a stale branch creation callback before sending a request', async () => {
  mocks.query = 'tab=workspaces&branch=main';
  mocks.create.mockClear();
  mocks.refresh.mockClear();
  const view = render(<ProjectWorkspacesTab projectId="proj_test" />);
  const create = mocks.props.onCreateWorkspaceBranch!;
  mocks.query = 'tab=workspaces&branch=release';
  view.rerender(<ProjectWorkspacesTab projectId="proj_test" />);
  await act(async () => {
    await create('feature/new', 'main');
  });
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
});
