import type { WorkspaceAuthoringAction, WorkspaceAuthoringCard } from '@t3x-dev/api-client';
import { describe, expect, it } from 'vitest';
import {
  activityChangeKind,
  activityOperation,
  activityValue,
  composeEventCards,
  groupComposeActivity,
} from '@/domain/composeActivity';

function action(
  sequence: number,
  minute: number,
  channel: WorkspaceAuthoringAction['channel'] = 'manual',
  actor = 'Maya'
): WorkspaceAuthoringAction {
  return {
    actionId: `action-${sequence}`,
    sequence,
    channel,
    actor: { id: actor, kind: channel === 'manual' ? 'human' : 'agent' },
    publishedAt: new Date(Date.UTC(2026, 8, 21, 9, minute)).toISOString(),
    beforeRevision: sequence - 1,
    afterRevision: sequence,
    operations: [],
  };
}

describe('Compose event grouping', () => {
  it('describes added, removed, modified and mixed changes independently of their channel', () => {
    const base = { nodeId: 'n', path: 'rollout/approval' };
    expect(activityChangeKind([{ ...base, after: false }])).toBe('added');
    expect(activityChangeKind([{ ...base, before: null }])).toBe('removed');
    expect(activityChangeKind([{ ...base, before: false, after: true }])).toBe('modified');
    expect(
      activityChangeKind([
        { ...base, after: '' },
        { ...base, before: '' },
      ])
    ).toBe('mixed');
    expect(activityChangeKind([])).toBe('recorded');
    expect(activityChangeKind([base])).toBe('recorded');
  });
  it('keeps two hours of continuous edits in one event without a total-duration cutoff', () => {
    const actions = Array.from({ length: 7 }, (_, i) => action(i + 1, i * 20));
    const events = groupComposeActivity(actions.toReversed());
    expect(events).toHaveLength(1);
    expect(events[0].actions).toHaveLength(7);
    expect(events[0].startedAt).toBe(actions[0].publishedAt);
    expect(events[0].endedAt).toBe(actions[6].publishedAt);
  });

  it('starts a new event at exactly 30 minutes of inactivity', () => {
    const events = groupComposeActivity([action(1, 0), action(2, 29), action(3, 59)]);
    expect(events.map((event) => event.actions.length)).toEqual([1, 2]);
    expect(events[0].idleBeforeMs).toBe(30 * 60000);
  });

  it('splits manual edits around MCP and AI, even for the same actor', () => {
    const events = groupComposeActivity([
      action(1, 0),
      action(2, 1, 'mcp'),
      action(3, 2),
      action(4, 3, 'assistant'),
      action(5, 4, 'assistant'),
    ]);
    expect(events).toHaveLength(5);
    expect(events.map((event) => event.actions[0].channel)).toEqual([
      'assistant',
      'assistant',
      'manual',
      'mcp',
      'manual',
    ]);
    expect(events.every((event) => event.idleBeforeMs === 0)).toBe(true);
  });

  it('does not bridge actors, missing actions, mismatched revisions or invalid timestamps', () => {
    expect(groupComposeActivity([action(1, 0), action(2, 1, 'manual', 'Alex')])).toHaveLength(2);
    expect(groupComposeActivity([action(1, 0), action(3, 1)])).toHaveLength(2);
    expect(
      groupComposeActivity([action(1, 0), { ...action(2, 1), beforeRevision: 9 }])
    ).toHaveLength(2);
    expect(
      groupComposeActivity([action(1, 0), { ...action(2, 1), publishedAt: 'unknown' }])
    ).toHaveLength(2);
    expect(groupComposeActivity([action(1, 0), action(1, 0)])).toHaveLength(1);
  });

  it('compares the first before to the final after by stable node identity, retaining net-zero history', () => {
    const event = groupComposeActivity([action(1, 0), action(2, 1)])[0];
    const cards: Record<string, WorkspaceAuthoringCard[]> = {
      'action-1': [{ nodeId: 'allocation', path: 'rollout/allocation', before: 10, after: 20 }],
      'action-2': [{ nodeId: 'allocation', path: 'rollout/renamed', before: 20, after: 10 }],
    };
    expect(composeEventCards(event, cards)).toEqual([
      {
        nodeId: 'allocation',
        path: 'rollout/renamed',
        beforePath: 'rollout/allocation',
        before: 10,
        after: 10,
      },
    ]);
  });

  it('preserves false, null, empty strings and deletion without inventing source evidence', () => {
    expect(activityValue(false)).toBe('false');
    expect(activityValue(null)).toBe('null');
    expect(activityValue('')).toBe('""');
    expect(activityValue(undefined)).toBe('Absent');
    const operation = activityOperation({ nodeId: 'n', path: 'rollout/approval', before: false });
    expect(operation.op).toBe('unset');
    expect(operation.beforeValue).toBe(false);
    expect(operation.sourceRefs).toBeUndefined();
  });
});
