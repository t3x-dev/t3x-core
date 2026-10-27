// @vitest-environment jsdom
import '@testing-library/jest-dom';
import type { WorkspaceAuthoringAction, WorkspaceAuthoringView } from '@t3x-dev/api-client';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ComposeActivityChangeRow } from '@/components/workspaces/ComposeActivityChangeRow';
import { ComposeActivityTimeline } from '@/components/workspaces/ComposeActivityTimeline';
import { stageDraftOps } from '@/domain/workspaces/manualStaging';
import type { useComposeActivity } from '@/hooks/workspaces/useComposeActivity';

function fixture(): ReturnType<typeof useComposeActivity> {
  const actions: WorkspaceAuthoringAction[] = [
    ['Prepare the pilot', 'manual', '09:00'],
    ['Sync rollout regions', 'mcp', '11:06'],
    ['Adjust pilot allocation', 'manual', '11:18'],
    ['Refine release controls', 'manual', '11:53'],
  ].map(([reason, channel, time], i) => ({
    actionId: `a${i}`,
    sequence: i + 1,
    channel: channel as WorkspaceAuthoringAction['channel'],
    actor: {
      id: channel === 'mcp' ? 'Release bot' : 'Maya',
      kind: channel === 'mcp' ? 'agent' : 'human',
    },
    publishedAt: `2026-09-21T${time}:00Z`,
    beforeRevision: i,
    afterRevision: i + 1,
    operations: [],
    reason,
  }));
  const cards = Object.fromEntries(
    actions.map((action, i) => [
      action.actionId,
      [
        {
          nodeId: `n${i}`,
          path: i === 1 ? 'rollout/regions' : 'rollout/allocation',
          before: 10 + i * 5,
          after: 15 + i * 5,
        },
      ],
    ])
  );
  const view: WorkspaceAuthoringView = {
    schema: 't3x.application/workspace-authoring-view/v1',
    projectionVersion: 1,
    workspaceRevision: 4,
    compositionRevision: 4,
    basis: { refName: 'main', refHead: null, baseDigest: 'base' },
    actions,
    selected: { action: actions[3], cards: cards.a3 },
    netDiff: [{ nodeId: 'net', path: 'rollout/allocation', before: 10, after: 30 }],
    node: null,
    nextBeforeSequence: null,
  };
  return {
    enabled: true,
    loading: false,
    error: null,
    actions,
    cards,
    view,
    cursor: null,
    node: null,
    nodeLoading: false,
    nodeError: null,
    nodeCursor: null,
    notice: null,
    newActivity: null,
    compositionRevision: 4,
    workspaceRevision: 4,
    basis: view.basis,
    refresh: vi.fn(),
    loadOlder: vi.fn(),
    loadLatest: vi.fn(),
    inspectNode: vi.fn(),
    selectActionNode: vi.fn(),
    loadOlderNode: vi.fn(),
    publish: vi.fn(),
    publishCandidate: vi.fn(),
    confirmDeletion: vi.fn(),
    createAssistantConversation: vi.fn(),
  };
}

