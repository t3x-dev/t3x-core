// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import RepositoryPage from '@/app/[owner]/[repository]/[[...repoPath]]/page';
import RepositoryLayout from '@/app/[owner]/[repository]/layout';
import OwnerPage from '@/app/[owner]/page';
import { type ProjectSummary, useProjectStore } from '@/store/projectStore';

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  resolveObject: vi.fn(),
  replace: vi.fn(),
  listBranches: vi.fn(),
  fetchProject: vi.fn(),
  fetchProjectWorkspaces: vi.fn(),
  params: { owner: 'alice', repoPath: ['Repo'] } as { owner: string; repoPath: string[] },
  pathname: null as string | null,
  query: 'workspace=w&conversation=c&pr=9',
}));
const router = { replace: mocks.replace };
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_HTTP_ERROR_FALLBACK;404');
  },
  useParams: () => ({
    owner: mocks.params.owner,
    repository: mocks.params.repoPath[0],
    repoPath: mocks.params.repoPath.slice(1),
  }),
  usePathname: () => mocks.pathname ?? `/${mocks.params.owner}/${mocks.params.repoPath.join('/')}`,
  useSearchParams: () => new URLSearchParams(mocks.query),
  useRouter: () => router,
}));
vi.mock('@/queries/project', () => ({ fetchProject: mocks.fetchProject }));
vi.mock('@/queries/projects', () => ({
  resolveRepository: (...args: unknown[]) => mocks.resolve(...args),
}));
vi.mock('@/infrastructure/branches', () => ({
  createBranch: vi.fn(),
  listBranches: mocks.listBranches,
}));
vi.mock('@/queries/workspaces', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/queries/workspaces')>()),
  fetchProjectWorkspaces: mocks.fetchProjectWorkspaces,
}));
vi.mock('@/queries/repositoryObjectAddresses', () => ({
  getRepositoryObjectAddress: mocks.resolveObject,
}));
vi.mock('@/app/project/[projectId]/page', async () => {
  const { useRepositoryProjectDetail } = await import('@/components/project/ProjectDetailContext');
  const { useRepositoryViewData } = await import('@/components/project/RepositoryRouteContext');

  function ViewData({ projectId }: { projectId: string }) {
    const { project } = useRepositoryProjectDetail(projectId);
    const { branches, workspaces } = useRepositoryViewData(projectId);
    return (
      <output data-testid="view-data" data-project={project?.name}>
        {branches.branches.join(',')}{' '}
        {workspaces.workspaces.map((workspace) => workspace.id).join(',')}
      </output>
    );
  }

  return {
    ProjectDetailPageContent: ({
      projectIdOverride,
      ownerSlugOverride,
      initialTabOverride,
      commitAddress,
      fixedReview,
      workspaceBranch,
    }: {
      projectIdOverride: string;
      ownerSlugOverride: string;
      initialTabOverride: string;
      commitAddress?: { id: string; number: string };
      fixedReview?: { workspaceId: string; snapshotId: string; number: string };
      workspaceBranch?: string;
    }) => (
      <div data-testid="detail">
        {projectIdOverride} {ownerSlugOverride} {initialTabOverride}
        {workspaceBranch && ` branch=${workspaceBranch}`}
        {commitAddress && ` commit=${commitAddress.id}`}
        {fixedReview && ` review=${fixedReview.snapshotId} workspace=${fixedReview.workspaceId}`}
        {(initialTabOverride === 'state' || initialTabOverride === 'schemas') && (
          <ViewData projectId={projectIdOverride} />
        )}
      </div>
    ),
  };
});
vi.mock('@/components/project/RepositoryNestedPage', () => ({
  RepositoryNestedPage: ({ projectId, segments }: { projectId: string; segments: string[] }) => (
    <div data-testid="nested">
      {projectId} {segments.join('/')}
    </div>
  ),
}));
vi.mock('@/components/project/ProjectDirectoryPage', () => ({
  ProjectDirectoryPage: () => <div>Directory</div>,
}));
vi.mock('@/components/project/NewRepositoryPage', () => ({
  NewRepositoryPage: () => <div>New repository</div>,
}));
vi.mock('@/components/project/OrganizationSettingsPage', () => ({
  OrganizationSettingsPage: () => <div>Organization settings</div>,
}));
function OwnerRepoProjectPage() {
  return (
    <RepositoryLayout>
      <RepositoryPage key={mocks.params.repoPath.join('/')} />
    </RepositoryLayout>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('WebSocket', undefined);
  mocks.listBranches.mockResolvedValue({
    branches: ['main', 'feature/release', 'feature/100%'].map((name) => ({ name })),
  });
  mocks.fetchProjectWorkspaces.mockResolvedValue([]);
  mocks.fetchProject.mockResolvedValue({
    project_id: 'proj_outside_list',
    name: 'Repository details',
    created_at: '2026-01-01T00:00:00Z',
    visibility: 'private',
  });
  useProjectStore.setState({ projects: [], details: {} });
  mocks.params = { owner: 'alice', repoPath: ['Repo'] };
  mocks.pathname = null;
  mocks.query = 'workspace=w&conversation=c&pr=9';
  window.location.hash = '';
  mocks.resolve.mockResolvedValue({
    project_id: 'proj_outside_list',
    namespace: 'alice',
    name: 'Repo',
    canonical_path: '/alice/Repo',
    path_status: 'ready',
    redirect: false,
  });
});
afterEach(() => vi.unstubAllGlobals());

