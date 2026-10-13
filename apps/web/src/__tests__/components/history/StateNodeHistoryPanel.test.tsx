// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StateNodeHistoryPanel } from '@/components/history/StateNodeHistoryPanel';
import type { ApiCommit } from '@/types/api';

const { loadCommit } = vi.hoisted(() => ({ loadCommit: vi.fn() }));
vi.mock('@/hooks/commits/useCommitByHash', () => ({ useCommitByHash: () => ({ loadCommit }) }));

function commit(hash: string, parent: string | null, outcome: unknown): ApiCommit {
  return {
    hash,
    parents: parent ? [parent] : [],
    schema: 't3x/commit/v2',
    project_id: 'project',
    branch: 'main',
    author: { type: 'human', name: 'W' },
    committed_at: '2026-09-04T00:00:00Z',
    message: `Commit ${hash}`,
    sources: null,
    provenance: null,
    content: {
      relations: [],
      trees: [{ key: 'prd', slots: { outcome, title: 'Workspace' }, children: [] }],
    },
  };
}

beforeEach(() => {
  loadCommit.mockReset();
});

describe('State node history', () => {
  it('keeps long values readable in place and expands each comparison independently', async () => {
    const oldValue = 'Before text '.repeat(40);
    const newValue = 'Result text '.repeat(40);
    loadCommit.mockResolvedValue(commit('root', null, oldValue));
    render(
      <StateNodeHistoryPanel
        commit={commit('head', 'root', newValue)}
        path="prd/outcome"
        name="outcome"
        onBack={vi.fn()}
      />
    );
    const article = await screen.findByRole('article', { name: 'Node change head' });
    const before = within(article).getByRole('button', { name: 'Show full before value' });
    const result = within(article).getByRole('button', { name: 'Show full result value' });
    expect(before).toHaveAttribute('aria-expanded', 'false');
    expect(result).toHaveAttribute('aria-expanded', 'false');
    const beforeContent = document.getElementById(before.getAttribute('aria-controls')!);
    expect(beforeContent).toHaveTextContent(oldValue.trim());
    expect(beforeContent).toHaveClass('line-clamp-4');
    fireEvent.click(before);
    expect(before).toHaveAttribute('aria-expanded', 'true');
    expect(beforeContent).not.toHaveClass('line-clamp-4');
    expect(result).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(within(article).getByRole('button', { name: 'Collapse before value' }));
    expect(beforeContent).toHaveClass('line-clamp-4');
    expect(within(article).getByText('Selected version', { exact: false })).toBeInTheDocument();
  });

  it('keeps removal explicit and avoids repeated missing-message placeholders', async () => {
    const head = commit('head', 'root', 'unused');
    head.content = { trees: [], relations: [] };
    head.message = null;
    loadCommit.mockResolvedValue(commit('root', null, 'Old value'));
    render(
      <StateNodeHistoryPanel commit={head} path="prd/outcome" name="outcome" onBack={vi.fn()} />
    );
    const article = await screen.findByRole('article', { name: 'Node change head' });
    expect(within(article).getByText('− Removed')).toBeInTheDocument();
    expect(within(article).getByText('Old value')).toBeInTheDocument();
    expect(within(article).getByText('Removed')).toBeInTheDocument();
    expect(within(article).queryByText('No commit message')).not.toBeInTheDocument();
    const scope = screen.getByText('History scope').closest('details');
    expect(scope).not.toHaveAttribute('open');
    expect(scope).toHaveTextContent('renames are not followed');
  });

  it('renders legacy commits without inventing missing author metadata', async () => {
    const root = commit('root', null, 'Original');
    Reflect.deleteProperty(root, 'author');
    render(
      <StateNodeHistoryPanel commit={root} path="prd/outcome" name="outcome" onBack={vi.fn()} />
    );
    expect(await screen.findByText(/Unrecorded author/)).toBeInTheDocument();
    expect(screen.getByRole('article')).toHaveTextContent('Original');
    expect(screen.getByRole('status')).toHaveTextContent('1 change · 1 revision checked');
  });

  it('reports missing parents as incomplete and retries without fabricating a creation', async () => {
    const head = commit('head', 'root', 'New');
    loadCommit
      .mockRejectedValueOnce(new Error('Parent unavailable'))
      .mockResolvedValue(commit('root', null, 'Old'));
    render(
      <StateNodeHistoryPanel commit={head} path="prd/outcome" name="outcome" onBack={vi.fn()} />
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('History is incomplete');
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading history' }));
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('bounds loading and continues through long unchanged runs', async () => {
    const commits = Array.from({ length: 23 }, (_, index) =>
      commit(`c${index}`, index ? `c${index - 1}` : null, 'Same')
    );
    loadCommit.mockImplementation(async (hash: string) =>
      commits.find((item) => item.hash === hash)
    );
    render(
      <StateNodeHistoryPanel
        commit={commits[22]!}
        path="prd/outcome"
        name="outcome"
        onBack={vi.fn()}
      />
    );
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('0 changes · 20 revisions checked')
    );
    expect(loadCommit).toHaveBeenCalledTimes(20);
    expect(
      screen.getByText('No changes to this node in the revisions checked so far.')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load older revisions' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('1 change · 23 revisions checked')
    );
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByText('Beginning of history reached.')).toBeInTheDocument();
  });

  it('follows only the first parent and rejects cross-project or mismatched responses', async () => {
    const head = { ...commit('merge', 'first', 'New'), parents: ['first', 'other-branch'] };
    loadCommit.mockResolvedValue({ ...commit('first', null, 'Old'), project_id: 'wrong-project' });
    render(
      <StateNodeHistoryPanel commit={head} path="prd/outcome" name="outcome" onBack={vi.fn()} />
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('does not match');
    expect(loadCommit).toHaveBeenCalledExactlyOnceWith('first', 'project');
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  it('stops cyclic ancestry instead of looping', async () => {
    render(
      <StateNodeHistoryPanel
        commit={commit('cycle', 'cycle', 'value')}
        path="prd/outcome"
        name="outcome"
        onBack={vi.fn()}
      />
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('cycle');
    expect(loadCommit).not.toHaveBeenCalled();
  });
});