describe('ComposeActivityTimeline', () => {
  const renderRow = (
    operation: { id: string; beforeValue?: unknown; afterValue?: unknown },
    meta: { eventId: string; comparison: string }
  ) => (
    <div key={`${meta.eventId}:${operation.id}`} data-testid={`row-${operation.id}`}>
      {meta.comparison}: {String(operation.beforeValue)} → {String(operation.afterValue)}
    </div>
  );
  it('confirms only the selected generated deletion and retains its confirmed state', async () => {
    const activity = fixture();
    activity.actions[3] = {
      ...activity.actions[3],
      channel: 'assistant',
      deletionConfirmation: { status: 'required', paths: ['candidate/phone'] },
    };
    activity.confirmDeletion = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <ComposeActivityTimeline
        activity={activity}
        scope="latest"
        updatedAt="2026-09-21T11:53:00Z"
        fallback={null}
        renderRow={renderRow}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirm deletion', exact: true }));
    await waitFor(() => expect(activity.confirmDeletion).toHaveBeenCalledWith('a3'));
    activity.actions[3] = {
      ...activity.actions[3],
      deletionConfirmation: { status: 'confirmed', paths: ['candidate/phone'] },
    };
    rerender(
      <ComposeActivityTimeline
        activity={activity}
        scope="latest"
        updatedAt="2026-09-21T11:53:00Z"
        fallback={null}
        renderRow={renderRow}
      />
    );
    expect(screen.getByText('已人工确认删除')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Confirm deletion', exact: true })
    ).not.toBeInTheDocument();
  });
  it('orders Schema cards alongside content events with the same date groups and rail', () => {
    render(
      <ComposeActivityTimeline
        activity={fixture()}
        scope="latest"
        renderRow={renderRow}
        fallback={null}
        updatedAt="2026-09-21"
        schemaEvent={{
          id: 'schema-one',
          timestamp: '2026-09-21T11:30:00Z',
          content: <section aria-label="Schema saved to Draft">Add Slot · owner</section>,
        }}
      />
    );
    const timeline = screen.getByRole('region', { name: 'Change activity timeline' });
    const events = within(timeline).getAllByRole('region', { name: /^Event:/ });
    expect(events.map((event) => event.getAttribute('aria-label'))).toEqual([
      'Event: Refine release controls',
      'Event: Schema structure change',
      'Event: Adjust pilot allocation',
      'Event: Sync rollout regions',
      'Event: Prepare the pilot',
    ]);
    expect(
      within(events[1]!).getByRole('region', { name: 'Schema saved to Draft' })
    ).toHaveTextContent('Add Slot · owner');
    expect(events[1]!.querySelector('time')).toHaveAttribute('dateTime', '2026-09-21T11:30:00Z');
    expect(screen.getAllByText(/Sep 21/)).toHaveLength(1);
    expect(events[1]).not.toHaveAttribute('data-latest');
  });
  it('shows a Schema-only event as the latest activity without an empty-content message', () => {
    render(
      <ComposeActivityTimeline
        activity={{ ...fixture(), actions: [], cards: {} }}
        scope="latest"
        renderRow={renderRow}
        fallback={null}
        updatedAt="2026-09-21"
        schemaEvent={{
          id: 'schema-only',
          timestamp: '2026-09-22T12:00:00Z',
          content: <div>Schema candidate</div>,
        }}
      />
    );
    expect(screen.getByRole('region', { name: 'Event: Schema structure change' })).toHaveAttribute(
      'data-latest',
      'true'
    );
    expect(screen.queryByText('No matching changes.')).not.toBeInTheDocument();
  });
  it('keeps the Schema card available in all-changes view and when content activity is loading', () => {
    const props = {
      activity: fixture(),
      scope: 'all' as const,
      renderRow,
      fallback: null,
      updatedAt: '2026-09-21',
      schemaEvent: {
        id: 'schema',
        timestamp: '2026-09-22T12:00:00Z',
        content: <div>Schema candidate</div>,
      },
    };
    const { rerender } = render(<ComposeActivityTimeline {...props} />);
    expect(screen.getByRole('region', { name: 'Schema change timeline' })).toHaveTextContent(
      'Schema candidate'
    );
    expect(screen.getByRole('region', { name: 'All draft changes' })).toBeVisible();
    rerender(
      <ComposeActivityTimeline
        {...props}
        scope="latest"
        activity={{ ...fixture(), loading: true }}
      />
    );
    expect(screen.getByRole('region', { name: 'Schema change timeline' })).toHaveTextContent(
      'Schema candidate'
    );
  });
  it('keeps event rows visible without expandable cards', () => {
    render(
      <ComposeActivityTimeline
        activity={fixture()}
        scope="latest"
        renderRow={renderRow}
        fallback={<div>legacy</div>}
        updatedAt="2026-09-21"
      />
    );
    expect(screen.getByTestId('row-n3')).toHaveTextContent('event: 25 → 30');
    expect(screen.getByTestId('row-n2')).toHaveTextContent('event: 20 → 25');
    expect(screen.queryByText(/idle/i)).not.toBeInTheDocument();
    expect(screen.queryByText('MCP')).not.toBeInTheDocument();
    expect(screen.getByText(/Sep 21/)).toHaveAttribute('data-compact', 'true');
    expect(screen.getAllByRole('img', { name: 'Modified fields' })).toHaveLength(4);
    expect(document.querySelector('.lucide-circle')).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Adjust pilot allocation/ })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('legacy')).not.toBeInTheDocument();
  });

  it('shows one staged object row with every field and keeps each operation independently selectable', () => {
    const current = {
      tasks: [{ key: 'kaifeiji', slots: { goal: '开飞机', done: false }, children: [] }],
    };
    const staged = stageDraftOps(current, [
      { set: { path: 'tasks/[key=kaifeiji]/slots/goal', value: '学习开飞机' } },
      { set: { path: 'tasks/[key=kaifeiji]/slots/done', value: true } },
    ]);
    staged.items[1].selected = false;
    const onToggle = vi.fn();
    const onSaveSelected = vi.fn();
    const onSelect = vi.fn();
    render(
      <ComposeActivityTimeline
        activity={fixture()}
        scope="latest"
        updatedAt="2026-09-21"
        fallback={null}
        staging={{ items: staged.items, current, onToggle, onSaveSelected }}
        renderRow={(operation, meta) => (
          <ComposeActivityChangeRow
            key={`${meta?.eventId}:${operation.path}`}
            operation={operation}
            selected={false}
            applied={false}
            onSelect={() => onSelect(operation, meta)}
          />
        )}
      />
    );
    const tray = within(screen.getByRole('region', { name: 'Event: Ungrouped manual changes' }));
    expect(tray.getAllByRole('button', { name: /Inspect Kaifeiji/ })).toHaveLength(1);
    expect(tray.getByRole('group', { name: '2 changed fields' })).toHaveTextContent('goal:');
    expect(tray.getByRole('group', { name: '2 changed fields' })).toHaveTextContent('done:NoYes');
    const checkboxes = tray.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
    fireEvent.click(checkboxes[1]);
    expect(onToggle).toHaveBeenCalledWith(staged.items[1].id);
    fireEvent.click(tray.getByRole('button', { name: 'Save selected as P (1)' }));
    expect(onSaveSelected).toHaveBeenCalledOnce();
    fireEvent.click(tray.getByRole('button', { name: /Inspect Kaifeiji/ }));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'tasks/[key=kaifeiji]',
        objectChange: expect.objectContaining({ sources: staged.items.map((item) => item.card) }),
      }),
      expect.objectContaining({ eventId: 'manual-staging' })
    );
  });
  it('shows Base-to-current values in All draft changes instead of the last event delta', () => {
    render(
      <ComposeActivityTimeline
        activity={fixture()}
        scope="all"
        renderRow={renderRow}
        fallback={null}
        updatedAt="2026-09-21"
      />
    );
    expect(screen.getByTestId('row-net')).toHaveTextContent('draft: 10 → 30');
    expect(screen.queryByLabelText('Change activity timeline')).not.toBeInTheDocument();
  });
  it('keeps fallback rows without claiming historic actors, channels or idle gaps', () => {
    render(
      <ComposeActivityTimeline
        activity={{ ...fixture(), enabled: false }}
        scope="latest"
        renderRow={renderRow}
        fallback={<div>Existing proposal rows</div>}
        updatedAt="2026-09-21"
      />
    );
    expect(screen.getByText('Existing proposal rows')).toBeInTheDocument();
    expect(
      screen.getByText('Earlier event history is not available for this draft.')
    ).toBeInTheDocument();
    expect(screen.queryByText('Maya')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Event history unavailable' })).toBeInTheDocument();
  });
  it('exposes read errors with retry, and loads older pages explicitly', () => {
    const activity = fixture();
    const { rerender } = render(
      <ComposeActivityTimeline
        activity={{ ...activity, error: 'Cannot load activity' }}
        scope="latest"
        renderRow={renderRow}
        fallback={null}
        updatedAt="2026-09-21"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(activity.refresh).toHaveBeenCalledOnce();
    rerender(
      <ComposeActivityTimeline
        activity={{ ...activity, cursor: 4 }}
        scope="latest"
        renderRow={renderRow}
        fallback={null}
        updatedAt="2026-09-21"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Load older events' }));
    expect(activity.loadOlder).toHaveBeenCalledOnce();
  });
  it('keeps ungrouped manual changes in Latest and saves the selected subset as one P', () => {
    const onToggle = vi.fn();
    const onSaveSelected = vi.fn();
    render(
      <ComposeActivityTimeline
        activity={fixture()}
        scope="latest"
        renderRow={renderRow}
        fallback={null}
        updatedAt="2026-09-21"
        staging={{
          items: [
            {
              id: 'staged-1',
              operation: { set: { path: 'rollout/allocation', value: 30 } },
              card: { nodeId: 'staged-a', path: 'rollout/allocation', before: 25, after: 30 },
              reason: 'set rollout/allocation',
              selected: true,
              createdAt: '2026-09-21T12:00:00Z',
            },
            {
              id: 'staged-2',
              operation: { set: { path: 'rollout/regions', value: 'us' } },
              card: { nodeId: 'staged-b', path: 'rollout/regions', after: 'us' },
              reason: 'set rollout/regions',
              selected: false,
              createdAt: '2026-09-21T12:01:00Z',
            },
          ],
          onToggle,
          onSaveSelected,
        }}
      />
    );
    expect(screen.getByText('Ungrouped manual changes')).toBeInTheDocument();
    expect(screen.getAllByText('Latest')).toHaveLength(1);
    expect(
      screen.getByRole('checkbox', { name: 'Include Allocation in the next P' })
    ).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Include Regions in the next P' })
    ).not.toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Include Regions in the next P' }));
    expect(onToggle).toHaveBeenCalledWith('staged-2');
    fireEvent.click(screen.getByRole('button', { name: 'Save selected as P (1)' }));
    expect(onSaveSelected).toHaveBeenCalledOnce();
    expect(screen.getByTestId('row-staged-a')).toBeInTheDocument();
    expect(screen.getByTestId('row-staged-b')).toBeInTheDocument();
  });
});
