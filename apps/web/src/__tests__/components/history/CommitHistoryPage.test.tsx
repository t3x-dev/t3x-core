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
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/project/proj_test/history',
  useSearchParams: () => new URLSearchParams('branch=main'),
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
  it('opens historical nodes in State structure and returns to the same history list', async () => {
    mocks.loadCommits.mockResolvedValue([selected, root]);
    render(<CommitHistoryPage projectId="proj_test" />);
    fireEvent.click(await screen.findByRole('button', { name: /Update title/ }));
    expect(await screen.findByLabelText('Structured state tree')).toBeInTheDocument();
    expect(screen.getByText('Historical snapshot · Read-only')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to commit history' }));
    fireEvent.click(screen.getByRole('button', { name: /Initial state/ }));
    expect(await screen.findByText('Empty state → Selected root')).toBeInTheDocument();
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
});
