// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommitHistoryPage } from '@/components/history/CommitHistoryPage';
import type { ApiCommit } from '@/types/api';

const mocks = vi.hoisted(() => ({
  loadCommit: vi.fn(),
  loadCommits: vi.fn(),
  loadBranches: vi.fn(),
  loadDiff: vi.fn(),
  routerReplace: vi.fn(),
  routerPush: vi.fn(),
  search: 'branch=main&view=list',
  listeners: new Set<() => void>(),
}));
vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useRouter: () => ({ replace: mocks.routerReplace, push: mocks.routerPush }),
    usePathname: () => '/project/proj_test/history',
    useSearchParams: () => {
      const search = useSyncExternalStore(
        (listener) => {
          mocks.listeners.add(listener);
          return () => mocks.listeners.delete(listener);
        },
        () => mocks.search
      );
      return new URLSearchParams(search);
    },
  };
});

function navigate(href: string) {
  mocks.search = new URL(href, 'http://localhost').search.slice(1);
  for (const listener of mocks.listeners) listener();
}
vi.mock('@/hooks/commits/useCommitByHash', () => ({
  useCommitByHash: () => ({ loadCommit: mocks.loadCommit }),
}));
vi.mock('@/hooks/commits/useCommitsList', () => ({
  useCommitsList: () => ({ loadCommits: mocks.loadCommits }),
}));
vi.mock('@/hooks/shared/useBranchesList', () => ({
  useBranchesList: () => ({ loadBranches: mocks.loadBranches }),
}));
vi.mock('@/hooks/shared/useDiffRaw', () => ({ useDiffRaw: () => ({ loadDiff: mocks.loadDiff }) }));
vi.mock('@/hooks/shared/useKeyboardNavigation', () => ({
  useKeyboardNavigation: () => ({ activeId: null }),
}));
vi.mock('@/hooks/onboarding/useIntroDemoQueryFlag', () => ({ useIntroDemoQueryFlag: () => false }));
vi.mock('@/hooks/onboarding/useIntroDemoCompletion', () => ({
  useIntroDemoCompletion: () => ({ completeIntroDemo: vi.fn() }),
}));
vi.mock('@/components/onboarding/FeatureTourOverlay', () => ({ FeatureTourOverlay: () => null }));

const root: ApiCommit = {
  hash: 'sha256:root',
  schema: 't3x/commit/v2',
  project_id: 'proj_test',
  branch: 'main',
  parents: [],
  author: { type: 'human' },
  committed_at: '2026-09-01T00:00:00Z',
  message: 'Initial state',
  content: { trees: [{ key: 'prd', slots: { title: 'Original' }, children: [] }], relations: [] },
  sources: [],
  provenance: null,
};
const selected: ApiCommit = {
  ...root,
  hash: 'sha256:second',
  parents: [root.hash],
  message: 'Update title',
  author: { type: 'human', name: 'Maya Chen' },
  committed_at: '2026-09-02T00:00:00Z',
  content: { trees: [{ key: 'prd', slots: { title: 'Revised' }, children: [] }], relations: [] },
};

