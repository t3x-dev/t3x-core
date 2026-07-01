// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectDirectoryPage } from '@/components/project/ProjectDirectoryPage';
import { useProjectStore } from '@/store/projectStore';
import type { Project } from '@/types/api';

const routerPush = vi.fn();
const createProject = vi.fn();
const refreshProjects = vi.fn();
const removeProject = vi.fn();
const renameProject = vi.fn();
let hookProjects: Project[] = [];

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/hooks/projects/useProjects', () => ({
  useProjects: () => ({
    create: createProject,
    error: null,
    loading: false,
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
    created_at: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    turns_count: 4,
    conversations_count: 1,
    commits_count: 1,
    branches_count: 1,
    metadata: {
      description: 'PRD source review, YSchema validation, YOps commit, and output generation.',
    },
  },
  {
    project_id: 'proj_core',
    name: 't3x-core',
    created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    turns_count: 12,
    conversations_count: 2,
    commits_count: 18,
    branches_count: 1,
    metadata: {
      description: 'Version control for structured state.',
    },
  },
];

describe('ProjectDirectoryPage', () => {
  beforeEach(() => {
    routerPush.mockReset();
    createProject.mockReset();
    refreshProjects.mockReset();
    removeProject.mockReset();
    renameProject.mockReset();
    hookProjects = projects;
    useProjectStore.setState({
      error: null,
      initialized: true,
      loading: false,
      projects: [],
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
      '/t3x-dev/settings'
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

  it('renames a backend project through the shared project hook', async () => {
    renameProject.mockResolvedValueOnce({
      ...projects[0],
      name: 'Renamed PRD',
    } satisfies Project);

    render(<ProjectDirectoryPage />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Rename repository prd-workflow' })[0]);
    fireEvent.change(screen.getByLabelText('Repository name'), {
      target: { value: 'Renamed PRD' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(renameProject).toHaveBeenCalledWith('proj_prd', 'Renamed PRD'));
  });

  it('deletes a backend project through the shared project hook', async () => {
    removeProject.mockResolvedValueOnce(undefined);

    render(<ProjectDirectoryPage />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Delete repository prd-workflow' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(removeProject).toHaveBeenCalledWith('proj_prd'));
  });
});
