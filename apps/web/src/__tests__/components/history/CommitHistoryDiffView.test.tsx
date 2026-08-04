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
  it('renders Parent to Selected changes through the reusable T3X Diff', () => {
    const onBack = vi.fn();
    render(
      <CommitHistoryDiffView
        commit={SELECTED_COMMIT}
        onBack={onBack}
        parentCommit={PARENT_COMMIT}
      />
    );

    expect(screen.getByRole('region', { name: 'T3X Diff' })).toBeInTheDocument();
    expect(screen.getByText('Commit · Parent → Selected commit')).toBeInTheDocument();
    expect(screen.getByText('Parent 2fc05d')).toBeInTheDocument();
    expect(screen.getByText('Selected 0530ef8')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'title' }));
    const after = screen.getByText('After').closest('section');
    expect(after).not.toBeNull();
    expect(
      within(after as HTMLElement).getByText('Checkout Retry and Payment Recovery')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back to commit history' }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('diffs a root commit against an empty state', () => {
    render(
      <CommitHistoryDiffView commit={PARENT_COMMIT} onBack={() => undefined} parentCommit={null} />
    );

    expect(screen.getByText('Root commit · Empty → Selected commit')).toBeInTheDocument();
    expect(screen.getByText('Empty state')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'T3X Diff' })).toBeInTheDocument();
  });
});