it('reuses the verified address, project details and in-flight view reads when the Schema page mounts', async () => {
  mocks.query = '';
  let completeBranches!: (value: { branches: { name: string }[] }) => void;
  let completeWorkspaces!: (value: { id: string }[]) => void;
  mocks.listBranches.mockReturnValue(
    new Promise((resolve) => {
      completeBranches = resolve;
    })
  );
  mocks.fetchProjectWorkspaces.mockReturnValue(
    new Promise((resolve) => {
      completeWorkspaces = resolve;
    })
  );
  const view = render(<OwnerRepoProjectPage />);
  await screen.findByText('Loading branch…');
  await waitFor(() => {
    expect(mocks.listBranches).toHaveBeenCalledOnce();
    expect(mocks.fetchProjectWorkspaces).toHaveBeenCalledOnce();
  });
  await act(async () => completeBranches({ branches: [{ name: 'main' }] }));
  expect(screen.getByTestId('detail')).toHaveTextContent('proj_outside_list alice state');

  mocks.params.repoPath = ['Repo', 'branches', 'main', 'schemas'];
  view.rerender(<OwnerRepoProjectPage />);

  expect(screen.getByTestId('detail')).toHaveTextContent('proj_outside_list alice schemas');
  expect(mocks.resolve).toHaveBeenCalledOnce();
  expect(mocks.fetchProject).toHaveBeenCalledExactlyOnceWith('proj_outside_list');
  expect(screen.getByTestId('view-data')).toHaveAttribute('data-project', 'Repository details');
  expect(mocks.listBranches).toHaveBeenCalledOnce();
  expect(mocks.fetchProjectWorkspaces).toHaveBeenCalledOnce();
  await act(async () => {
    completeWorkspaces([{ id: 'main-draft' }]);
  });
  expect(screen.getByTestId('view-data')).toHaveTextContent('main main-draft');
});

it('checks the new repository before rendering its content', async () => {
  const view = render(<OwnerRepoProjectPage />);
  expect(await screen.findByTestId('detail')).toHaveTextContent('proj_outside_list');
  mocks.resolve.mockRejectedValueOnce(Object.assign(new Error('No access'), { code: 'FORBIDDEN' }));
  mocks.params.repoPath = ['Other', 'schemas'];
  view.rerender(<OwnerRepoProjectPage />);
  expect(screen.queryByTestId('detail')).not.toBeInTheDocument();
  expect(await screen.findByText('Repository unavailable')).toBeInTheDocument();
  expect(mocks.resolve).toHaveBeenLastCalledWith('alice', 'Other');
});
it('resolves directly, without any list cache or pagination', async () => {
  mocks.params.repoPath = ['Repo'];
  render(<OwnerRepoProjectPage />);
  expect(await screen.findByTestId('detail')).toHaveTextContent('proj_outside_list alice state');
  expect(mocks.resolve).toHaveBeenCalledWith('alice', 'Repo');
  expect(mocks.replace).not.toHaveBeenCalled();
});
it('opens a branch Workspace from a single encoded path segment', async () => {
  mocks.params.repoPath = ['Repo', 'branches', 'feature/release', 'workspaces'];
  mocks.pathname = '/alice/Repo/branches/feature%2Frelease/workspaces';
  mocks.query = 'workspaceMode=review&reviewPane=yaml';
  render(<OwnerRepoProjectPage />);
  expect(await screen.findByTestId('detail')).toHaveTextContent(
    'workspaces branch=feature/release'
  );
  expect(mocks.replace).not.toHaveBeenCalled();
});

