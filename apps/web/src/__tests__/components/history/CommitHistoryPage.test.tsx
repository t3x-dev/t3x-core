// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommitHistoryPage } from '@/components/history/CommitHistoryPage';
import type { ApiCommit } from '@/types/api';

const mocks = vi.hoisted(() => ({
  loadCommit: vi.fn(),
  loadCommits: vi.fn(),
  loadBranches: vi.fn(),
  loadDiff: vi.fn(),
  routerReplace: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.routerReplace }),
  usePathname: () => '/project/proj_test/history',
  useSearchParams: () => new URLSearchParams('branch=main&view=list'),
}));
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
    vi.clearAllMocks();
    mocks.loadBranches.mockResolvedValue({ branches: [{ branch_id: 'main', name: 'main' }] });
    mocks.loadDiff.mockResolvedValue({
      stats: { addedCount: 0, modifiedCount: 1, removedCount: 0 },
    });
  });
  it('opens historical nodes in the YAML review and returns to the same history list', async () => {
    mocks.loadCommits.mockResolvedValue([selected, root]);
    render(<CommitHistoryPage projectId="proj_test" />);
    fireEvent.click(await screen.findByRole('button', { name: /Update title/ }));
    expect(await screen.findByRole('region', { name: 'Commit YAML' })).toHaveTextContent('Revised');
    expect(screen.getByRole('region', { name: 'Parent YAML' })).toHaveTextContent('Original');
    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    fireEvent.click(screen.getByRole('button', { name: /Initial state/ }));
    expect((await screen.findAllByText('empty', { exact: true })).length).toBeGreaterThan(0);
    expect(screen.queryByText('Revised')).not.toBeInTheDocument();
    expect(mocks.loadCommit).not.toHaveBeenCalled();
  });
  it('never renders an unknown parent as an empty baseline', async () => {
    mocks.loadCommits.mockResolvedValue([selected]);
    mocks.loadCommit.mockRejectedValue(new Error('Parent unavailable'));
    render(<CommitHistoryPage projectId="proj_test" />);
    fireEvent.click(await screen.findByRole('button', { name: /Update title/ }));
    await waitFor(() => expect(mocks.loadCommit).toHaveBeenCalledWith(root.hash, 'proj_test'));
    expect(
      await screen.findByRole('button', { name: 'Back to history', exact: true })
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Structured state tree')).not.toBeInTheDocument();
    expect(screen.queryByText(/Empty state →/)).not.toBeInTheDocument();
  });

  it('filters the timeline and switches back to Canvas without replacing history data', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: /Open Canvas/ }));
    expect(mocks.routerReplace).toHaveBeenLastCalledWith('/project/proj_test/history?branch=main', {
      scroll: false,
    });
  });
});
