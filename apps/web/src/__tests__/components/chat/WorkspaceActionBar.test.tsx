// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceActionBar } from '@/components/chat/WorkspaceActionBar';
import { deriveWorkspaceActionBarState } from '@/domain/workspace/actionBarState';

const baseFacts = {
  scriptDirty: false,
  hasDraft: false,
  hasResult: true,
  isCommitted: false,
  mode: 'idle' as const,
  isInheritedBaselineOnly: false,
  canApply: false,
  applyDisabledReason: 'Applied script is up to date',
  branch: 'main',
};

describe('WorkspaceActionBar', () => {
  it('routes dirty script actions through explicit enabled buttons', () => {
    const onRunScript = vi.fn();
    const onDiscard = vi.fn();
    const state = deriveWorkspaceActionBarState({
      ...baseFacts,
      scriptDirty: true,
      canApply: true,
      applyDisabledReason: null,
    });

    render(
      <WorkspaceActionBar
        state={state}
        onRunScript={onRunScript}
        onApplyChanges={vi.fn()}
        onDiscardChanges={onDiscard}
        onCommit={vi.fn()}
        onContinueEditing={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Run script' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));

    expect(onRunScript).toHaveBeenCalledTimes(1);
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it('renders blocked commit reason on the disabled button', () => {
    const state = deriveWorkspaceActionBarState({
      ...baseFacts,
      hasResult: false,
    });

    render(
      <WorkspaceActionBar
        state={state}
        onRunScript={vi.fn()}
        onApplyChanges={vi.fn()}
        onDiscardChanges={vi.fn()}
        onCommit={vi.fn()}
        onContinueEditing={vi.fn()}
      />
    );

    const button = screen.getByRole('button', { name: 'Commit · main' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute(
      'title',
      'Extract, edit, or Apply new YOps before committing this conversation'
    );
  });
});