it('passes the exact stored object behind a numbered Review address to the review page', async () => {
  const id = `rvs_${'2'.repeat(32)}`;
  mocks.params.repoPath = ['Repo', 'reviews', '17'];
  mocks.query = 'reviewPane=yaml';
  mocks.resolveObject.mockResolvedValueOnce({
    id,
    number: '17',
    workspaceId: 'workspace_branch:main',
  });
  render(<OwnerRepoProjectPage />);
  expect(await screen.findByTestId('detail')).toHaveTextContent(
    `workspaces review=${id} workspace=workspace_branch:main`
  );
  expect(mocks.resolveObject).toHaveBeenCalledWith('proj_outside_list', 'review', '17');
});

it('does not convert a legacy fixed Review to another Workspace', async () => {
  const id = `rvs_${'3'.repeat(32)}`;
  mocks.params.repoPath = ['Repo', 'workspaces'];
  mocks.query = new URLSearchParams({ workspace: 'wrong', reviewSnapshot: id }).toString();
  mocks.resolveObject.mockResolvedValueOnce({ id, number: '17', workspaceId: 'expected' });
  render(<OwnerRepoProjectPage />);
  await waitFor(() =>
    expect(mocks.resolveObject).toHaveBeenCalledWith('proj_outside_list', 'review', id)
  );
  expect(mocks.replace).not.toHaveBeenCalled();
});
it('canonicalizes historical/case addresses preserving child and query context', async () => {
  mocks.params = { owner: 'ALICE', repoPath: ['Old', 'pull-requests'] };
  window.location.hash = '#discussion';
  render(<OwnerRepoProjectPage />);
  await waitFor(() =>
    expect(mocks.replace).toHaveBeenCalledWith(
      '/alice/Repo/pull-requests?workspace=w&conversation=c&pr=9#discussion',
      { scroll: false }
    )
  );
});
it('keeps an explicit section when a legacy tab parameter disagrees', async () => {
  mocks.params.repoPath = ['Repo', 'schemas'];
  mocks.query = 'tab=workspaces&branch=feature%2Frelease&workspace=ws%3Amain';
  window.location.hash = '#fields';
  const { rerender } = render(<OwnerRepoProjectPage />);
  await waitFor(() =>
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(
      '/alice/Repo/branches/feature%2Frelease/schemas?workspace=ws%3Amain#fields',
      { scroll: false }
    )
  );
  expect(screen.queryByTestId('detail')).not.toBeInTheDocument();
  mocks.params.repoPath = ['Repo', 'branches', 'feature/release', 'schemas'];
  mocks.pathname = '/alice/Repo/branches/feature%2Frelease/schemas';
  mocks.query = 'workspace=ws%3Amain';
  rerender(<OwnerRepoProjectPage />);
  expect(await screen.findByTestId('detail')).toHaveTextContent('schemas');
  expect(mocks.replace).toHaveBeenCalledTimes(1);
});

