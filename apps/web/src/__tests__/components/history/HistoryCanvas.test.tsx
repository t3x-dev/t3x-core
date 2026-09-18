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

  it('lets the canvas tools select, pan, reset, and download the graph', () => {
    const createObjectURL = vi.fn(() => 'blob:history');
    const revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    const { container } = render(
      <HistoryCanvas
        branches={[]}
        commits={[merge, feature, main, root].map((item) => ({ commit: item }))}
        selectedBranch="de-v"
        onBack={vi.fn()}
        onBranchChange={vi.fn()}
        onListView={vi.fn()}
        onViewDiff={vi.fn()}
      />
    );

    const canvas = screen.getByRole('region', { name: 'Commit graph canvas' });
    const viewport = container.querySelector('[data-history-viewport="true"]');
    expect(viewport).toHaveStyle({ transform: 'translate(0px, 0px) scale(1)' });

    fireEvent.click(screen.getByRole('button', { name: 'Pan tool' }));
    expect(screen.getByRole('button', { name: 'Pan tool' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    fireEvent.pointerDown(canvas, { clientX: 120, clientY: 80, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 180, clientY: 110, pointerId: 1 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });
    expect(viewport).toHaveStyle({ transform: 'translate(60px, 30px) scale(1)' });

    fireEvent.click(screen.getByRole('button', { name: 'Reset canvas view' }));
    expect(viewport).toHaveStyle({ transform: 'translate(0px, 0px) scale(1)' });
    expect(screen.getByRole('button', { name: 'Select tool' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    try {
      fireEvent.click(screen.getByRole('button', { name: 'Download canvas' }));
      expect(createObjectURL).toHaveBeenCalledOnce();
      expect(click).toHaveBeenCalledOnce();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:history');
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
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
