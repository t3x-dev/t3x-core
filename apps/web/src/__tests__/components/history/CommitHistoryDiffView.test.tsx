// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CommitHistoryDiffView } from '@/components/history/CommitHistoryDiffView';
import type { ApiCommit } from '@/types/api';

const PARENT_COMMIT: ApiCommit = {
  author: { type: 'human', name: 'W' },
  branch: 'main',
  committed_at: '2026-07-28T08:00:00.000Z',
  content: {
    relations: [],
    trees: [
      {
        children: [],
        key: 'prd',
        slots: { description: 'Old recovery summary', title: 'Checkout Retry Recovery' },
      },
    ],
  },
  hash: 'sha256:2fc05d',
  message: 'Define retry recovery',
  parents: [],
  project_id: 'proj_test',
  provenance: { method: 'workspace' },
  schema: 't3x/commit/v2',
  sources: [],
};

const SELECTED_COMMIT: ApiCommit = {
  ...PARENT_COMMIT,
  committed_at: '2026-07-29T08:00:00.000Z',
  content: {
    relations: [],
    trees: [
      {
        children: [],
        key: 'prd',
        slots: {
          description: 'Traceable payment recovery path',
          title: 'Checkout Retry and Payment Recovery',
        },
      },
    ],
  },
  hash: 'sha256:0530ef8',
  message: 'Correct canonical PRD title and summary slots',
  parents: [PARENT_COMMIT.hash],
};

describe('CommitHistoryDiffView', () => {
  it('renders the source-matched YAML review with real commit data and selected values', () => {
    const onBack = vi.fn();
    render(
      <CommitHistoryDiffView
        commit={SELECTED_COMMIT}
        parentCommit={PARENT_COMMIT}
        onBack={onBack}
      />
    );

    expect(screen.getByRole('tab', { name: 'YAML diff' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('region', { name: 'Parent YAML' })).toHaveTextContent(
      'Old recovery summary'
    );
    expect(screen.getByRole('region', { name: 'Commit YAML' })).toHaveTextContent(
      'Traceable payment recovery path'
    );
    const inspector = screen.getByRole('complementary', { name: 'History change walkthrough' });
    expect(inspector).toHaveTextContent('Selected Change');
    expect(inspector).toHaveTextContent('Old recovery summary');
    expect(inspector).toHaveTextContent('Traceable payment recovery path');
    expect(screen.getAllByText('Parent').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Commit').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('keeps the existing structured diff available behind the source tab', () => {
    render(
      <CommitHistoryDiffView
        commit={SELECTED_COMMIT}
        parentCommit={PARENT_COMMIT}
        onBack={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Structure diff' }));
    expect(screen.getByRole('tab', { name: 'Structure diff' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    const tree = screen.getByRole('region', { name: 'Workspace structure rows' });
    expect(tree).toBeInTheDocument();
    expect(
      screen.getAllByRole('complementary', { name: 'History change walkthrough' })
    ).toHaveLength(1);
    fireEvent.click(within(tree).getByText('title'));
    expect(
      screen.getByRole('complementary', { name: 'History change walkthrough' })
    ).toHaveTextContent('Checkout Retry and Payment Recovery');
  });

  it('replays, pauses, steps and restores the complete comparison without mutating commits', () => {
    vi.useFakeTimers();
    try {
      const original = JSON.stringify([PARENT_COMMIT, SELECTED_COMMIT]);
      const { unmount } = render(
        <CommitHistoryDiffView
          commit={SELECTED_COMMIT}
          parentCommit={PARENT_COMMIT}
          onBack={vi.fn()}
        />
      );
      const controls = screen.getByRole('region', { name: 'Change walkthrough controls' });
      const progress = within(controls).getByRole('slider', { name: 'Walkthrough progress' });
      expect(progress).toHaveValue('1');
      fireEvent.click(within(controls).getByRole('button', { name: 'Pause walkthrough' }));
      fireEvent.change(progress, { target: { value: '0' } });
      expect(progress).toHaveValue('0');
      fireEvent.click(within(controls).getByRole('button', { name: 'Resume walkthrough' }));
      act(() => vi.advanceTimersByTime(3000));
      expect(progress).toHaveValue('1');
      fireEvent.click(within(controls).getByRole('button', { name: 'Pause walkthrough' }));
      act(() => vi.advanceTimersByTime(5000));
      expect(progress).toHaveValue('1');
      fireEvent.click(within(controls).getByRole('button', { name: 'Next change' }));
      expect(progress).toHaveValue('2');
      fireEvent.click(within(controls).getByRole('button', { name: 'Show full diff' }));
      expect(progress).toHaveValue('2');
      expect(JSON.stringify([PARENT_COMMIT, SELECTED_COMMIT])).toBe(original);
      unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('handles a root commit and an unchanged comparison without fabricated values', () => {
    const { rerender } = render(
      <CommitHistoryDiffView commit={PARENT_COMMIT} parentCommit={null} onBack={vi.fn()} />
    );
    expect(screen.getAllByText('empty', { exact: true }).length).toBeGreaterThan(0);
    expect(
      screen.getByRole('group', { name: 'Change totals' }).querySelector('[data-kind="added"]')
    ).toHaveTextContent('2');

    rerender(
      <CommitHistoryDiffView commit={PARENT_COMMIT} parentCommit={PARENT_COMMIT} onBack={vi.fn()} />
    );
    expect(screen.getByText('No state changes in this commit.')).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Change totals' }).querySelector('[data-kind="added"]')
    ).toHaveTextContent('0');
  });
});