describe('History node navigation', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetAllMocks();
    mocks.search = 'branch=main&view=list';
    mocks.routerReplace.mockImplementation(navigate);
    mocks.routerPush.mockImplementation(navigate);
    vi.spyOn(window.history, 'replaceState').mockImplementation((_state, _title, href) =>
      navigate(String(href))
    );
    mocks.loadCommits.mockResolvedValue([selected, root]);
    mocks.loadCommit.mockImplementation(async (hash) => {
      if (hash === root.hash) return root;
      if (hash === selected.hash) return selected;
      throw new Error('Commit unavailable');
    });
    mocks.loadBranches.mockResolvedValue({ branches: [{ branch_id: 'main', name: 'main' }] });
    mocks.loadDiff.mockResolvedValue({
      stats: { addedCount: 0, modifiedCount: 1, removedCount: 0 },
    });
  });
  it('keeps the commit list beside the comparison and switches revisions in place', async () => {
    mocks.loadCommits.mockResolvedValue([selected, root]);
    render(<CommitHistoryPage projectId="proj_test" />);
    fireEvent.click(await screen.findByRole('button', { name: /Update title/ }));
    expect(await screen.findByRole('heading', { name: 'Update title' })).toBeInTheDocument();
    expect(screen.getByText('"Original"', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('"Revised"', { exact: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Structure YAML' }));
    expect(await screen.findByRole('region', { name: 'Commit YAML' })).toHaveTextContent('Revised');
    expect(screen.getByRole('region', { name: 'Parent YAML' })).toHaveTextContent('Original');
    fireEvent.click(screen.getByRole('button', { name: /Initial state/ }));
    expect(await screen.findByText(/Empty base/)).toBeInTheDocument();
    expect(screen.queryByText('Revised')).not.toBeInTheDocument();
    expect(mocks.loadCommit).not.toHaveBeenCalled();
  });
  it('distinguishes literal values, missing fields and array order in the commit diff', async () => {
    const parent = {
      ...root,
      content: {
        ...root.content,
        trees: [{ key: 'prd', slots: { status: 'null', removed: false }, children: [] }],
      },
    };
    const commit = {
      ...selected,
      message: '   ',
      content: {
        ...selected.content,
        trees: [
          {
            key: 'prd',
            slots: { status: null, reviewers: ['second', 'first'] },
            children: [{ key: 'empty', slots: {}, children: [] }],
          },
        ],
      },
    };
    mocks.loadCommits.mockResolvedValue([commit, parent]);
    render(<CommitHistoryPage projectId="proj_test" />);

    const list = screen.getByRole('region', { name: 'Commit list' });
    const card = screen.getByRole('region', { name: 'Selected commit' });
    expect(await within(list).findByRole('button', { name: /No commit message/ })).toHaveAttribute(
      'aria-current',
      'true'
    );
    expect(within(card).getByRole('heading', { name: 'No commit message' })).toBeInTheDocument();
    const values = (path: string) => {
      const change = within(card).getByText(path).closest('details');
      return Array.from(change?.querySelectorAll('pre') ?? [], (value) => value.textContent);
    };
    expect(values('prd/empty')).toEqual(['Absent', '{}']);
    expect(values('prd/status')).toEqual(['"null"', 'null']);
    expect(values('prd/removed')).toEqual(['false', 'Absent']);
    expect(values('prd/reviewers')).toEqual(['Absent', '- second\n- first']);
  });

  it('never renders an unknown parent as an empty baseline', async () => {
    mocks.loadCommits.mockResolvedValue([selected]);
    mocks.loadCommit.mockRejectedValue(new Error('Parent unavailable'));
    render(<CommitHistoryPage projectId="proj_test" />);
    fireEvent.click(await screen.findByRole('button', { name: /Update title/ }));
    await waitFor(() => expect(mocks.loadCommit).toHaveBeenCalledWith(root.hash, 'proj_test'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Comparison unavailable. Parent unavailable'
    );
    expect(screen.queryByLabelText('Structured state tree')).not.toBeInTheDocument();
    expect(screen.queryByText(/Empty state →/)).not.toBeInTheDocument();
  });

  it('filters the list and links to the repository State evolution canvas', async () => {
    mocks.loadCommits.mockResolvedValue([selected, root]);
    render(<CommitHistoryPage projectId="proj_test" />);

    const search = await screen.findByRole('searchbox', { name: 'Search commits' });
    fireEvent.change(search, { target: { value: 'Initial' } });
    expect(screen.getByRole('button', { name: /Initial state/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Update title/ })).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: '' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Author filter' }), {
      target: { value: 'Maya Chen' },
    });
    expect(screen.getByRole('button', { name: /Update title/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Initial state/ })).not.toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'State evolution' })).toHaveAttribute(
      'href',
      '/project/proj_test?view=canvas&branch=main'
    );
    expect(mocks.loadCommits).toHaveBeenCalledTimes(1);
  });

  it('keeps rapid search input immediate and updates its URL without a server navigation', async () => {
    render(<CommitHistoryPage projectId="proj_test" />);
    await screen.findByRole('button', { name: /Update title/ });
    const search = screen.getByRole('searchbox', { name: 'Search commits' });
    // Keep URL propagation pending while the user types, as in a busy router.
    vi.mocked(window.history.replaceState).mockImplementation(() => {});
    for (const value of ['U', 'Up', 'Upd', 'Upda', 'Update']) {
      fireEvent.change(search, { target: { value } });
      expect(search).toHaveValue(value);
    }
    expect(window.history.replaceState).toHaveBeenLastCalledWith(
      null,
      '',
      '/project/proj_test/history?branch=main&view=list&q=Update'
    );
    expect(mocks.routerReplace).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Initial state/ })).not.toBeInTheDocument();
    act(() => navigate('/project/proj_test/history?branch=main&view=list&q=Initial'));
    expect(search).toHaveValue('Initial');
    expect(screen.queryByRole('button', { name: /Update title/ })).not.toBeInTheDocument();
  });

  it('restores filters from a permalink and preserves them through detail, State and back', async () => {
    mocks.search = new URLSearchParams({
      branch: 'main',
      view: 'list',
      author: 'Maya Chen',
      q: 'Update',
      returnTo: '/team/repo/community',
    }).toString();
    render(<CommitHistoryPage projectId="proj_test" />);
    fireEvent.click(await screen.findByRole('button', { name: /Update title/ }));
    await screen.findByRole('heading', { name: 'Update title' });
    expect(new URLSearchParams(mocks.search).get('commit')).toBe(selected.hash);
    const stateLink = new URL(
      screen.getByRole('link', { name: 'View this version in State' }).getAttribute('href')!,
      'http://localhost'
    );
    expect(stateLink.searchParams.get('commit')).toBe(selected.hash);
    expect(stateLink.searchParams.get('branch')).toBe('main');
    expect(stateLink.searchParams.get('returnTo')).toBe(
      `/project/proj_test/history?${mocks.search}`
    );
    expect(screen.getByRole('searchbox', { name: 'Search commits' })).toHaveValue('Update');
    expect(screen.getByRole('combobox', { name: 'Author filter' })).toHaveValue('Maya Chen');
    expect(screen.queryByRole('button', { name: /Initial state/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to previous page' }));
    expect(mocks.routerPush).toHaveBeenLastCalledWith('/team/repo/community');
  });

  it('loads an exact permalink outside the fetched history window, including after refresh', async () => {
    mocks.search = `view=list&branch=main&commit=${encodeURIComponent(selected.hash)}`;
    mocks.loadCommits.mockResolvedValue([]);
    const first = render(<CommitHistoryPage projectId="proj_test" />);
    expect(await screen.findByText('"Revised"', { exact: true })).toBeInTheDocument();
    expect(mocks.loadCommit).toHaveBeenCalledWith(selected.hash, 'proj_test');
    expect(mocks.loadCommit).toHaveBeenCalledWith(root.hash, 'proj_test');
    first.unmount();
    render(<CommitHistoryPage projectId="proj_test" />);
    expect(await screen.findByText('"Revised"', { exact: true })).toBeInTheDocument();
  });

  it.each([
    ['missing', null],
    ['wrong project', { ...selected, project_id: 'another-project' }],
    ['wrong hash', { ...selected, hash: 'sha256:wrong' }],
  ])('does not substitute a %s revision with the current state', async (_case, response) => {
    mocks.search = `view=list&commit=${encodeURIComponent(selected.hash)}`;
    mocks.loadCommits.mockResolvedValue([]);
    if (response) mocks.loadCommit.mockResolvedValue(response);
    else mocks.loadCommit.mockRejectedValue(new Error('Revision not found'));
    render(<CommitHistoryPage projectId="proj_test" />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Commit YAML' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to history' }));
    expect(await screen.findByText('No commits found')).toBeInTheDocument();
  });

  it('follows browser back and forward changes to the selected revision', async () => {
    render(<CommitHistoryPage projectId="proj_test" />);
    fireEvent.click(await screen.findByRole('button', { name: /Update title/ }));
    await screen.findByRole('heading', { name: 'Update title' });
    const detail = `/project/proj_test/history?${mocks.search}`;
    act(() => navigate('/project/proj_test/history?branch=main&view=list'));
    expect(await screen.findByRole('button', { name: /Update title/ })).toBeInTheDocument();
    act(() => navigate(detail));
    expect(await screen.findByText('"Revised"', { exact: true })).toBeInTheDocument();
  });

  it('returns to the graph with the selected commit focused', async () => {
    mocks.search = 'branch=main&view=canvas';
    render(<CommitHistoryPage projectId="proj_test" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Inspect Initial state' }));
    fireEvent.click(screen.getByRole('button', { name: 'View Diff Changes' }));
    await screen.findByRole('region', { name: 'Commit YAML' });
    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    expect(await screen.findByRole('heading', { name: 'Initial state' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'History Canvas' })).toBeInTheDocument();
  });

  it('falls back to State for an unsafe return link and keeps branch filtering', async () => {
    mocks.search = 'view=list&returnTo=https%3A%2F%2Fexample.com';
    render(<CommitHistoryPage projectId="proj_test" />);
    await screen.findByRole('button', { name: /Update title/ });
    expect(mocks.loadCommits).toHaveBeenCalledWith('proj_test', undefined, 100);
    fireEvent.click(screen.getByRole('button', { name: 'Back to State' }));
    expect(mocks.routerPush).toHaveBeenLastCalledWith('/project/proj_test?view=overview');
    fireEvent.change(screen.getByRole('combobox', { name: 'History branch filter' }), {
      target: { value: 'main' },
    });
    await waitFor(() =>
      expect(mocks.loadCommits).toHaveBeenLastCalledWith('proj_test', 'main', 100)
    );
  });
});
