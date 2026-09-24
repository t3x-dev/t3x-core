import type {
  TransitionProtocolValue,
  WorkspaceAuthoringAction,
  WorkspaceAuthoringCard,
} from '@t3x-dev/api-client';
import type { WorkspaceYOpsDraftOperation } from '@/types/workspaces';

export interface ComposeActivityEvent {
  id: string;
  actions: WorkspaceAuthoringAction[];
  startedAt: string;
  endedAt: string;
  idleBeforeMs: number;
}
export interface ComposeActivityMeta {
  eventId: string;
  actionId?: string;
  actor?: string;
  channel?: WorkspaceAuthoringAction['channel'];
  timestamp?: string;
  comparison: 'event' | 'draft';
}
export interface ComposeActivitySelection {
  operation: WorkspaceYOpsDraftOperation;
  meta: ComposeActivityMeta;
}

/** Presentation grouping, not a new persisted session or a rewrite of the action ledger. */
export function groupComposeActivity(actions: readonly WorkspaceAuthoringAction[]) {
  const ordered = [...new Map(actions.map((a) => [a.actionId, a])).values()].sort(
    (a, b) => a.sequence - b.sequence
  );
  const events: ComposeActivityEvent[] = [];
  for (const action of ordered) {
    const event = events.at(-1);
    const previous = event?.actions.at(-1);
    const gap = previous ? Date.parse(action.publishedAt) - Date.parse(previous.publishedAt) : 0;
    const contiguous =
      previous &&
      action.sequence === previous.sequence + 1 &&
      action.beforeRevision === previous.afterRevision;
    const sameActor =
      previous &&
      action.actor.id === previous.actor.id &&
      action.actor.kind === previous.actor.kind &&
      action.actor.delegator?.id === previous.actor.delegator?.id &&
      action.actor.delegator?.kind === previous.actor.delegator?.kind;
    if (
      event &&
      contiguous &&
      sameActor &&
      previous?.channel === 'manual' &&
      action.channel === 'manual' &&
      Number.isFinite(gap) &&
      gap >= 0 &&
      gap < 30 * 60000
    ) {
      event.actions.push(action);
      event.endedAt = action.publishedAt;
    } else {
      events.push({
        id: action.actionId,
        actions: [action],
        startedAt: action.publishedAt,
        endedAt: action.publishedAt,
        idleBeforeMs: contiguous && Number.isFinite(gap) && gap >= 30 * 60000 ? gap : 0,
      });
    }
  }
  return events.reverse();
}

export function composeEventCards(
  event: ComposeActivityEvent,
  cards: Record<string, WorkspaceAuthoringCard[]>
) {
  const merged = new Map<string, WorkspaceAuthoringCard>();
  for (const action of event.actions)
    for (const card of cards[action.actionId] ?? []) {
      const first = merged.get(card.nodeId);
      merged.set(
        card.nodeId,
        first
          ? { ...card, before: first.before, beforePath: first.beforePath ?? first.path }
          : { ...card }
      );
    }
  return expandComposeActivityCards([...merged.values()]);
}

export function expandComposeActivityCards(cards: readonly WorkspaceAuthoringCard[]) {
  return cards.flatMap(expandComposeActivityCard);
}

function expandComposeActivityCard(card: WorkspaceAuthoringCard): WorkspaceAuthoringCard[] {
  if (JSON.stringify(card.before) === JSON.stringify(card.after)) return [];
  if (
    (Array.isArray(card.before) || card.before === undefined) &&
    (Array.isArray(card.after) || card.after === undefined)
  ) {
    const beforeByKey = keyedValues(card.before ?? []);
    const afterByKey = keyedValues(card.after ?? []);
    if (beforeByKey && afterByKey) {
      const keys = [...new Set([...beforeByKey.keys(), ...afterByKey.keys()])];
      return keys.flatMap((key) =>
        expandComposeActivityCard({
          ...card,
          path: `${card.path}/[key=${key}]`,
          before: beforeByKey.get(key),
          after: afterByKey.get(key),
        })
      );
    }
  }
  const before = recordValue(card.before);
  const after = recordValue(card.after);
  // Bootstrap stores the whole content envelope in one operation. Present its
  // nodes individually without changing the persisted action or lineage identity.
  if (card.path === 'content' && (!before || !after)) {
    const value = before ?? after;
    if (
      value &&
      Array.isArray(value.trees) &&
      Object.keys(value).every((key) => key === 'trees' || key === 'relations') &&
      (!Array.isArray(value.relations) || value.relations.length === 0)
    ) {
      const nodes = expandComposeActivityCard({
        ...card,
        path: `${card.path}/trees`,
        before: before?.trees as TransitionProtocolValue | undefined,
        after: after?.trees as TransitionProtocolValue | undefined,
      });
      if (nodes.length) return nodes;
    }
  }
  const addedOrRemoved = !before || !after ? (before ?? after) : null;
  if (
    addedOrRemoved &&
    Array.isArray(addedOrRemoved.children) &&
    addedOrRemoved.children.length > 0 &&
    Object.keys(addedOrRemoved).every((key) => ['key', 'slots', 'children'].includes(key)) &&
    Object.keys(recordValue(addedOrRemoved.slots) ?? {}).length === 0
  ) {
    return expandComposeActivityCard({
      ...card,
      path: `${card.path}/children`,
      before: before?.children as TransitionProtocolValue | undefined,
      after: after?.children as TransitionProtocolValue | undefined,
    });
  }
  if (before && after && Array.isArray(before.children) && Array.isArray(after.children)) {
    const beforeRest = { ...before, children: undefined };
    const afterRest = { ...after, children: undefined };
    if (JSON.stringify(beforeRest) === JSON.stringify(afterRest)) {
      return expandComposeActivityCard({
        ...card,
        path: `${card.path}/children`,
        before: before.children,
        after: after.children,
      });
    }
  }
  return [card];
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function keyedValues(values: readonly TransitionProtocolValue[]) {
  const entries = values.flatMap((value) => {
    const item = recordValue(value);
    return item && typeof item.key === 'string' ? [[item.key, value] as const] : [];
  });
  return entries.length === values.length
    ? new Map<string, TransitionProtocolValue>(entries)
    : null;
}

export function activityOperation(
  card: WorkspaceAuthoringCard,
  reason?: string
): WorkspaceYOpsDraftOperation {
  return {
    id: card.nodeId,
    path: card.path,
    op: card.after === undefined ? 'unset' : 'set',
    beforeValue: card.before,
    afterValue: card.after,
    reason,
    summary: reason ?? `Change ${card.path}`,
  };
}

/** The rail describes the change, while the channel badge describes its origin. */
export function activityChangeKind(cards: readonly WorkspaceAuthoringCard[]) {
  const kinds = new Set<'added' | 'removed' | 'modified'>();
  for (const card of cards) {
    if (card.before === undefined && card.after === undefined) continue;
    kinds.add(
      card.before === undefined ? 'added' : card.after === undefined ? 'removed' : 'modified'
    );
  }
  if (kinds.size > 1) return 'mixed' as const;
  return kinds.values().next().value ?? 'recorded';
}
export const activityChannelLabel = (channel?: WorkspaceAuthoringAction['channel']) =>
  channel ? { manual: 'Manual', mcp: 'MCP', assistant: 'AI', import: 'Import' }[channel] : 'Draft';
export const activityValue = (value: unknown) =>
  value === undefined
    ? 'Absent'
    : typeof value === 'string' && value
      ? value
      : JSON.stringify(value);
