// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HistoryCanvas } from '@/components/history/HistoryCanvas';
import type { ApiCommit } from '@/types/api';

function commit(hash: string, message: string, parents: string[], branch = 'main'): ApiCommit {
  return {
    hash,
    schema: 't3x/commit/v2',
    project_id: 'proj_test',
    branch,
    parents,
    author: { type: 'human', name: 'Maya Chen' },
    committed_at: '2026-09-14T03:20:00Z',
    message,
    content: { trees: [], relations: [] },
    sources: [],
    provenance: null,
  };
}

const root = commit('sha256:root', 'Create release plan', []);
const main = commit('sha256:main', 'Refine rollout outcome', [root.hash]);
const feature = commit('sha256:feature', 'Canary rollout', [root.hash], 'feature/canary');
const merge = commit('sha256:merge', 'Merge PR #24', [main.hash, feature.hash]);

describe('HistoryCanvas', () => {
  it('lets the whole canvas branch pill change the selected branch', () => {
    const onBranchChange = vi.fn();
    render(
      <HistoryCanvas
        branches={[
          { branch_id: 'main', name: 'main' },
          { branch_id: 'de-v', name: 'de-v' },
        ]}
        commits={[{ commit: root }]}
        selectedBranch="de-v"
        onBack={vi.fn()}
        onBranchChange={onBranchChange}
        onListView={vi.fn()}
        onViewDiff={vi.fn()}
      />
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Canvas branch filter' }), {
      target: { value: 'main' },
    });
    expect(onBranchChange).toHaveBeenCalledWith('main');
  });

  it('keeps graph controls and diff navigation connected to history callbacks', () => {
    const onListView = vi.fn();
    const onViewDiff = vi.fn();
    render(
      <HistoryCanvas
        branches={[{ branch_id: 'main', name: 'main' }]}
        commits={[merge, feature, main, root].map((item) => ({ commit: item }))}
        selectedBranch="main"
        onBack={vi.fn()}
        onBranchChange={vi.fn()}
        onListView={onListView}
        onViewDiff={onViewDiff}
      />
    );

    expect(screen.getByRole('heading', { name: 'History Canvas' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'List View' }));
    expect(onListView).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'View Diff Changes' }));
    expect(onViewDiff).toHaveBeenCalledWith(merge.hash);
  });

  it('updates the inspector when a graph node is selected', () => {
    render(
      <HistoryCanvas
        branches={[]}
        commits={[merge, feature, main, root].map((item) => ({ commit: item }))}
        selectedBranch="all"
        onBack={vi.fn()}
        onBranchChange={vi.fn()}
        onListView={vi.fn()}
        onViewDiff={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Inspect Create release plan' }));
    expect(screen.getByRole('heading', { name: 'Create release plan' })).toBeInTheDocument();
    expect(screen.getByText('Root commit has no parent.')).toBeInTheDocument();
  });

  it('keeps connector coordinates in the same pixel space as the graph nodes', () => {
    const { container } = render(
      <HistoryCanvas
        branches={[]}
        commits={[merge, feature, main, root].map((item) => ({ commit: item }))}
        selectedBranch="all"
        onBack={vi.fn()}
        onBranchChange={vi.fn()}
        onListView={vi.fn()}
        onViewDiff={vi.fn()}
      />
    );

    const svg = container.querySelector('svg[data-history-edges="true"]');
    expect(svg).not.toHaveAttribute('viewBox');
    expect(svg).not.toHaveAttribute('preserveAspectRatio');

    const mainToMerge = container.querySelector(
      `path[data-parent-hash="${main.hash}"][data-child-hash="${merge.hash}"]`
    );
    expect(mainToMerge).toHaveAttribute('d', 'M 600 258 C 644 258, 636 408, 680 408');
  });
});
