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
const createProject = vi.fn();
const refreshProjects = vi.fn();
const removeProject = vi.fn();
const renameProject = vi.fn();
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
  useProjects: () => ({
    create: createProject,
    error: hookError,
    loading: hookLoading,
    projects: hookProjects,
    refresh: refreshProjects,
    remove: removeProject,
    rename: renameProject,
  }),
}));

const projects: Project[] = [
  {
    project_id: 'proj_prd',
    name: 'prd-workflow',
    namespace: 't3x-dev',
    canonical_path: '/t3x-dev/prd-workflow',
    created_at: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
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
    createProject.mockReset();
    refreshProjects.mockReset();
    removeProject.mockReset();
    renameProject.mockReset();
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
    render(<ProjectDirectoryPage />);

    expect(screen.getByRole('heading', { name: 't3x-dev' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pinned repositories' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Repositories' })).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Projects', current: 'page' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/settings/provider-credentials?owner=t3x-dev'
    );
    expect(screen.queryByRole('link', { name: 'Docs' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Templates' })).not.toBeInTheDocument();
    expect(screen.queryByText('hi@t3x.dev')).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /prd-workflow/i })[0]).toHaveAttribute(
      'href',
      '/t3x-dev/prd-workflow'
    );
    expect(screen.getAllByText('/t3x-dev/prd-workflow').length).toBeGreaterThan(0);
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
    expect(screen.getAllByText('Commits 18').length).toBeGreaterThan(0);
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
    render(<ProjectDirectoryPage ownerSlug="lqw905" />);

    expect(screen.getByRole('heading', { name: 'lqw905' })).toBeInTheDocument();
    expect(
      screen.getByText('Personal namespace for structured state repositories.')
    ).toBeInTheDocument();
    expect(screen.getByText('Personal namespace')).toBeInTheDocument();
    expect(screen.queryByText('3 members')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/settings/provider-credentials?owner=lqw905'
    );
    expect(screen.getAllByRole('link', { name: /prd-workflow/i })[0]).toHaveAttribute(
      'href',
      '/lqw905/prd-workflow'
    );
    expect(screen.getAllByText('/lqw905/prd-workflow').length).toBeGreaterThan(0);
    for (const link of screen.getAllByRole('link', { name: /new repository/i })) {
      expect(link).toHaveAttribute('href', '/lqw905/new');
    }
  });

  it('orders pinned repositories from local recent-open state', () => {
    window.localStorage.setItem('t3x:recent-projects', JSON.stringify(['proj_core', 'proj_prd']));

    render(<ProjectDirectoryPage />);

    const recentSection = screen
      .getByRole('heading', { name: 'Pinned repositories' })
      .closest('section');
    expect(recentSection).not.toBeNull();

    const recentLinks = within(recentSection as HTMLElement).getAllByRole('link');
    expect(recentLinks[0]).toHaveAttribute('href', '/t3x-dev/t3x-core');
    expect(recentLinks[1]).toHaveAttribute('href', '/t3x-dev/prd-workflow');
  });

  it('filters project rows without leaving the directory', () => {
    render(<ProjectDirectoryPage />);

    const search = screen.getByPlaceholderText('Find a repository...');
    fireEvent.change(search, { target: { value: 'core' } });

    expect(screen.getAllByRole('link', { name: /t3x-core/i })).toHaveLength(2);
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

  it('renders a recoverable load failure without claiming the organization is empty', () => {
    hookError = 'Network request failed. Check your connection and try again.';
    hookProjects = [];

    render(<ProjectDirectoryPage />);

    expect(screen.getByRole('heading', { name: "Couldn't load repositories" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'No repositories yet' })).not.toBeInTheDocument();
    expect(screen.getByText('— repos')).toBeInTheDocument();
    expect(screen.getByText('— commits')).toBeInTheDocument();
    expect(screen.getByText('Repository data is unavailable.')).toBeInTheDocument();
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

    fireEvent.click(screen.getAllByRole('button', { name: 'Rename repository prd-workflow' })[0]);
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

    fireEvent.click(screen.getAllByRole('button', { name: 'Delete repository prd-workflow' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(removeProject).toHaveBeenCalledWith('proj_prd'));
    expect(
      await screen.findByRole('link', { name: 'Manage deleted repositories' })
    ).toHaveAttribute('href', '/?view=deleted');
  });

  it.each(['empty', 'error'])('keeps a bottom entry when the active list is %s', (state) => {
    hookProjects = [];
    if (state === 'error') hookError = 'Offline';
    currentPath = '/alice';
    render(<ProjectDirectoryPage ownerSlug="alice" />);
    const entry = screen.getByRole('link', { name: 'Deleted repositories' });
    expect(entry.closest('footer')).not.toBeNull();
    expect(entry).toHaveAttribute('href', '/alice?view=deleted');
  });

  it('opens the URL-selected deleted view and preserves the active filter on return', async () => {
    const { rerender } = render(<ProjectDirectoryPage />);
    fireEvent.change(screen.getByPlaceholderText('Find a repository...'), {
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
    expect(screen.getByPlaceholderText('Find a repository...')).toHaveValue('core');
  });

  it('keeps an unconfirmed delete in the dialog and asks for a refresh', async () => {
    removeProject.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<ProjectDirectoryPage />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete repository prd-workflow' })[0]);
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
