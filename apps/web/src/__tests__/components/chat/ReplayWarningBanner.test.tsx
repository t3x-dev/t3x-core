// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReplayWarningBanner } from '@/components/chat/ReplayWarningBanner';

vi.mock('@/hooks/conversations/useReplayWarningActions', () => ({
  useReplayWarningActions: () => ({
    replayWarning: {
      opIndex: 3,
      rowId: 'yl_bad',
      code: 'ALREADY_EXISTS',
      message: 'Path "trip" already exists',
      appliedCount: 3,
    },
    busy: false,
    dismiss: vi.fn(),
    removeFailingOp: vi.fn(),
    deleteFailingEntry: vi.fn(),
  }),
}));

describe('ReplayWarningBanner', () => {
  it('separates op-level repair from entry-level delete in its actions', () => {
    render(<ReplayWarningBanner />);

    expect(screen.getByRole('button', { name: 'Remove failing op' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete failing entry' })).toBeInTheDocument();
    expect(screen.queryByText('Delete this op')).not.toBeInTheDocument();
  });
});
