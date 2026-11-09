// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectDirectoryPage } from '@/components/project/ProjectDirectoryPage';
import { checkRepositoryName, fetchDeletedProjects } from '@/queries/projects';
import { useProjectStore } from '@/store/projectStore';
import type { Project } from '@/types/api';

vi.mock('@/queries/projects', () => ({
  checkRepositoryName: vi.fn(),
  fetchDeletedProjects: vi.fn(),
}));

const routerPush = vi.fn();
const selectNamespace = vi.fn();
let namespaceAccounts: Array<{ namespace: { slug: string; namespace_id: string } }> = [];
vi.mock('@/hooks/accounts/useNamespaceAccounts', () => ({
  useNamespaceAccounts: () => ({
    accounts: namespaceAccounts,
    activeAccount: namespaceAccounts[0] ?? null,
    selectNamespace,
  }),
}));

function selectOption(label: string, option: string) {
  fireEvent.keyDown(screen.getByRole('combobox', { name: label }), { key: 'Enter' });
  fireEvent.keyDown(screen.getByRole('option', { name: option, exact: true }), { key: 'Enter' });
}

function openActions(name = 'prd-workflow') {
  fireEvent.keyDown(screen.getByRole('button', { name: `Actions for ${name}` }), { key: 'Enter' });
}
const createProject = vi.fn();
const refreshProjects = vi.fn();
const removeProject = vi.fn();
const renameProject = vi.fn();
const useProjectsArgs = vi.fn();
let hookError: string | null = null;
let hookLoading = false;
let hookProjects: Project[] = [];
let currentPath = '/';
let currentQuery = '';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
  usePathname: () => currentPath,
  useSearchParams: () => new URLSearchParams(currentQuery),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    scroll: _scroll,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; scroll?: boolean }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/hooks/projects/useProjects', () => ({
  useProjects: (...args: unknown[]) => {
    useProjectsArgs(...args);
    return {
      create: createProject,
      error: hookError,
      loading: hookLoading,
      projects: hookProjects,
      refresh: refreshProjects,
      remove: removeProject,
      rename: renameProject,
    };
  },
}));

const projects: Project[] = [
  {
    project_id: 'proj_prd',
    name: 'prd-workflow',
    namespace: 't3x-dev',
    canonical_path: '/t3x-dev/prd-workflow',
    created_at: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    visibility: 'private',
    can_edit: true,
    can_delete: true,
    turns_count: 4,
    conversations_count: 1,
    commits_count: 1,
    branches_count: 1,
    outputs_count: 2,
    metadata: {
      description: 'PRD source review, YSchema validation, YOps commit, and output generation.',
    },
  },
  {
    project_id: 'proj_core',
    name: 't3x-core',
    namespace: 't3x-dev',
    canonical_path: '/t3x-dev/t3x-core',
    created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    visibility: 'private',
    can_edit: true,
    can_delete: true,
    turns_count: 12,
    conversations_count: 2,
    commits_count: 18,
    branches_count: 1,
    outputs_count: 0,
    metadata: {
      description: 'Version control for structured state.',
    },
  },
];

