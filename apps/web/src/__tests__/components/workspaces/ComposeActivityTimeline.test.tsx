// @vitest-environment jsdom
import '@testing-library/jest-dom';
import type { WorkspaceAuthoringAction, WorkspaceAuthoringView } from '@t3x-dev/api-client';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ComposeActivityTimeline } from '@/components/workspaces/ComposeActivityTimeline';
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
    createAssistantConversation: vi.fn(),
  };
}

describe('ComposeActivityTimeline', () => {
  const renderCard = (
    operation: { id: string; beforeValue?: unknown; afterValue?: unknown },
    meta: { eventId: string; comparison: string }
  ) => (
    <div key={`${meta.eventId}:${operation.id}`} data-testid={`card-${operation.id}`}>
      {meta.comparison}: {String(operation.beforeValue)} → {String(operation.afterValue)}
    </div>
  );
  it('summarizes events without idle durations and expands an older row', () => {
    render(
      <ComposeActivityTimeline
        activity={fixture()}
        scope="latest"
        renderCard={renderCard}
        fallback={<div>legacy</div>}
        updatedAt="2026-09-21"
      />
    );
    expect(screen.queryByTestId('card-n3')).not.toBeInTheDocument();
    expect(screen.queryByTestId('card-n2')).not.toBeInTheDocument();
    expect(screen.queryByText(/idle/i)).not.toBeInTheDocument();
    expect(screen.queryByText('MCP')).not.toBeInTheDocument();
    expect(screen.getByText(/Sep 21/)).toHaveAttribute('data-compact', 'true');
    expect(screen.getAllByRole('img', { name: 'Modified fields' })).toHaveLength(4);
    expect(document.querySelector('.lucide-circle')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Adjust pilot allocation/ }));
    expect(screen.getByTestId('card-n2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Adjust pilot allocation/ }));
    expect(screen.queryByTestId('card-n2')).not.toBeInTheDocument();
    expect(screen.queryByText('legacy')).not.toBeInTheDocument();
  });
  it('shows Base-to-current values in All draft changes instead of the last event delta', () => {
    render(
      <ComposeActivityTimeline
        activity={fixture()}
        scope="all"
        renderCard={renderCard}
        fallback={null}
        updatedAt="2026-09-21"
      />
    );
    expect(screen.getByTestId('card-net')).toHaveTextContent('draft: 10 → 30');
    expect(screen.queryByLabelText('Change activity timeline')).not.toBeInTheDocument();
  });
  it('keeps legacy cards without claiming historic actors, channels or idle gaps', () => {
    render(
      <ComposeActivityTimeline
        activity={{ ...fixture(), enabled: false }}
        scope="latest"
        renderCard={renderCard}
        fallback={<div>Existing proposal cards</div>}
        updatedAt="2026-09-21"
      />
    );
    expect(screen.getByText('Existing proposal cards')).toBeInTheDocument();
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
        renderCard={renderCard}
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
        renderCard={renderCard}
        fallback={null}
        updatedAt="2026-09-21"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Load older events' }));
    expect(activity.loadOlder).toHaveBeenCalledOnce();
  });
});
