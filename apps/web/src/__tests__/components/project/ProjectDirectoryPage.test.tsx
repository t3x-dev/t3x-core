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

  it('renders the organization-level project directory as the app entrypoint', () => {
    render(<ProjectDirectoryPage />);

    expect(screen.getByRole('heading', { name: 't3x-dev' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pinned projects' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /prd-workflow/i })[0]).toHaveAttribute(
      'href',
      '/project/proj_prd'
    );
    expect(screen.queryByRole('link', { name: 'Chats' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Canvas' })).not.toBeInTheDocument();
  });

  it('filters project rows without leaving the directory', () => {
    render(<ProjectDirectoryPage />);

    const search = screen.getByPlaceholderText('Find a project...');
    fireEvent.change(search, { target: { value: 'core' } });

    expect(screen.getAllByRole('link', { name: /t3x-core/i })).toHaveLength(2);
    expect(screen.queryByRole('link', { name: /prd-workflow/i })).not.toBeInTheDocument();
  });

  it('creates a backend project through the shared project hook', async () => {
    createProject.mockResolvedValueOnce({
      branches_count: 1,
      commits_count: 0,
      conversations_count: 0,
      created_at: new Date().toISOString(),
      metadata: { description: 'Created from directory.' },
      name: 'Backend project',
      project_id: 'proj_new',
      turns_count: 0,
    } satisfies Project);

    render(<ProjectDirectoryPage />);

    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    fireEvent.change(screen.getByLabelText('Project name'), {
      target: { value: 'Backend project' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(createProject).toHaveBeenCalledWith('Backend project'));
    expect(routerPush).toHaveBeenCalledWith('/project/proj_new');
  });

  it('renames a backend project through the shared project hook', async () => {
    renameProject.mockResolvedValueOnce({
      ...projects[0],
      name: 'Renamed PRD',
    } satisfies Project);

    render(<ProjectDirectoryPage />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Rename project prd-workflow' })[0]);
    fireEvent.change(screen.getByLabelText('Project name'), {
      target: { value: 'Renamed PRD' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(renameProject).toHaveBeenCalledWith('proj_prd', 'Renamed PRD'));
  });

  it('deletes a backend project through the shared project hook', async () => {
    removeProject.mockResolvedValueOnce(undefined);

    render(<ProjectDirectoryPage />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Delete project prd-workflow' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(removeProject).toHaveBeenCalledWith('proj_prd'));
  });
});