describe('ProjectDirectoryPage', () => {
  beforeEach(() => {
    vi.mocked(checkRepositoryName).mockReset();
    vi.mocked(fetchDeletedProjects)
      .mockReset()
      .mockResolvedValue({ projects: [], limit: 21, offset: 0 });
    currentPath = '/';
    currentQuery = '';
    routerPush.mockReset();
    selectNamespace.mockReset();
    namespaceAccounts = [];
    createProject.mockReset();
    refreshProjects.mockReset();
    removeProject.mockReset();
    renameProject.mockReset();
    useProjectsArgs.mockReset();
    window.localStorage.clear();
    hookError = null;
    hookLoading = false;
    hookProjects = projects;
    useProjectStore.setState({
      error: null,
      initialized: true,
      loading: false,
      projects: [],
      details: {},
    });
  });

  it('renders the organization-level repository directory as the app entrypoint', () => {
    currentPath = '/t3x-dev';
    render(<ProjectDirectoryPage />);

    expect(screen.getAllByText('t3x-dev')).toHaveLength(2);
    expect(screen.queryByRole('heading', { name: 'Recently opened' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Pinned repositories' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Repositories/ })).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Projects', current: 'page' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/settings?namespace=t3x-dev&returnTo=%2Ft3x-dev'
    );
    expect(screen.queryByRole('link', { name: 'Docs' })).not.toBeInTheDocument();
    const header = within(screen.getByRole('link', { name: 'T3X home' }).closest('header')!);
    expect(header.getByRole('link', { name: 'Discover' })).toHaveAttribute(
      'href',
      '/explore?view=discover'
    );
    expect(header.getByRole('link', { name: 'Browse' })).toHaveAttribute(
      'href',
      '/explore?view=browse'
    );
    expect(header.queryByRole('link', { name: 'New repository' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New repository' })).toHaveAttribute(
      'href',
      '/t3x-dev/new'
    );
    expect(screen.queryByText('hi@t3x.dev')).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /prd-workflow/i })[0]).toHaveAttribute(
      'href',
      '/t3x-dev/prd-workflow'
    );
    expect(screen.getByTitle('/t3x-dev/prd-workflow')).toHaveAttribute(
      'href',
      '/t3x-dev/prd-workflow'
    );
    expect(screen.queryByRole('link', { name: 'Chats' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Canvas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open navigation' })).not.toBeInTheDocument();
    expect(screen.queryByText('Type / to search t3x-dev')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Overview' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Status' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Schema' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Sort' })).not.toBeInTheDocument();
    expect(screen.queryByText('Project-first workbench')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Reviews' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Community' })).not.toBeInTheDocument();
    expect(screen.queryByText('People')).not.toBeInTheDocument();
    expect(screen.queryByText('Topics')).not.toBeInTheDocument();
    expect(screen.queryByText('Outputs 2')).not.toBeInTheDocument();
    expect(screen.getByText('18 commits')).toBeInTheDocument();
    expect(screen.getAllByText(/^Created /).length).toBe(projects.length);
    expect(screen.queryByText(/^Updated /)).not.toBeInTheDocument();
    expect(screen.queryByText('3 members')).not.toBeInTheDocument();
    expect(screen.queryByText('Outputs 19')).not.toBeInTheDocument();
    expect(screen.queryByText('YSchema pending')).not.toBeInTheDocument();
    expect(screen.queryByText('YSchema 3')).not.toBeInTheDocument();
  });

  it('renders a personal namespace directory with owner-scoped links', () => {
    hookProjects = projects.map((project) => ({
      ...project,
      namespace: 'lqw905',
      canonical_path: `/lqw905/${project.name}`,
    }));
    currentPath = '/lqw905';
    render(<ProjectDirectoryPage ownerSlug="lqw905" />);

    expect(screen.getAllByText('lqw905')).toHaveLength(2);
    expect(screen.queryByText('3 members')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/settings?namespace=lqw905&returnTo=%2Flqw905'
    );
    expect(screen.getAllByRole('link', { name: /prd-workflow/i })[0]).toHaveAttribute(
      'href',
      '/lqw905/prd-workflow'
    );
    expect(screen.getByTitle('/lqw905/prd-workflow')).toHaveAttribute(
      'href',
      '/lqw905/prd-workflow'
    );
    for (const link of screen.getAllByRole('link', { name: /new repository/i })) {
      expect(link).toHaveAttribute('href', '/lqw905/new');
    }
  });

  it('aggregates repositories the current user owns or can access', () => {
    namespaceAccounts = [{ namespace: { slug: 'test-b3', namespace_id: 'b3-id' } }];
    hookProjects = [
      {
        ...projects[0],
        namespace: 'test-b3',
        canonical_path: '/test-b3/prd-workflow',
      },
      {
        ...projects[1],
        namespace: 'test-a3',
        canonical_path: '/test-a3/t3x-core',
        can_edit: true,
        can_delete: false,
      },
    ];

    render(<ProjectDirectoryPage scope="accessible" />);

    expect(useProjectsArgs).toHaveBeenLastCalledWith(100, undefined, true);
    expect(screen.getByRole('heading', { name: /^Your repositories/ })).toBeInTheDocument();
    expect(screen.getByText('Owner: test-a3')).toBeInTheDocument();
    expect(screen.getByText('Editor access')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 't3x-core' })).toHaveAttribute(
      'href',
      '/test-a3/t3x-core'
    );
    expect(screen.getByRole('link', { name: 'New repository' })).toHaveAttribute(
      'href',
      '/test-b3/new'
    );
    expect(screen.queryByRole('link', { name: 'Deleted repositories' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Namespace' })).not.toBeInTheDocument();
    expect(selectNamespace).not.toHaveBeenCalled();

    const globalNavigation = within(screen.getByRole('navigation', { name: 'Global' }));
    expect(globalNavigation.getByRole('link', { name: 'Your repositories' })).toHaveAttribute(
      'href',
      '/repositories'
    );
    expect(globalNavigation.getByRole('link', { name: 'Your repositories' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it('shows recently opened repositories only from local recent-open state', () => {
    window.localStorage.setItem('t3x:recent-projects', JSON.stringify(['proj_core', 'proj_prd']));

    render(<ProjectDirectoryPage />);

    const recentSection = screen
      .getByRole('heading', { name: 'Recently opened' })
      .closest('section');
    expect(recentSection).not.toBeNull();

    const recentLinks = within(recentSection as HTMLElement).getAllByRole('link');
    expect(recentLinks[0]).toHaveAttribute('href', '/t3x-dev/t3x-core');
    expect(recentLinks[1]).toHaveAttribute('href', '/t3x-dev/prd-workflow');
  });

  it('filters project rows without leaving the directory', () => {
    render(<ProjectDirectoryPage />);

    const search = screen.getByRole('searchbox', { name: 'Find a repository' });
    fireEvent.change(search, { target: { value: 'core' } });

    expect(screen.getAllByRole('link', { name: /t3x-core/i })).toHaveLength(1);
    expect(screen.queryByRole('link', { name: /prd-workflow/i })).not.toBeInTheDocument();
  });

  it('links repository creation to the organization-scoped creation page', () => {
    render(<ProjectDirectoryPage />);

    const createLinks = screen.getAllByRole('link', { name: /new repository/i });

    expect(createLinks.length).toBeGreaterThan(0);
    for (const link of createLinks) {
      expect(link).toHaveAttribute('href', '/t3x-dev/new');
    }
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(createProject).not.toHaveBeenCalled();
  });

  it('combines visibility and tag filters, searches all pages, and resets pagination', () => {
    hookProjects = Array.from({ length: 22 }, (_, index) => ({
      ...projects[0],
      project_id: `repo-${index}`,
      name: `repo-${index}`,
      canonical_path: `/t3x-dev/repo-${index}`,
      visibility: index === 21 ? 'public' : 'private',
      repository_profile: { tags: index === 21 ? ['schema-kit'] : ['config'] },
    }));
    render(<ProjectDirectoryPage />);
    expect(screen.getAllByRole('article')).toHaveLength(20);
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getAllByRole('article')).toHaveLength(2);
    selectOption('Filter by visibility', 'Public');
    fireEvent.click(screen.getByRole('button', { name: 'Filter by tags' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'schema-kit' }));
    fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Search tags' }), { key: 'Escape' });
    expect(screen.getByRole('link', { name: 'repo-21' })).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a repository' }), {
      target: { value: 'schema-kit' },
    });
    expect(screen.getByRole('link', { name: 'repo-21' })).toBeInTheDocument();
  });

  it('searches and selects multiple exact tags using any-match filtering', () => {
    hookProjects = projects.map((project, index) => ({
      ...project,
      repository_profile: { tags: index ? ['#中文'] : ['Dev', 'dev'] },
    }));
    render(<ProjectDirectoryPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Filter by tags' }));
    const search = screen.getByRole('searchbox', { name: 'Search tags' });
    fireEvent.change(search, { target: { value: 'DE' } });
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Dev', exact: true }));
    expect(screen.getAllByRole('article')).toHaveLength(1);
    fireEvent.change(search, { target: { value: '中文' } });
    fireEvent.click(screen.getByRole('checkbox', { name: '#中文', exact: true }));
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(screen.getByText('Matches any selected tag.')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'missing' } });
    expect(screen.getByText('No matching tags.')).toBeInTheDocument();
    fireEvent.keyDown(search, { key: 'Escape' });
    const active = within(screen.getByRole('group', { name: 'Active tag filters' }));
    fireEvent.click(active.getByRole('button', { name: 'Remove tag Dev' }));
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 't3x-core' })).toBeInTheDocument();
    fireEvent.click(active.getByRole('button', { name: 'Remove tag #中文' }));
    expect(screen.getAllByRole('article')).toHaveLength(2);
  });

  it('paginates in fixed groups of 20 with the correct final page', () => {
    hookProjects = Array.from({ length: 42 }, (_, index) => ({
      ...projects[0],
      project_id: `repo-${index}`,
      name: `repo-${index}`,
    }));
    render(<ProjectDirectoryPage />);
    expect(
      screen.queryByRole('combobox', { name: 'Repositories per page' })
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(20);
    expect(screen.getByText('1–20 of 42 repositories')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(20);
    expect(screen.getByText('21–40 of 42 repositories')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(screen.getByText('41–42 of 42 repositories')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  it.each([
    false,
    undefined,
  ])('hides mutation actions without confirmed capabilities (%s)', (permission) => {
    hookProjects = [{ ...projects[0], can_edit: permission, can_delete: permission }];
    render(<ProjectDirectoryPage />);
    openActions();
    expect(screen.getByRole('menuitem', { name: 'Open repository' })).toHaveAttribute(
      'href',
      '/t3x-dev/prd-workflow'
    );
    expect(screen.queryByRole('menuitem', { name: /Rename/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Delete repository/ })).not.toBeInTheDocument();
  });

  it('allows editors to rename without offering deletion', () => {
    hookProjects = [{ ...projects[0], can_delete: false }];
    render(<ProjectDirectoryPage />);
    openActions();
    expect(screen.getByRole('menuitem', { name: /Rename/ })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Delete repository/ })).not.toBeInTheDocument();
  });

  it('routes to an available namespace and synchronizes the selected account after navigation', () => {
    namespaceAccounts = [
      { namespace: { slug: 't3x-dev', namespace_id: 'team-id' } },
      { namespace: { slug: 'alice', namespace_id: 'alice-id' } },
    ];
    const { rerender } = render(<ProjectDirectoryPage />);
    selectOption('Namespace', 'alice');
    expect(routerPush).toHaveBeenCalledWith('/alice');
    rerender(<ProjectDirectoryPage ownerSlug="alice" />);
    expect(selectNamespace).toHaveBeenCalledWith('alice-id');
    expect(screen.getByRole('link', { name: 'New repository' })).toHaveAttribute(
      'href',
      '/alice/new'
    );
  });

  it('renders a recoverable load failure without claiming the organization is empty', () => {
    hookError = 'Network request failed. Check your connection and try again.';
    hookProjects = [];

    render(<ProjectDirectoryPage />);

    expect(screen.getByRole('heading', { name: "Couldn't load repositories" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'No repositories yet' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Repositories' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Recently opened' })).not.toBeInTheDocument();
  });

  it('retries a failed initial repository load from the failure state', () => {
    hookError = 'Network request failed. Check your connection and try again.';
    hookProjects = [];

    render(<ProjectDirectoryPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(refreshProjects).toHaveBeenCalledTimes(1);
  });

  it('previews and saves the backend-confirmed name through the shared project hook', async () => {
    vi.mocked(checkRepositoryName).mockResolvedValue({
      name: 'Renamed-PRD',
      changed: true,
      valid: true,
      available: true,
      code: null,
      message: null,
      namespace: 't3x-dev',
      canonical_path: '/t3x-dev/Renamed-PRD',
    });
    renameProject.mockResolvedValueOnce({
      ...projects[0],
      name: 'Renamed-PRD',
      canonical_path: '/t3x-dev/Renamed-PRD',
    } satisfies Project);

    render(<ProjectDirectoryPage />);

    openActions();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename repository prd-workflow' }));
    fireEvent.change(screen.getByLabelText('Repository name'), {
      target: { value: 'Renamed PRD' },
    });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
    expect(screen.getByText('/t3x-dev/Renamed-PRD')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(renameProject).toHaveBeenCalledWith('proj_prd', 'Renamed-PRD'));
  });

  it('deletes a backend project through the shared project hook', async () => {
    removeProject.mockResolvedValueOnce(undefined);

    render(<ProjectDirectoryPage />);

    openActions();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete repository prd-workflow' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(removeProject).toHaveBeenCalledWith('proj_prd'));
    expect(
      await screen.findByRole('link', { name: 'Manage deleted repositories' })
    ).toHaveAttribute('href', '/?view=deleted');
  });

  it.each(['empty', 'error'])('keeps a toolbar entry when the active list is %s', (state) => {
    hookProjects = [];
    if (state === 'error') hookError = 'Offline';
    currentPath = '/alice';
    render(<ProjectDirectoryPage ownerSlug="alice" />);
    const entry = screen.getByRole('link', { name: 'Deleted repositories' });
    expect(screen.getByRole('button', { name: 'Refresh repositories' })).toBeInTheDocument();
    expect(entry).toHaveAttribute('href', '/alice?view=deleted');
  });

  it('opens the URL-selected deleted view and preserves the active filter on return', async () => {
    const { rerender } = render(<ProjectDirectoryPage />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a repository' }), {
      target: { value: 'core' },
    });
    currentQuery = 'view=deleted';
    rerender(<ProjectDirectoryPage />);
    expect(
      await screen.findByText('No deleted repositories to manage in this namespace.')
    ).toBeInTheDocument();
    expect(fetchDeletedProjects).toHaveBeenCalledWith(21, 0, 't3x-dev');
    expect(screen.getByRole('link', { name: 'Back to repositories' })).toHaveAttribute('href', '/');
    currentQuery = '';
    rerender(<ProjectDirectoryPage />);
    expect(screen.getByRole('searchbox', { name: 'Find a repository' })).toHaveValue('core');
  });

  it('keeps an unconfirmed delete in the dialog and asks for a refresh', async () => {
    removeProject.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<ProjectDirectoryPage />);
    openActions();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete repository prd-workflow' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Its data and all names stay reserved');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be confirmed');
    expect(
      screen.queryByRole('link', { name: 'Manage deleted repositories' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh list' }));
    expect(refreshProjects).toHaveBeenCalledOnce();
  });
});
