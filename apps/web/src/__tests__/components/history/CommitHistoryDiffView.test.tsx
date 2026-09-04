// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
  it('renders the selected historical snapshot through the same State tree and inspector', () => {
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
    const inspector = screen.getAllByLabelText('State change provenance')[0];
    expect(within(inspector).getByRole('heading', { name: 'title' })).toBeInTheDocument();
    expect(within(inspector).getByText('Checkout Retry and Payment Recovery')).toBeInTheDocument();
    expect(within(inspector).getByText('Checkout Retry Recovery')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit result' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Comment', exact: true })).not.toBeInTheDocument();
    expect(screen.getByText('Historical snapshot · Read-only')).toBeInTheDocument();
    expect(screen.getByText('Verification results not loaded')).toBeInTheDocument();
    expect(screen.queryByText('Replay matched · Schema valid')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back to commit history' }));
    expect(onBack).toHaveBeenCalledOnce();
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

  it('shows every modified field before and after together without a walkthrough', () => {
    const original = JSON.stringify([PARENT_COMMIT, SELECTED_COMMIT]);
    render(
      <CommitHistoryDiffView
        commit={SELECTED_COMMIT}
        parentCommit={PARENT_COMMIT}
        onBack={vi.fn()}
      />
    );
    const tree = screen.getByRole('region', { name: 'State rows' });
    expect(within(tree).getByText('Old recovery summary')).toBeInTheDocument();
    expect(within(tree).getByText('Traceable payment recovery path')).toBeInTheDocument();
    expect(within(tree).getByText('Checkout Retry Recovery')).toBeInTheDocument();
    expect(within(tree).getByText('Checkout Retry and Payment Recovery')).toBeInTheDocument();
    expect(within(tree).getAllByLabelText('Before value')).toHaveLength(2);
    expect(within(tree).getAllByLabelText('Result value')).toHaveLength(2);
    expect(
      screen.queryByRole('button', { name: /Next|Previous|View change process|Exit process/ })
    ).not.toBeInTheDocument();
    expect(screen.getByText('~ 2 modified')).toBeInTheDocument();
    const search = screen.getByRole('textbox', { name: 'Search historical state' });
    expect(search).toBeEnabled();
    fireEvent.change(search, { target: { value: 'title' } });
    expect(within(tree).getByText('Checkout Retry Recovery')).toBeInTheDocument();
    expect(within(tree).getByText('Checkout Retry and Payment Recovery')).toBeInTheDocument();
    expect(within(tree).queryByText('Old recovery summary')).not.toBeInTheDocument();
    expect(JSON.stringify([PARENT_COMMIT, SELECTED_COMMIT])).toBe(original);
  });

  it('shows added root values without fabricated before values', () => {
    render(<CommitHistoryDiffView commit={PARENT_COMMIT} parentCommit={null} onBack={vi.fn()} />);
    const tree = screen.getByRole('region', { name: 'State rows' });
    expect(within(tree).queryByLabelText('Before value')).not.toBeInTheDocument();
    expect(within(tree).getAllByLabelText('Result value')).toHaveLength(2);
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
    expect(within(tree).getAllByLabelText('Before value')).toHaveLength(2);
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
    expect(within(tree).getByText('Old title')).toBeInTheDocument();
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
