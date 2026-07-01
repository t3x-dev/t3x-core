// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NewRepositoryPage } from '@/components/project/NewRepositoryPage';
import type { Project } from '@/types/api';

const mocks = vi.hoisted(() => ({
  createProject: vi.fn(),
  routerPush: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ owner: 't3x-dev' }),
  useRouter: () => ({ push: mocks.routerPush }),
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

vi.mock('@/commands/projects', () => ({
  createProject: mocks.createProject,
}));

describe('NewRepositoryPage', () => {
  beforeEach(() => {
    mocks.routerPush.mockReset();
    mocks.createProject.mockReset();
  });

  it('renders an organization-scoped repository creation form', () => {
    render(<NewRepositoryPage />);

    expect(screen.getByRole('heading', { name: 'Create a new repository' })).toBeInTheDocument();
    expect(screen.getByLabelText('Owner')).toHaveValue('t3x-dev');
    expect(screen.getByLabelText('Repository name')).toBeInTheDocument();
    expect(screen.getByText('/t3x-dev/new-repository')).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Blank repository/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Start from source evidence/i })).toBeInTheDocument();
    expect(screen.getByText('Local repository')).toBeInTheDocument();
    expect(screen.getByText('Private by default')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute('href', '/t3x-dev');
    expect(screen.getByRole('button', { name: 'Create repository' })).toBeDisabled();
  });

  it('updates the path preview and opens the clean repository URL after create', async () => {
    mocks.createProject.mockResolvedValueOnce({
      branches_count: 1,
      commits_count: 0,
      conversations_count: 0,
      created_at: new Date().toISOString(),
      metadata: { description: 'Created from new repository page.' },
      name: 'Backend project',
      project_id: 'proj_new',
      turns_count: 0,
    } satisfies Project);

    render(<NewRepositoryPage />);

    fireEvent.change(screen.getByLabelText('Repository name'), {
      target: { value: 'Backend project' },
    });

    expect(screen.getByText('/t3x-dev/backend-project')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Create repository' }));

    await waitFor(() => expect(mocks.createProject).toHaveBeenCalledWith('Backend project'));
    expect(mocks.routerPush).toHaveBeenCalledWith('/t3x-dev/backend-project');
  });
});