it('opens the pull requests route generated by repository navigation', async () => {
  mocks.params.repoPath = ['Repo', 'pull-requests'];
  render(<OwnerRepoProjectPage />);
  expect(await screen.findByTestId('detail')).toHaveTextContent('proj_outside_list alice reviews');
  expect(screen.queryByText('Repository view not found')).not.toBeInTheDocument();
  expect(mocks.replace).not.toHaveBeenCalled();
});
it.each([
  'schemas',
  'discover',
  'browse',
])('opens the canonical %s route without a redirect', async (view) => {
  mocks.params.repoPath = ['Repo', 'branches', 'feature/release', view];
  mocks.pathname = `/alice/Repo/branches/feature%2Frelease/${view}`;
  mocks.query = 'workspace=workspace_branch%3Afeature%2Frelease';
  render(<OwnerRepoProjectPage />);
  expect(await screen.findByTestId('detail')).toHaveTextContent(`proj_outside_list alice ${view}`);
  expect(screen.queryByText('Repository view not found')).not.toBeInTheDocument();
  expect(mocks.replace).not.toHaveBeenCalled();
});
it.each([
  { schemaView: 'discover', view: 'discover', retainedView: null },
  { schemaView: 'browse', view: 'browse', retainedView: null },
  { schemaView: 'active', view: 'schemas', retainedView: 'active' },
  { schemaView: 'release', view: 'browse', retainedView: 'release' },
])('migrates a historical Schemas $schemaView address and then settles', async ({
  schemaView,
  view,
  retainedView,
}) => {
  mocks.params = { owner: 'ALICE', repoPath: ['Old', 'schemas'] };
  const context =
    'branch=feature%2Frelease&workspace=workspace_branch%3Afeature%2Frelease&q=dog+care&catalogName=team%2Fschema&catalogVersion=1.2.3&catalogHash=sha256%3Aabc';
  mocks.query = `schemaView=${schemaView}&${context}`;
  window.location.hash = '#definition';
  const expectedQuery = `${retainedView ? `schemaView=${retainedView}&` : ''}${context.replace('branch=feature%2Frelease&', '')}`;
  const { rerender } = render(<OwnerRepoProjectPage />);
  await waitFor(() =>
    expect(mocks.replace).toHaveBeenCalledWith(
      `/alice/Repo/branches/feature%2Frelease/${view}?${expectedQuery}#definition`,
      {
        scroll: false,
      }
    )
  );

  mocks.replace.mockClear();
  mocks.params = { owner: 'alice', repoPath: ['Repo', 'branches', 'feature/release', view] };
  mocks.pathname = `/alice/Repo/branches/feature%2Frelease/${view}`;
  mocks.query = expectedQuery;
  rerender(<OwnerRepoProjectPage />);
  expect(await screen.findByTestId('detail')).toHaveTextContent(`proj_outside_list alice ${view}`);
  expect(mocks.replace).not.toHaveBeenCalled();
});
it('canonicalizes pull request query links while preserving the selected PR and branch', async () => {
  mocks.query = 'tab=pull-requests&branch=feature%2Frelease&pr=9';
  render(<OwnerRepoProjectPage />);
  await waitFor(() =>
    expect(mocks.replace).toHaveBeenCalledWith('/alice/Repo/pull-requests?pr=9', { scroll: false })
  );
});
it('uses the namespace returned by the backend after a transfer', async () => {
  mocks.resolve.mockResolvedValue({
    project_id: 'moved',
    namespace: 'bob',
    name: 'Repo',
    canonical_path: '/bob/Repo',
    path_status: 'ready',
    redirect: true,
  });
  render(<OwnerRepoProjectPage />);
  await waitFor(() =>
    expect(mocks.replace).toHaveBeenCalledWith('/bob/Repo?workspace=w&conversation=c&pr=9', {
      scroll: false,
    })
  );
});
it('forwards a legacy Settings return source and fragment to the resolved Settings page', async () => {
  mocks.params.repoPath = ['Old', 'settings'];
  mocks.query = 'returnTo=%2Falice%2FRepo%2Fcommunity';
  window.location.hash = '#autopilot';
  render(<OwnerRepoProjectPage />);
  await waitFor(() =>
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(
      '/alice/Repo/settings?returnTo=%2Falice%2FRepo%2Fcommunity#autopilot',
      { scroll: false }
    )
  );
});

