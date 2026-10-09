// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ComposeNodeHistoryPanel } from '@/components/workspaces/ComposeNodeHistoryPanel';
import type { ComposeActivitySelection } from '@/domain/composeActivity';
import type { useComposeActivity } from '@/hooks/workspaces/useComposeActivity';

function activityFixture() {
  const actions = [
    {
      actionId: 'a2',
      sequence: 2,
      beforeRevision: 1,
      afterRevision: 2,
      channel: 'manual',
      actor: { id: 'human:local-user', kind: 'human' },
      publishedAt: '2026-10-09T12:00:00Z',
      operations: [],
      reason: 'Raise allocation again',
    },
    {
      actionId: 'a1',
      sequence: 1,
      beforeRevision: 0,
      afterRevision: 1,
      channel: 'manual',
      actor: { id: 'human:local-user', kind: 'human' },
      publishedAt: '2026-10-09T11:00:00Z',
      operations: [],
      reason: 'Start a smaller canary',
    },
  ];
  const cards = {
    a2: [{ nodeId: 'allocation', path: 'rollout/allocation', before: 25, after: 30 }],
    a1: [{ nodeId: 'allocation', path: 'rollout/allocation', before: 20, after: 25 }],
  };
  return {
    actions,
    cards,
    compositionRevision: 2,
    cursor: null,
    nodeCursor: null,
    loading: false,
    nodeLoading: false,
    nodeError: null,
    notice: null,
    inspectNode: vi.fn(),
    loadOlderNode: vi.fn(),
    loadOlder: vi.fn(),
    publish: vi.fn().mockResolvedValue({ kind: 'published' }),
    view: {
      current: { rollout: { allocation: 30 } },
      netDiff: [{ nodeId: 'allocation', path: 'rollout/allocation', before: 20, after: 30 }],
    },
    node: {
      nodeId: 'allocation',
      path: 'rollout/allocation',
      current: 30,
      state: 'present',
      entries: actions.map((action) => ({
        ...action,
        revision: action.afterRevision,
        ownerNodeId: 'allocation',
        before: action.sequence === 2 ? 25 : 20,
        after: action.sequence === 2 ? 30 : 25,
        isSelected: action.actionId === 'a1',
      })),
    },
  } as unknown as ReturnType<typeof useComposeActivity>;
}

const selection: ComposeActivitySelection = {
  operation: {
    id: 'allocation',
    path: 'rollout/allocation',
    op: 'set',
    beforeValue: 20,
    afterValue: 25,
    summary: 'Start a smaller canary',
  },
  meta: { eventId: 'a1', actionId: 'a1', comparison: 'event' },
};

describe('Compose field Details', () => {
  it('keeps the current value distinct from a historical action and edits the current value', async () => {
    const activity = activityFixture();
    render(
      <ComposeNodeHistoryPanel
        activity={activity}
        selection={selection}
        onOpenAction={vi.fn()}
        onDiscuss={vi.fn()}
        onOpenStructure={vi.fn()}
      />
    );
    expect(screen.getByRole('region', { name: 'Current Draft value' })).toHaveTextContent('30');
    expect(screen.getByText('Selected action · A1')).toBeInTheDocument();
    expect(screen.getByText('Start a smaller canary')).toBeInTheDocument();
    expect(screen.queryByText('Raise allocation again')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit', exact: true }));
    expect(screen.getByLabelText('New value')).toHaveValue(30);
    fireEvent.change(screen.getByLabelText('New value'), { target: { value: '35' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Expand after checks' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save change' }));
    await waitFor(() =>
      expect(activity.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          operations: [{ set: { path: 'rollout/allocation', value: 35 } }],
          reason: 'Expand after checks',
        })
      )
    );
  });

  it('opens Chat and historical actions with the selected field context', () => {
    const onDiscuss = vi.fn();
    const onOpenAction = vi.fn();
    render(
      <ComposeNodeHistoryPanel
        activity={activityFixture()}
        selection={selection}
        onOpenAction={onOpenAction}
        onDiscuss={onDiscuss}
        onOpenStructure={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ask AI' }));
    expect(onDiscuss).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByText('History'));
    fireEvent.click(screen.getByRole('button', { name: 'View historical action A2' }));
    expect(onOpenAction).toHaveBeenCalledWith('a2', 'allocation', 'rollout/allocation');
  });

  it('uses Base to current Draft values for All changes', () => {
    const activity = activityFixture();
    render(
      <ComposeNodeHistoryPanel
        activity={activity}
        selection={{ ...selection, meta: { eventId: 'all', comparison: 'draft' } }}
        onOpenAction={vi.fn()}
        onDiscuss={vi.fn()}
        onOpenStructure={vi.fn()}
      />
    );
    expect(screen.getByText('Whole draft · Base → r2')).toBeInTheDocument();
    expect(screen.queryByText('Reason for this action')).not.toBeInTheDocument();
    expect(screen.queryByText('Selected action · A1')).not.toBeInTheDocument();
  });

  it('preserves primitive types when a field is expanded from a container action', () => {
    const activity = activityFixture();
    activity.node = {
      nodeId: 'allocation',
      path: 'rollout',
      state: 'present',
      current: { allocation: 30 },
      entries: [],
    };
    render(
      <ComposeNodeHistoryPanel
        activity={activity}
        selection={selection}
        onOpenAction={vi.fn()}
        onDiscuss={vi.fn()}
        onOpenStructure={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit', exact: true }));
    expect(screen.getByLabelText('New value')).toHaveValue(30);
    expect(screen.getByLabelText('New value')).toHaveAttribute('type', 'number');
  });

  it('shows real YAML and opens the existing full view without changing the draft', () => {
    const activity = activityFixture();
    const onOpenStructure = vi.fn();
    render(
      <ComposeNodeHistoryPanel
        activity={activity}
        selection={selection}
        onOpenAction={vi.fn()}
        onDiscuss={vi.fn()}
        onOpenStructure={onOpenStructure}
      />
    );
    fireEvent.click(screen.getByText('Structure & YAML'));
    fireEvent.click(screen.getByRole('button', { name: 'YAML', exact: true }));
    expect(screen.getByText(/allocation: 30/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open full view' }));
    expect(onOpenStructure).toHaveBeenCalledWith('yaml');
    expect(activity.publish).not.toHaveBeenCalled();
  });
});
