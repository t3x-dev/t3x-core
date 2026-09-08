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
  it('renders the selected historical snapshot through the shared State tree and History-only cards', () => {
    const onBack = vi.fn();
    render(
      <CommitHistoryDiffView
        commit={SELECTED_COMMIT}
        onBack={onBack}
        parentCommit={PARENT_COMMIT}
      />
    );

    expect(screen.getByLabelText('Structured state tree')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'T3X Diff' })).not.toBeInTheDocument();
    expect(screen.getByText('Parent 2fc05d → Selected 0530ef8')).toBeInTheDocument();

    const tree = screen.getByRole('region', { name: 'State rows' });
    fireEvent.click(within(tree).getByText('title'));
    const inspector = screen.getByRole('complementary', { name: 'History change walkthrough' });
    expect(
      within(inspector).getByRole('button', { name: 'Inspect change 2: prd/title (modified)' })
    ).toHaveAttribute('aria-expanded', 'true');
    expect(within(inspector).getByText('Checkout Retry and Payment Recovery')).toBeInTheDocument();
    expect(within(inspector).getByText('Checkout Retry Recovery')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit result' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Comment', exact: true })).not.toBeInTheDocument();
    expect(
      within(inspector).getAllByText('Verification results not loaded for this revision.').length
    ).toBeGreaterThan(0);
    expect(screen.queryByText('Replay matched · Schema valid')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back to commit history' }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('walks through real before/result values, pauses and restores the full diff without mutating commits', () => {
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
      const tree = screen.getByRole('region', { name: 'State rows' });
      const sidebar = screen.getByRole('complementary', { name: 'History change walkthrough' });
      fireEvent.click(within(sidebar).getByRole('button', { name: 'Replay again' }));
      expect(within(sidebar).getByRole('slider')).toHaveValue('0');
      expect(within(tree).getByText('Old recovery summary')).toBeInTheDocument();
      expect(within(tree).queryByText('Traceable payment recovery path')).not.toBeInTheDocument();
      act(() => vi.advanceTimersByTime(3000));
      expect(within(sidebar).getByRole('slider')).toHaveValue('1');
      expect(within(tree).getByText('Traceable payment recovery path')).toBeInTheDocument();
      expect(within(tree).getByText('Checkout Retry Recovery')).toBeInTheDocument();
      fireEvent.click(within(sidebar).getByRole('button', { name: 'Pause walkthrough' }));
      act(() => vi.advanceTimersByTime(5000));
      expect(within(sidebar).getByRole('slider')).toHaveValue('1');
      fireEvent.click(within(sidebar).getByRole('button', { name: 'Next change' }));
      expect(within(tree).getByText('Checkout Retry and Payment Recovery')).toBeInTheDocument();
      fireEvent.click(within(sidebar).getByRole('button', { name: 'Show full diff' }));
      expect(within(tree).getByText('Traceable payment recovery path')).toBeInTheDocument();
      expect(JSON.stringify([PARENT_COMMIT, SELECTED_COMMIT])).toBe(original);
      unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reconstructs added and removed groups at each playback boundary and rewinds to the parent', () => {
    const parent: ApiCommit = {
      ...PARENT_COMMIT,
      content: {
        relations: [],
        trees: [
          {
            key: 'root',
            slots: {},
            children: [
              { key: 'old_group', slots: { title: 'Previous', priority: 'should' }, children: [] },
            ],
          },
        ],
      },
    };
    const head: ApiCommit = {
      ...SELECTED_COMMIT,
      content: {
        relations: [],
        trees: [
          {
            key: 'root',
            slots: {},
            children: [
              { key: 'new_group', slots: { title: 'Result', priority: 'must' }, children: [] },
            ],
          },
        ],
      },
    };
    render(<CommitHistoryDiffView commit={head} parentCommit={parent} onBack={vi.fn()} />);
    const tree = screen.getByRole('region', { name: 'State rows' });
    const sidebar = screen.getByRole('complementary', { name: 'History change walkthrough' });
    const progress = within(sidebar).getByRole('slider');
    fireEvent.change(progress, { target: { value: '0' } });
    expect(within(tree).getByText('old_group')).toBeInTheDocument();
    expect(within(tree).queryByText('new_group')).not.toBeInTheDocument();
    expect(within(tree).getByText('Previous')).toBeInTheDocument();
    expect(within(tree).queryByText('Not yet added')).not.toBeInTheDocument();
    expect(within(sidebar).queryByRole('button', { expanded: true })).not.toBeInTheDocument();
    fireEvent.change(progress, { target: { value: '4' } });
    expect(within(tree).queryByText('old_group')).not.toBeInTheDocument();
    expect(within(tree).getByText('new_group')).toBeInTheDocument();
    expect(within(tree).getByText('Result')).toBeInTheDocument();
    expect(within(tree).queryByText('Previous')).not.toBeInTheDocument();
    fireEvent.change(progress, { target: { value: '0' } });
    expect(within(tree).getByText('old_group')).toBeInTheDocument();
    expect(within(tree).queryByText('new_group')).not.toBeInTheDocument();
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Show full diff' }));
    expect(within(tree).getByText('old_group')).toBeInTheDocument();
    expect(within(tree).getByText('new_group')).toBeInTheDocument();
  });

  it('diffs a root commit against an empty state', () => {
    render(
      <CommitHistoryDiffView commit={PARENT_COMMIT} onBack={() => undefined} parentCommit={null} />
    );

    expect(screen.getByText('Empty state → Selected 2fc05d')).toBeInTheDocument();
    expect(screen.getByLabelText('Structured state tree')).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'State rows' }).querySelector('[data-diff-kind="added"]')
    ).toBeInTheDocument();
  });

  it('keeps unchanged fields, removed fields, tree collapse and search', () => {
    const commit = {
      ...SELECTED_COMMIT,
      content: {
        relations: [],
        trees: [
          {
            key: 'prd',
            children: [],
            slots: { title: 'Checkout Retry Recovery', audience: 'Operators' },
          },
        ],
      },
    };
    render(<CommitHistoryDiffView commit={commit} parentCommit={PARENT_COMMIT} onBack={vi.fn()} />);
    const tree = screen.getByRole('region', { name: 'State rows' });
    expect(within(tree).getByText('title')).toBeInTheDocument();
    expect(within(tree).getByText('description').closest('tr')).toHaveAttribute(
      'data-diff-kind',
      'removed'
    );
    fireEvent.click(within(tree).getByRole('button', { name: 'Collapse prd', exact: true }));
    expect(within(tree).queryByText('audience')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search historical state' }), {
      target: { value: 'audience' },
    });
    expect(within(tree).getByText('audience')).toBeInTheDocument();
    expect(within(tree).queryByText('title')).not.toBeInTheDocument();
  });

  it('keeps History rows compact and shows full before/result in the selected card', () => {
    const original = JSON.stringify([PARENT_COMMIT, SELECTED_COMMIT]);
    render(
      <CommitHistoryDiffView
        commit={SELECTED_COMMIT}
        parentCommit={PARENT_COMMIT}
        onBack={vi.fn()}
      />
    );
    const tree = screen.getByRole('region', { name: 'State rows' });
    expect(within(tree).queryByText('Old recovery summary')).not.toBeInTheDocument();
    expect(within(tree).getByText('Traceable payment recovery path')).toBeInTheDocument();
    expect(within(tree).queryByText('Checkout Retry Recovery')).not.toBeInTheDocument();
    expect(within(tree).getByText('Checkout Retry and Payment Recovery')).toBeInTheDocument();
    fireEvent.click(within(tree).getByText('description'));
    const card = screen.getByRole('complementary', { name: 'History change walkthrough' });
    expect(within(card).getByText('Old recovery summary')).toBeInTheDocument();
    expect(within(card).getByText('Traceable payment recovery path')).toBeInTheDocument();
    const sidebar = screen.getByRole('complementary', { name: 'History change walkthrough' });
    expect(within(sidebar).getByRole('button', { name: 'Replay again' })).toBeEnabled();
    expect(within(sidebar).getByRole('slider', { name: 'Walkthrough progress' })).toHaveValue('2');
    expect(screen.getByText('~ 2 modified')).toBeInTheDocument();
    const search = screen.getByRole('textbox', { name: 'Search historical state' });
    expect(search).toBeEnabled();
    fireEvent.change(search, { target: { value: 'title' } });
    expect(within(tree).queryByText('Checkout Retry Recovery')).not.toBeInTheDocument();
    expect(within(tree).getByText('Checkout Retry and Payment Recovery')).toBeInTheDocument();
    expect(within(tree).queryByText('Old recovery summary')).not.toBeInTheDocument();
    expect(JSON.stringify([PARENT_COMMIT, SELECTED_COMMIT])).toBe(original);
  });

  it('shows added root values without fabricated before values', () => {
    render(<CommitHistoryDiffView commit={PARENT_COMMIT} parentCommit={null} onBack={vi.fn()} />);
    const tree = screen.getByRole('region', { name: 'State rows' });
    expect(within(tree).queryByLabelText('Before value')).not.toBeInTheDocument();
    expect(tree.querySelectorAll('[data-diff-exact="true"][data-diff-kind="added"]')).toHaveLength(
      2
    );
    expect(screen.getByText('+ 2 added')).toBeInTheDocument();
  });

  it('keeps a removed tree and all its original values available in the same view', () => {
    const removed: ApiCommit = { ...SELECTED_COMMIT, content: { relations: [], trees: [] } };
    render(
      <CommitHistoryDiffView commit={removed} parentCommit={PARENT_COMMIT} onBack={vi.fn()} />
    );
    const tree = screen.getByRole('region', { name: 'State rows' });
    expect(within(tree).getByText('Old recovery summary')).toBeInTheDocument();
    expect(within(tree).getByText('Checkout Retry Recovery')).toBeInTheDocument();
    expect(
      tree.querySelectorAll('[data-diff-exact="true"][data-diff-kind="removed"]')
    ).toHaveLength(2);
    expect(within(tree).queryByLabelText('Result value')).not.toBeInTheDocument();
    expect(screen.getByText('− 2 removed')).toBeInTheDocument();
    fireEvent.click(within(tree).getByRole('button', { name: 'Collapse prd', exact: true }));
    expect(within(tree).queryByText('description')).not.toBeInTheDocument();
    fireEvent.click(within(tree).getByRole('button', { name: 'Expand prd', exact: true }));
    expect(within(tree).getByText('description')).toBeInTheDocument();
  });

  it('expands changed collection groups by default while allowing manual collapse', () => {
    const parent: ApiCommit = {
      ...PARENT_COMMIT,
      content: {
        relations: [],
        trees: [
          {
            key: 'prd',
            slots: {},
            children: [
              {
                key: 'requirements',
                slots: {},
                children: [
                  {
                    key: 'checkout',
                    slots: { title: 'Old title', acceptance: ['Retry'] },
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    };
    const commit: ApiCommit = {
      ...SELECTED_COMMIT,
      content: {
        relations: [],
        trees: [
          {
            key: 'prd',
            slots: {},
            children: [
              {
                key: 'requirements',
                slots: {},
                children: [
                  {
                    key: 'checkout',
                    slots: { title: 'New title', acceptance: ['Retry'] },
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    };
    render(<CommitHistoryDiffView commit={commit} parentCommit={parent} onBack={vi.fn()} />);
    const tree = screen.getByRole('region', { name: 'State rows' });
    expect(within(tree).queryByText('Old title')).not.toBeInTheDocument();
    expect(within(tree).getByText('New title')).toBeInTheDocument();
    fireEvent.click(within(tree).getByRole('button', { name: 'Collapse checkout', exact: true }));
    expect(within(tree).queryByText('New title')).not.toBeInTheDocument();
  });

  it('keeps unchanged values neutral and reports an empty diff', () => {
    render(
      <CommitHistoryDiffView commit={PARENT_COMMIT} parentCommit={PARENT_COMMIT} onBack={vi.fn()} />
    );
    const tree = screen.getByRole('region', { name: 'State rows' });
    expect(screen.getByText('No state changes')).toBeInTheDocument();
    expect(within(tree).queryByLabelText('Before value')).not.toBeInTheDocument();
    expect(tree.querySelector('[data-diff-kind]')).toBeNull();
  });
});
