import type { WorkspaceAuthoringCard } from '@t3x-dev/api-client';
import { applyYOps, resolvePath, type YOp, type YValue } from '@t3x-dev/yops';
import { activityOperation } from '@/domain/composeActivity';
import type { WorkspaceYOpsDraftOperation } from '@/types/workspaces';
import {
  type DraftYOp,
  draftOpReason,
  joinDraftPath,
  lastDraftPathSegment,
  parentDraftPath,
} from './draftStructure';

export interface StagedManualCard {
  id: string;
  operation: DraftYOp;
  card: WorkspaceAuthoringCard;
  reason: string;
  selected: boolean;
  createdAt: string;
}

export interface ManualStagingControls {
  items: StagedManualCard[];
  pending?: boolean;
  error?: string | null;
  onToggle: (id: string) => void;
  onSaveSelected: () => void;
}

export const MANUAL_STAGING_EVENT_ID = 'manual-staging';

export function applyDraftOpsToCurrent(current: unknown, operations: readonly DraftYOp[]): unknown {
  const result = applyYOps((current ?? {}) as YValue, operations as YOp[]);
  if (!result.ok) {
    throw new Error(result.error?.message ?? 'Could not apply this change.');
  }
  return result.doc;
}

export function draftValueAt(current: unknown, path: string): unknown {
  return current === undefined ? undefined : resolvePath(current as YValue, path);
}

export function draftOpFocus(operation: DraftYOp): { path: string; afterPath?: string } {
  const name = Object.keys(operation)[0];
  const body = Object.values(operation)[0] as {
    path?: string;
    from?: string;
    to?: string;
  };
  const path = body.path ?? body.from ?? '';
  if (name === 'rename' && body.to) {
    return { path, afterPath: joinDraftPath(parentDraftPath(path), body.to) };
  }
  if ((name === 'move' || name === 'clone') && body.to) {
    return { path, afterPath: joinDraftPath(body.to, lastDraftPathSegment(path)) };
  }
  return { path };
}

export function cardFromDraftOp(
  before: unknown,
  after: unknown,
  operation: DraftYOp
): WorkspaceAuthoringCard {
  const focus = draftOpFocus(operation);
  const beforeValue = draftValueAt(before, focus.path);
  const afterValue = draftValueAt(after, focus.afterPath ?? focus.path);
  return {
    nodeId: focus.afterPath ?? focus.path,
    path: focus.afterPath ?? focus.path,
    ...(focus.afterPath && focus.afterPath !== focus.path ? { beforePath: focus.path } : {}),
    ...(beforeValue !== undefined
      ? { before: beforeValue as WorkspaceAuthoringCard['before'] }
      : {}),
    ...(afterValue !== undefined ? { after: afterValue as WorkspaceAuthoringCard['after'] } : {}),
  };
}

export function stageDraftOp(
  current: unknown,
  operation: DraftYOp,
  reason = draftOpReason(operation)
): { current: unknown; item: StagedManualCard } {
  const next = applyDraftOpsToCurrent(current, [operation]);
  return {
    current: next,
    item: {
      id: `staged-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      operation,
      card: cardFromDraftOp(current, next, operation),
      reason,
      selected: true,
      createdAt: new Date().toISOString(),
    },
  };
}

export function stageDraftOps(
  current: unknown,
  operations: readonly DraftYOp[],
  reason?: string
): { current: unknown; items: StagedManualCard[] } {
  let next = current;
  const items: StagedManualCard[] = [];
  for (const operation of operations) {
    const staged = stageDraftOp(next, operation, reason ?? draftOpReason(operation));
    next = staged.current;
    items.push(staged.item);
  }
  return { current: next, items };
}

export function previewStagedCurrent<T>(
  published: T,
  items: readonly Pick<StagedManualCard, 'operation'>[]
): T {
  return items.length
    ? (applyDraftOpsToCurrent(
        published,
        items.map((item) => item.operation)
      ) as T)
    : published;
}

export function selectedStagedItems(items: readonly StagedManualCard[]) {
  return items.filter((item) => item.selected);
}

export function remainingStagedItems(items: readonly StagedManualCard[]) {
  return items.filter((item) => !item.selected);
}

export function stagedManualReason(items: readonly StagedManualCard[]) {
  if (items.length === 1) return items[0]!.reason;
  return `Manual edits (${items.length})`;
}

export function stagedActivityOperation(item: StagedManualCard): WorkspaceYOpsDraftOperation {
  return activityOperation(item.card, item.reason);
}

export const UNGROUPED_MANUAL_HINT =
  'Save every ungrouped manual change as a P before asking the assistant to add changes.';
