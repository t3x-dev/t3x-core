// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OwnerRepoProjectPage from '@/app/[owner]/[[...repoPath]]/page';
import { useProjectStore } from '@/store/projectStore';

let routeParamsValue: Record<string, string | string[]> = {
  owner: 't3x-dev',
  repoPath: ['mobile-click-audit'],
};
const fetchProjects = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => routeParamsValue,
}));

vi.mock('@/hooks/projects/useProjectCrud', () => ({
  useProjectCrud: () => ({ list: fetchProjects }),
}));

vi.mock('@/app/project/[projectId]/page', () => ({
  ProjectDetailPageContent: ({
    initialTabOverride,
    projectIdOverride,
  }: {
    initialTabOverride?: string;
    projectIdOverride?: string;
  }) => (
    <div data-tab={initialTabOverride ?? 'state'} data-testid="project-detail">
      {projectIdOverride}
    </div>
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
    routeParamsValue = { owner: 't3x-dev', repoPath: ['mobile-click-audit'] };
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
          description: 'Click audit workflow',
          drafts: 1,
          id: 'proj_audit',
          name: 'Mobile Click Audit 1780972749777',
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

    expect(screen.getByTestId('project-detail')).toHaveTextContent('proj_audit');
    expect(screen.getByTestId('project-detail')).toHaveAttribute('data-tab', 'state');
    expect(fetchProjects).not.toHaveBeenCalled();
  });

  it('resolves repository tab path segments', () => {
    routeParamsValue = { owner: 't3x-dev', repoPath: ['mobile-click-audit', 'workspaces'] };

    render(<OwnerRepoProjectPage />);

    expect(screen.getByTestId('project-detail')).toHaveTextContent('proj_audit');
    expect(screen.getByTestId('project-detail')).toHaveAttribute('data-tab', 'workspaces');
  });

  it('shows a repository-level not found state for unmatched slugs', () => {
    routeParamsValue = { owner: 't3x-dev', repoPath: ['missing-repo'] };

    render(<OwnerRepoProjectPage />);

    expect(screen.getByText('Repository not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to t3x-dev' })).toHaveAttribute('href', '/');
  });
});
