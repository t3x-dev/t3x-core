// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectRouteShell } from '@/components/project/ProjectRouteShell';
import { useProjectStore } from '@/store/projectStore';

const navigation = vi.hoisted(() => ({
  pathname: '/project/proj_test/history',
  search: 'branch=main&view=list',
  replace: vi.fn(),
  load: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: navigation.replace }),
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

vi.mock('@/hooks/projects/useProjectDetail', () => ({
  useProjectDetail: () => ({ loadProject: navigation.load }),
}));

const project = {
  id: 'proj_test',
  name: 'Test Project',
  description: 'Project description',
  updatedAt: 'just now',
  owner: 'You',
  status: 'active' as const,
  nodes: 2,
  drafts: 1,
  commitsCount: 4,
  branchesCount: 1,
  visibility: 'private' as const,
};

describe('ProjectRouteShell', () => {
  beforeEach(() => {
    navigation.pathname = '/project/proj_test/history';
    navigation.search = 'branch=main&view=list';
    navigation.replace.mockReset();
    navigation.load.mockResolvedValue({
      project_id: project.id,
      name: project.name,
      created_at: '2026-01-01T00:00:00Z',
      namespace: 'team',
      canonical_path: '/team/Test-Project',
      visibility: 'private',
    });
    useProjectStore.setState({ projects: [project], details: {} });
  });

  it('keeps the shared project title bar around nested project pages', async () => {
    render(
      <ProjectRouteShell projectId="proj_test">
        <h2>History</h2>
      </ProjectRouteShell>
    );

    expect(screen.getByRole('navigation', { name: 'Project views' }).closest('header')).toBe(
      screen.getByRole('banner')
    );
    expect(await screen.findByRole('heading', { name: 'Test Project' })).toBeInTheDocument();
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith(
        '/team/Test-Project/history?branch=main&view=list',
        { scroll: false }
      )
    );
    expect(screen.getByRole('navigation', { name: 'Project views' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'History' })).toBeInTheDocument();
  });

  it('does not duplicate the shell on the project index route', () => {
    navigation.pathname = '/project/proj_test';

    render(
      <ProjectRouteShell projectId="proj_test">
        <div>Index page owns its shell</div>
      </ProjectRouteShell>
    );

    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(screen.getByText('Index page owns its shell')).toBeInTheDocument();
  });

  it('maps workspace change routes to the Workspaces tab', () => {
    navigation.pathname = '/project/proj_test/changes/ws_1/snap_1';

    render(
      <ProjectRouteShell projectId="proj_test">
        <div>Change review</div>
      </ProjectRouteShell>
    );

    expect(screen.getByRole('link', { name: 'Workspaces' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });
});
