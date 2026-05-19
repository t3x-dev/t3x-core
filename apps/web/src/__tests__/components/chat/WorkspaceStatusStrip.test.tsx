// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceStatusStrip } from '@/components/chat/WorkspaceStatusStrip';
import { deriveWorkspaceStatusStripState } from '@/domain/workspace/actionBarState';

const baseFacts = {
  sourceCount: 3,
  materializedOpCount: 5,
  draftOpCount: 2,
  appliedOpCount: 5,
  pendingCount: 2,
  scriptDirty: false,
  hasDraft: true,
  hasResult: true,
  isCommitted: false,
  mode: 'idle' as const,
  isInheritedBaselineOnly: false,
  canApply: true,
  applyDisabledReason: null,
  branch: 'main',
};

describe('WorkspaceStatusStrip', () => {
  it('renders the five audit segments and routes clickable targets', () => {
    const onSelectView = vi.fn();

    render(
      <WorkspaceStatusStrip
        activeView="script"
        segments={deriveWorkspaceStatusStripState(baseFacts)}
        onSelectView={onSelectView}
      />
    );

    expect(screen.getByText('Sources')).toBeVisible();
    expect(screen.getByText('Ops')).toBeVisible();
    expect(screen.getByText('Pending')).toBeVisible();
    expect(screen.getByText('Applied')).toBeVisible();
    expect(screen.getByText('Commit')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: /Ops 5/i }));
    fireEvent.click(screen.getByRole('button', { name: /Pending 2/i }));
    fireEvent.click(screen.getByRole('button', { name: /Applied 5/i }));

    expect(onSelectView.mock.calls.map((call) => call[0])).toEqual(['script', 'draft', 'applied']);
  });

  it('uses commit tone for ready state instead of success tone', () => {
    render(
      <WorkspaceStatusStrip
        activeView="script"
        segments={deriveWorkspaceStatusStripState({
          ...baseFacts,
          hasDraft: false,
          draftOpCount: 0,
          pendingCount: 0,
          canApply: false,
          applyDisabledReason: 'Applied script is up to date',
        })}
        onSelectView={vi.fn()}
      />
    );

    expect(screen.getByTestId('workspace-status-commit')).toHaveClass(
      'text-[var(--accent-commit)]'
    );
  });
});
