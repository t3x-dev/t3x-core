// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OwnerRepoProjectPage from '@/app/[owner]/[repo]/page';
import { useProjectStore } from '@/store/projectStore';

let routeParamsValue: Record<string, string> = {
  owner: 't3x-dev',
  repo: 'prd-workflow',
};
const fetchProjects = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => routeParamsValue,
}));

vi.mock('@/hooks/projects/useProjectCrud', () => ({
  useProjectCrud: () => ({ list: fetchProjects }),
}));

vi.mock('@/app/project/[projectId]/page', () => ({
  ProjectDetailPageContent: ({ projectIdOverride }: { projectIdOverride?: string }) => (
    <div data-testid="project-detail">{projectIdOverride}</div>
  ),
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

describe('OwnerRepoProjectPage', () => {
  beforeEach(() => {
    fetchProjects.mockReset();
    routeParamsValue = { owner: 't3x-dev', repo: 'prd-workflow' };
    useProjectStore.setState({
      error: null,
      initialized: true,
      loading: false,
      projects: [
        {
          branchesCount: 1,
          commitsCount: 1,
          defaultModel: null,
          defaultProvider: null,
          description: 'PRD workflow',
          drafts: 1,
          id: 'proj_prd',
          name: 'PRD Workflow',
          nodes: 2,
          owner: 'You',
          status: 'active',
          updatedAt: 'just now',
        },
      ],
    });
  });

  it('resolves owner/repo slugs to the internal project id', () => {
    render(<OwnerRepoProjectPage />);

    expect(screen.getByTestId('project-detail')).toHaveTextContent('proj_prd');
    expect(fetchProjects).not.toHaveBeenCalled();
  });

  it('shows a repository-level not found state for unmatched slugs', () => {
    routeParamsValue = { owner: 't3x-dev', repo: 'missing-repo' };

    render(<OwnerRepoProjectPage />);

    expect(screen.getByText('Repository not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to t3x-dev' })).toHaveAttribute('href', '/');
  });
});
