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
              scope: 'content',
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
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    fireEvent.click(screen.getByRole('button', { name: 'Use branch value' }));
    expect(screen.getByRole('button', { name: 'Use branch value' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    expect(screen.getByText('All conflicts are resolved.')).toBeInTheDocument();
    expect(apply).toBeEnabled();
    fireEvent.click(apply);
    expect(onResolve).toHaveBeenCalledWith([
      { conflict_id: `sha256:${'d'.repeat(64)}`, choice: 'theirs' },
    ]);
  });

  it('shows only the changed keyed collection item', () => {
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
          base: {},
          ours: {},
          theirs: {},
          merged: {},
          conflicts: [
            {
              id: `sha256:${'d'.repeat(64)}`,
              path: '/content/trees',
              scope: 'content',
              kind: 'collection',
              base: {
                source: 'base',
                present: true,
                value: [
                  { key: 'unchanged-item', slots: { title: 'common-value' } },
                  { key: 'ai_qa', slots: { title: 'base-title' } },
                ],
              },
              ours: {
                source: 'workspace_draft',
                present: true,
                value: [
                  { key: 'unchanged-item', slots: { title: 'common-value' } },
                  { key: 'ai_qa', slots: { title: 'draft-title' } },
                ],
              },
              theirs: {
                source: 'branch',
                present: true,
                value: [
                  { key: 'unchanged-item', slots: { title: 'common-value' } },
                  { key: 'ai_qa', slots: { title: 'branch-title' } },
                ],
              },
            },
          ],
        }}
        onResolve={vi.fn()}
      />
    );

    expect(screen.queryByText(/common-value/)).not.toBeInTheDocument();
    expect(screen.queryByText(/unchanged-item/)).not.toBeInTheDocument();
    expect(screen.getByText(/base-title/)).toBeInTheDocument();
    expect(screen.getByText(/draft-title/)).toBeInTheDocument();
    expect(screen.getByText(/branch-title/)).toBeInTheDocument();
    expect(screen.getByText('ai_qa / title')).toBeInTheDocument();
    expect(document.querySelector('pre')).not.toBeInTheDocument();
  });

  it('shows a compact Schema contract choice instead of raw JSON', () => {
    const snapshot = (name: string, version: string) => ({
      status: 'bound',
      schemaHash: `sha256:${name}`,
      definition: { name, nodes: { hidden: { slots: { title: { type: 'string' } } } } },
      bindings: [{ canonicalName: name, schemaName: name, version }],
    });
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
          base: {},
          ours: {},
          theirs: {},
          merged: {},
          conflicts: [
            {
              id: `sha256:${'d'.repeat(64)}`,
              path: '/schema',
              scope: 'schema',
              kind: 'schema',
              base: { source: 'base', present: true, value: snapshot('Base contract', 'r1') },
              ours: {
                source: 'workspace_draft',
                present: true,
                value: snapshot('My contract', 'r2'),
              },
              theirs: {
                source: 'branch',
                present: true,
                value: snapshot('Branch contract', 'r3'),
              },
            },
          ],
        }}
        onResolve={vi.fn()}
      />
    );

    expect(screen.getByText('Schema contract')).toBeInTheDocument();
    expect(screen.getByText('Base contract · r1')).toBeInTheDocument();
    expect(screen.getByText('My contract · r2')).toBeInTheDocument();
    expect(screen.getByText('Branch contract · r3')).toBeInTheDocument();
    expect(screen.queryByText(/hidden/)).not.toBeInTheDocument();
    expect(document.querySelector('pre')).not.toBeInTheDocument();
  });
});