it('opens canonical settings and nested changes without bouncing to an ID URL', async () => {
  mocks.params.repoPath = ['Repo', 'settings'];
  render(<OwnerRepoProjectPage />);
  expect(await screen.findByTestId('nested')).toHaveTextContent('proj_outside_list settings');
  expect(mocks.replace).not.toHaveBeenCalled();
});
it.each([
  'history',
  'diff',
])('keeps %s under State while loading and opens its nested route', async (view) => {
  mocks.params.repoPath = ['Repo', 'branches', 'feature/release', view];
  mocks.pathname = `/alice/Repo/branches/feature%2Frelease/${view}`;
  mocks.query = 'commit=sha256%3Aabc&view=list';
  useProjectStore.setState({
    projects: [
      {
        id: 'proj_outside_list',
        name: 'Repo',
        canonical_path: '/alice/Repo',
        namespace: 'alice',
        status: 'active',
      } as ProjectSummary,
    ],
  });
  let resolveAddress!: (value: unknown) => void;
  mocks.resolve.mockReturnValue(
    new Promise((resolve) => {
      resolveAddress = resolve;
    })
  );
  render(<OwnerRepoProjectPage />);
  expect(screen.getByRole('link', { name: 'State' })).toHaveAttribute('aria-current', 'page');
  await act(async () =>
    resolveAddress({
      project_id: 'proj_outside_list',
      namespace: 'alice',
      name: 'Repo',
      canonical_path: '/alice/Repo',
      path_status: 'ready',
      redirect: false,
    })
  );
  expect(await screen.findByTestId('nested')).toHaveTextContent(`proj_outside_list ${view}`);
  expect(mocks.replace).not.toHaveBeenCalled();
});
it('canonicalizes History bookmarks without losing filters or nested return context', async () => {
  const context = new URLSearchParams({
    branch: 'feature/100%',
    commit: 'sha256:abc',
    view: 'list',
    q: 'retry payment',
    author: 'Maya Chen',
    returnTo: '/alice/Repo/community?branch=feature%2F100%25',
  }).toString();
  mocks.query = `tab=history&${context}`;
  window.location.hash = '#changes';
  render(<OwnerRepoProjectPage />);
  await waitFor(() =>
    expect(mocks.replace).toHaveBeenCalledWith(
      `/alice/Repo/branches/feature%2F100%25/history?${context.replace('branch=feature%2F100%25&', '')}#changes`,
      {
        scroll: false,
      }
    )
  );
});
it.each([
  'workspace_branch:main',
  'workspace_branch%3Amain',
])('keeps the canonical review URL stable when route params contain %s', async (workspaceId) => {
  mocks.params.repoPath = ['Repo', 'changes', workspaceId, 'rvs_review'];
  mocks.pathname = '/alice/Repo/changes/workspace_branch%3Amain/rvs_review';
  const { rerender } = render(<OwnerRepoProjectPage />);
  expect(await screen.findByTestId('nested')).toHaveTextContent(
    `changes/${workspaceId}/rvs_review`
  );
  expect(mocks.replace).not.toHaveBeenCalled();
  rerender(<OwnerRepoProjectPage />);
  expect(mocks.replace).not.toHaveBeenCalled();
});
it('preserves encoded review identifiers across a repository rename and then stops redirecting', async () => {
  const workspaceId = 'workspace_branch%3Afeature%2F100%25';
  mocks.params = { owner: 'ALICE', repoPath: ['Old', 'changes', workspaceId, 'rvs_review'] };
  mocks.pathname = `/ALICE/Old/changes/${workspaceId}/rvs_review`;
  mocks.query = 'branch=feature%2F100%25&returnTo=%2Falice%2FOld';
  window.location.hash = '#checks';
  const { rerender } = render(<OwnerRepoProjectPage />);
  await waitFor(() =>
    expect(mocks.replace).toHaveBeenCalledWith(
      `/alice/Repo/changes/${workspaceId}/rvs_review?returnTo=%2Falice%2FOld#checks`,
      { scroll: false }
    )
  );
  mocks.replace.mockClear();
  mocks.params = { owner: 'alice', repoPath: ['Repo', 'changes', workspaceId, 'rvs_review'] };
  mocks.pathname = `/alice/Repo/changes/${workspaceId}/rvs_review`;
  mocks.query = 'returnTo=%2Falice%2FOld';
  rerender(<OwnerRepoProjectPage />);
  expect(await screen.findByTestId('nested')).toHaveTextContent(
    `changes/${workspaceId}/rvs_review`
  );
  expect(mocks.replace).not.toHaveBeenCalled();
});
it.each([
  ['workspace_branch%3Amain', 'workspace_branch%3Amain'],
  ['workspace_branch:main', 'workspace_branch%3Amain'],
  ['workspace_branch:feature/owner', 'workspace_branch%3Afeature%2Fowner'],
  ['workspace_branch:feature%2Fowner', 'workspace_branch%3Afeature%252Fowner'],
  ['workspace_branch%3A100%25', 'workspace_branch%3A100%25'],
  ['workspace_branch:计划', 'workspace_branch%3A%E8%AE%A1%E5%88%92'],
  ['workspace_branch%2525253Amain', 'workspace_branch%2525253Amain'],
])('keeps an encoded review URL stable with route param %s', async (workspaceId, pathSegment) => {
  mocks.params.repoPath = ['Repo', 'changes', workspaceId, 'rvs_snapshot'];
  mocks.pathname = `/alice/Repo/changes/${pathSegment}/rvs_snapshot`;
  const view = render(<OwnerRepoProjectPage />);
  expect(await screen.findByTestId('nested')).toHaveTextContent(
    `proj_outside_list changes/${workspaceId}/rvs_snapshot`
  );
  view.rerender(<OwnerRepoProjectPage />);
  expect(mocks.replace).not.toHaveBeenCalled();
});
it('redirects an encoded review URL only once when its repository address changes', async () => {
  mocks.params = {
    owner: 'ALICE',
    repoPath: ['Old', 'changes', 'workspace_branch%3Afeature%252Fowner', 'rvs_snapshot'],
  };
  mocks.pathname = '/ALICE/Old/changes/workspace_branch%3Afeature%252Fowner/rvs_snapshot';
  window.location.hash = '#diff';
  const view = render(<OwnerRepoProjectPage />);
  await waitFor(() =>
    expect(mocks.replace).toHaveBeenCalledWith(
      '/alice/Repo/changes/workspace_branch%3Afeature%252Fowner/rvs_snapshot?workspace=w&conversation=c&pr=9#diff',
      { scroll: false }
    )
  );
  mocks.params = {
    ...mocks.params,
    owner: 'alice',
    repoPath: ['Repo', ...mocks.params.repoPath.slice(1)],
  };
  mocks.pathname = '/alice/Repo/changes/workspace_branch%3Afeature%252Fowner/rvs_snapshot';
  view.rerender(<OwnerRepoProjectPage />);
  await waitFor(() => expect(mocks.resolve).toHaveBeenLastCalledWith('alice', 'Repo'));
  expect(await screen.findByTestId('nested')).toBeInTheDocument();
  expect(mocks.replace).toHaveBeenCalledTimes(1);
});
it('does not guess a page for unsupported suffixes', async () => {
  mocks.params.repoPath = ['Repo', 'changes', 'missing-snapshot'];
  render(<OwnerRepoProjectPage />);
  expect(await screen.findByText('Repository view not found')).toBeInTheDocument();
  expect(mocks.replace).not.toHaveBeenCalled();
});
it('shows authorization failures without rendering cached repository content', async () => {
  mocks.resolve.mockRejectedValue(new Error('Access denied'));
  render(<OwnerRepoProjectPage />);
  expect(await screen.findByText('Access denied')).toBeInTheDocument();
  expect(screen.queryByTestId('detail')).not.toBeInTheDocument();
});
it('keeps the known header while checking access without exposing the review early', async () => {
  mocks.params.repoPath = ['Repo', 'changes', 'workspace_branch%3Amain', 'rvs_review'];
  let rejectLookup!: (error: Error) => void;
  mocks.resolve.mockReturnValue(
    new Promise((_, reject) => {
      rejectLookup = reject;
    })
  );
  useProjectStore.setState({
    details: {
      proj_outside_list: {
        id: 'proj_outside_list',
        name: 'Repo',
        namespace: 'alice',
        canonical_path: '/alice/Repo',
      } as ProjectSummary,
    },
  });
  render(<OwnerRepoProjectPage />);
  expect(screen.getByRole('heading', { name: 'Repo', exact: true })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Workspace' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByText('Loading repository...')).toBeInTheDocument();
  expect(screen.queryByTestId('nested')).not.toBeInTheDocument();
  await act(async () => rejectLookup(new Error('Access denied')));
  expect(await screen.findByText('Access denied')).toBeInTheDocument();
  expect(screen.queryByTestId('nested')).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Repo', exact: true })).not.toBeInTheDocument();
});
it('leaves namespace directory and new-repository routes out of repository resolution', () => {
  const directory = render(<OwnerPage />);
  expect(screen.getByText('Directory')).toBeInTheDocument();
  directory.unmount();
  mocks.params.repoPath = ['new'];
  render(<OwnerRepoProjectPage />);
  expect(screen.getByText('New repository')).toBeInTheDocument();
  expect(mocks.resolve).not.toHaveBeenCalled();
});

it.each([
  { segments: ['outputs'], query: '' },
  { segments: ['leaf', 'old'], query: '' },
  { segments: [], query: 'tab=outputs&leaf=old' },
])('returns not found for retired repository view $segments $query', ({ segments, query }) => {
  mocks.params.repoPath = ['Repo', ...segments];
  mocks.query = query;
  expect(() => render(<OwnerRepoProjectPage />)).toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
  expect(mocks.replace).not.toHaveBeenCalled();
  expect(mocks.resolve).not.toHaveBeenCalled();
});

it('rejects an unknown branch without rendering State or falling back to main', async () => {
  mocks.params.repoPath = ['Repo', 'branches', 'missing', 'schemas'];
  mocks.query = '';
  render(<OwnerRepoProjectPage />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Branch missing was not found');
  expect(screen.queryByTestId('detail')).not.toBeInTheDocument();
  expect(mocks.replace).not.toHaveBeenCalled();
});
it('waits for the branch inventory before mounting a branch page', async () => {
  mocks.params.repoPath = ['Repo'];
  mocks.query = '';
  let completeBranches!: (value: { branches: { name: string }[] }) => void;
  mocks.listBranches.mockReturnValue(
    new Promise((resolve) => {
      completeBranches = resolve;
    })
  );
  render(<OwnerRepoProjectPage />);
  await screen.findByText('Loading branch…');
  expect(screen.queryByTestId('detail')).not.toBeInTheDocument();
  await act(async () => completeBranches({ branches: [{ name: 'main' }] }));
  expect(await screen.findByTestId('detail')).toHaveTextContent('state');
});
it('uses the path branch and retains the view and fragment when a query disagrees', async () => {
  mocks.params.repoPath = ['Repo', 'branches', 'feature/release'];
  mocks.pathname = '/alice/Repo/branches/feature%2Frelease';
  mocks.query = 'branch=main&view=structure';
  window.location.hash = '#field';
  render(<OwnerRepoProjectPage />);
  await waitFor(() =>
    expect(mocks.replace).toHaveBeenCalledWith(
      '/alice/Repo/branches/feature%2Frelease?view=structure#field',
      { scroll: false }
    )
  );
});

it('shortens an explicit main State path while retaining view and fragment', async () => {
  mocks.params.repoPath = ['Repo', 'branches', 'main'];
  mocks.query = 'branch=feature%2Frelease&view=structure';
  window.location.hash = '#field';
  render(<OwnerRepoProjectPage />);
  await waitFor(() =>
    expect(mocks.replace).toHaveBeenCalledWith('/alice/Repo?view=structure#field', {
      scroll: false,
    })
  );
});
it('does not treat a missing main branch as empty State on the short address', async () => {
  mocks.params.repoPath = ['Repo'];
  mocks.listBranches.mockResolvedValue({ branches: [{ name: 'feature/release' }] });
  mocks.query = '';
  render(<OwnerRepoProjectPage />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Branch main was not found');
  expect(screen.queryByTestId('detail')).not.toBeInTheDocument();
  expect(mocks.replace).not.toHaveBeenCalled();
});
