// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { WorkspaceCommitGraph } from '@/components/workspaces/WorkspaceCommitGraph';
import type { Branch } from '@/infrastructure/types';
import type { ApiCommit } from '@/types/api';

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  useGraph: vi.fn(),
}));
vi.mock('@/hooks/workspaces/useWorkspaceCommitGraph', () => ({
  WORKSPACE_GRAPH_LIMIT: 100,
  useWorkspaceCommitGraph: mocks.useGraph,
}));
const root: ApiCommit = {
  project_id: 'p',
  hash: 'sha256:root',
  parents: [],
  branch: 'main',
  schema: 't3x/commit/v2',
  committed_at: '2026-10-22T01:00:00Z',
  message: 'Initial snapshot',
  author: { type: 'human', name: 'Tester' },
  content: { trees: [], relations: [] },
  sources: null,
  provenance: null,
};
const merged = {
  ...root,
  hash: 'sha256:merged',
  parents: [root.hash],
  message: 'Merge branch dev',
};
function branch(name: string, hash: string): Branch {
  return {
    branch_id: name,
    name,
    project_id: 'p',
    head_commit_hash: hash,
    is_current: name === 'dev',
    created_at: '',
    updated_at: '',
  };
}
beforeEach(() => {
  mocks.refresh.mockReset();
  mocks.useGraph.mockReset().mockReturnValue({
    commits: [root, merged],
    branches: [branch('dev', merged.hash), branch('main', merged.hash)],
    loading: false,
    refresh: mocks.refresh,
  });
});

it('selects a Commit inline without navigating away when used in a Workspace', () => {
  const select = vi.fn();
  render(
    <WorkspaceCommitGraph
      projectId="p"
      branch="dev"
      selectedCommitHash={root.hash}
      onSelectCommit={select}
    />
  );
  const row = screen.getByRole('button', { name: /View commit root/ });
  expect(row).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(row);
  expect(select).toHaveBeenCalledWith(root);
  expect(screen.queryByRole('link', { name: /View commit/ })).not.toBeInTheDocument();
});

it('renders newest first with actual head labels and read-only snapshot links', () => {
  render(<WorkspaceCommitGraph projectId="p" branch="dev" />);
  const graph = screen.getByRole('region', { name: 'Commit graph' });
  const links = within(graph).getAllByRole('link', { name: /View commit/ });
  expect(links[0]).toHaveTextContent('Merge branch dev');
  expect(links[0]).toHaveTextContent('dev');
  expect(links[0]).toHaveTextContent('main');
  expect(links[1]).not.toHaveTextContent('main');
  expect(links[0]).toHaveAttribute('data-head', 'true');
  expect(links[0]).toHaveAttribute(
    'href',
    '/project/p?view=overview&branch=dev&commit=sha256%3Amerged'
  );
  const fullGraph = new URL(
    within(graph)
      .getByRole('link', { name: /Open full graph/ })
      .getAttribute('href')!,
    'http://localhost'
  );
  expect(fullGraph.pathname).toBe('/project/p/history');
  expect(fullGraph.searchParams.has('branch')).toBe(false);
  expect(fullGraph.searchParams.get('returnTo')).toBe('/project/p?branch=dev&tab=workspaces');
  expect(within(graph).queryByRole('button', { name: /merge|commit$/i })).not.toBeInTheDocument();
});

it('filters the graph by the current branch, refreshes and folds independently', () => {
  render(<WorkspaceCommitGraph projectId="p" branch="dev" refreshKey="base" />);
  fireEvent.change(screen.getByRole('combobox', { name: 'Commit graph branches' }), {
    target: { value: 'current' },
  });
  expect(mocks.useGraph).toHaveBeenLastCalledWith('p', 'dev', 'base');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh commit graph' }));
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Toggle commit graph' }));
  expect(screen.queryByRole('link', { name: /View commit/ })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Toggle commit graph' })).toHaveAttribute(
    'aria-expanded',
    'false'
  );
});

it.each([
  [{ loading: true }, 'Loading history…'],
  [{ loading: false }, 'No commits yet.'],
  [{ loading: false, error: 'Network unavailable' }, 'Network unavailable'],
])('shows explicit loading, empty and failure states', (extra, text) => {
  mocks.useGraph.mockReturnValue({ commits: [], branches: [], refresh: mocks.refresh, ...extra });
  render(<WorkspaceCommitGraph projectId="p" branch="dev" />);
  expect(screen.getByText(text)).toBeVisible();
  const refresh = screen.getByRole('button', { name: 'Refresh commit graph' });
  if (extra.loading) expect(refresh).toBeDisabled();
  else expect(refresh).toBeEnabled();
});
