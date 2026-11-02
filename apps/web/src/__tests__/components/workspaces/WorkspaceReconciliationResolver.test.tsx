// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceReconciliationResolver } from '@/components/workspaces/WorkspaceReconciliationResolver';

describe('WorkspaceReconciliationResolver', () => {
  it('keeps Base/Ours/Theirs visible and requires a choice for every conflict', () => {
    const onResolve = vi.fn();
    render(
      <WorkspaceReconciliationResolver
        disabled={false}
        preparation={{
          schema: 't3x.application/workspace-reconciliation-preparation/v1',
          preparationDigest: `sha256:${'a'.repeat(64)}`,
          workspaceRevision: 4,
          refName: 'main',
          baseHead: `sha256:${'b'.repeat(64)}`,
          currentRefHead: `sha256:${'c'.repeat(64)}`,
          base: { candidate: { title: 'base' } },
          ours: { candidate: { title: 'mine' } },
          theirs: { candidate: { title: 'branch' } },
          merged: { candidate: { title: 'mine' } },
          conflicts: [
            {
              id: `sha256:${'d'.repeat(64)}`,
              path: '/candidate/title',
              kind: 'value',
              base: { source: 'base', present: true, value: 'base' },
              ours: { source: 'workspace_draft', present: true, value: 'mine' },
              theirs: { source: 'branch', present: true, value: 'branch' },
            },
          ],
        }}
        onResolve={onResolve}
      />
    );
    expect(screen.getByText('Base')).toBeTruthy();
    expect(screen.getByText('Your Draft')).toBeTruthy();
    expect(screen.getByText('Latest branch')).toBeTruthy();
    const apply = screen.getByRole('button', { name: 'Validate and apply resolutions' });
    expect(apply).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Use branch value' }));
    expect(apply).toBeEnabled();
    fireEvent.click(apply);
    expect(onResolve).toHaveBeenCalledWith([
      { conflict_id: `sha256:${'d'.repeat(64)}`, choice: 'theirs' },
    ]);
  });
});
