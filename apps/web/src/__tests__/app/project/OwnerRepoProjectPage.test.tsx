// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import OwnerRepoProjectPage from '@/app/[owner]/[[...repoPath]]/page';

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  replace: vi.fn(),
  params: { owner: 'alice', repoPath: ['Repo'] } as { owner: string; repoPath: string[] },
  query: 'workspace=w&conversation=c&branch=main&pr=9',
}));
vi.mock('next/navigation', () => ({
  useParams: () => mocks.params,
  usePathname: () => `/${mocks.params.owner}/${mocks.params.repoPath.join('/')}`,
  useSearchParams: () => new URLSearchParams(mocks.query),
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock('@/queries/projects', () => ({
  resolveRepository: (...args: unknown[]) => mocks.resolve(...args),
}));
vi.mock('@/app/project/[projectId]/page', () => ({
  ProjectDetailPageContent: ({
    projectIdOverride,
    ownerSlugOverride,
    initialTabOverride,
  }: {
    projectIdOverride: string;
    ownerSlugOverride: string;
    initialTabOverride: string;
  }) => (
    <div data-testid="detail">
      {projectIdOverride} {ownerSlugOverride} {initialTabOverride}
    </div>
  ),
}));
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
beforeEach(() => {
  vi.clearAllMocks();
  mocks.params = { owner: 'alice', repoPath: ['Repo'] };
  mocks.resolve.mockResolvedValue({
    project_id: 'proj_outside_list',
    namespace: 'alice',
    name: 'Repo',
    canonical_path: '/alice/Repo',
    path_status: 'ready',
    redirect: false,
  });
});
it('resolves directly, without any list cache or pagination', async () => {
  render(<OwnerRepoProjectPage />);
  expect(await screen.findByTestId('detail')).toHaveTextContent('proj_outside_list alice state');
  expect(mocks.resolve).toHaveBeenCalledWith('alice', 'Repo');
  expect(mocks.replace).not.toHaveBeenCalled();
});
it('canonicalizes historical/case addresses preserving child and query context', async () => {
  mocks.params = { owner: 'ALICE', repoPath: ['Old', 'reviews'] };
  render(<OwnerRepoProjectPage />);
  await waitFor(() =>
    expect(mocks.replace).toHaveBeenCalledWith(
      '/alice/Repo/reviews?workspace=w&conversation=c&branch=main&pr=9',
      { scroll: false }
    )
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
  expect(await screen.findByTestId('detail')).toHaveTextContent('moved bob');
  expect(mocks.replace).toHaveBeenCalledWith(
    '/bob/Repo?workspace=w&conversation=c&branch=main&pr=9',
    { scroll: false }
  );
});
it('opens canonical settings and nested changes without bouncing to an ID URL', async () => {
  mocks.params.repoPath = ['Repo', 'settings'];
  render(<OwnerRepoProjectPage />);
  expect(await screen.findByTestId('nested')).toHaveTextContent('proj_outside_list settings');
  expect(mocks.replace).not.toHaveBeenCalled();
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
it('leaves namespace directory and new-repository routes out of repository resolution', () => {
  mocks.params.repoPath = ['new'];
  render(<OwnerRepoProjectPage />);
  expect(screen.getByText('New repository')).toBeInTheDocument();
  expect(mocks.resolve).not.toHaveBeenCalled();
});
