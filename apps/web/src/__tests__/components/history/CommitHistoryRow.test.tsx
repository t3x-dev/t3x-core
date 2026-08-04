// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CommitHistoryRow } from '@/components/history/CommitHistoryRow';

describe('CommitHistoryRow', () => {
  it('opens a normal commit inside History', () => {
    const onOpen = vi.fn();
    render(
      <CommitHistoryRow
        author={{ type: 'human', name: 'W' }}
        branch="main"
        committedAt="2026-07-29T08:00:00.000Z"
        diffStats={{ addedCount: 1, modifiedCount: 2, removedCount: 0 }}
        hash="sha256:0530ef8"
        isFirst
        isLast
        message="Correct canonical PRD title and summary slots"
        nodeCount={1}
        parentCount={1}
        onOpen={onOpen}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /0530ef8/i }));
    expect(onOpen).toHaveBeenCalledWith('sha256:0530ef8');
  });

  it('opens a root commit inside History instead of navigating to Canvas', () => {
    const onOpen = vi.fn();
    render(
      <CommitHistoryRow
        author={{ type: 'human', name: 'W' }}
        branch="main"
        committedAt="2026-07-29T08:00:00.000Z"
        hash="sha256:root"
        isFirst
        isLast
        message="Seed state"
        parentCount={0}
        onOpen={onOpen}
      />
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /root/i }));
    expect(onOpen).toHaveBeenCalledWith('sha256:root');
  });
});
