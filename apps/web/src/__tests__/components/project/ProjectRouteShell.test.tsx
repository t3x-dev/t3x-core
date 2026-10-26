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
  notFound: () => {
    throw new Error('NEXT_HTTP_ERROR_FALLBACK;404');
  },
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

  it('keeps the known repository header while its fresh lookup is pending', () => {
    navigation.load.mockReturnValue(new Promise(() => {}));
    useProjectStore.setState({
      details: {
        [project.id]: { ...project, namespace: 'team', canonical_path: '/team/Test-Project' },
      },
    });

    render(
      <ProjectRouteShell projectId="proj_test">
        <div>Change review</div>
      </ProjectRouteShell>
    );

    expect(screen.getByRole('heading', { name: 'Test Project' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Project', exact: true })).not.toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('redirects project ID pull request links to the public repository route', async () => {
    navigation.pathname = '/project/proj_test';
    navigation.search = 'tab=pull-requests&branch=feature%2Frelease&pr=7';

    render(
      <ProjectRouteShell projectId="proj_test">
        <div>Pull requests</div>
      </ProjectRouteShell>
    );

    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith(
        '/team/Test-Project/pull-requests?branch=feature%2Frelease&pr=7',
        { scroll: false }
      )
    );
  });

  it('maps workspace change routes to the Workspaces tab', () => {
    navigation.pathname = '/project/proj_test/changes/ws_1/snap_1';

    render(
      <ProjectRouteShell projectId="proj_test">
        <div>Change review</div>
      </ProjectRouteShell>
    );

    expect(screen.getByRole('link', { name: 'Workspace' })).toHaveAttribute('aria-current', 'page');
  });

  it.each([
    '/project/proj_test/history',
    '/team/Test-Project/history',
    '/team/Test-Project/diff',
  ])('owns %s in State and preserves the exact Settings return destination', async (pathname) => {
    navigation.pathname = pathname;
    navigation.search = 'branch=feature%2Frelease&view=list&commit=sha256%3Aabc&q=fix';
    render(
      <ProjectRouteShell projectId="proj_test">
        <div>History content</div>
      </ProjectRouteShell>
    );
    expect(screen.getByRole('link', { name: 'State' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'History' })).toBeNull();
    await waitFor(() => {
      const settings = new URL(
        screen.getByRole('link', { name: 'Settings' }).getAttribute('href')!,
        'http://localhost'
      );
      expect(settings.searchParams.get('returnTo')).toBe(`${pathname}?${navigation.search}`);
      expect(screen.getByRole('link', { name: 'State' })).toHaveAttribute(
        'href',
        '/team/Test-Project?branch=feature%2Frelease'
      );
    });
  });

  it('does not mistake a repository name for the active route', () => {
    navigation.pathname = '/team/history/settings';
    navigation.search = 'returnTo=%2Fteam%2Fhistory%2Fhistory%3Fcommit%3Dsha256%253Aabc';
    render(
      <ProjectRouteShell projectId="proj_test">
        <div>Settings content</div>
      </ProjectRouteShell>
    );
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      `${navigation.pathname}?${navigation.search}`
    );
    expect(screen.getByRole('link', { name: 'State' })).not.toHaveAttribute('aria-current');
  });

  it('canonicalizes History query links with their full detail context', async () => {
    navigation.pathname = '/project/proj_test';
    navigation.search =
      'tab=history&branch=feature%2Frelease&commit=sha256%3Aabc&view=list&author=Maya&q=fix&returnTo=%2Fteam%2FTest-Project%2Fcommunity';
    render(
      <ProjectRouteShell projectId="proj_test">
        <div>History</div>
      </ProjectRouteShell>
    );
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith(
        `/team/Test-Project/history?${navigation.search.replace('tab=history&', '')}`,
        { scroll: false }
      )
    );
  });
});

it.each([
  { suffix: '/outputs', query: '' },
  { suffix: '/leaf/old', query: '' },
  { suffix: '', query: 'tab=outputs&leaf=old' },
])('does not canonicalize retired ID routes $suffix $query', ({ suffix, query }) => {
  navigation.pathname = `/project/proj_test${suffix}`;
  navigation.search = query;
  navigation.replace.mockClear();
  navigation.load.mockClear();
  expect(() =>
    render(
      <ProjectRouteShell projectId="proj_test">
        <div>Archive</div>
      </ProjectRouteShell>
    )
  ).toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
  expect(navigation.replace).not.toHaveBeenCalled();
  expect(navigation.load).not.toHaveBeenCalled();
});
