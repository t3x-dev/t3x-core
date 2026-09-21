import type { NativeYOp as YOp } from '@t3x-dev/core';
import { affectedNodeCards } from './lineage';
import {
  actionById,
  currentComposition,
  currentLineage,
  lineageForNode,
  mappingGet,
  replayToRevision,
  yValuesEqual,
} from './replay';
import type {
  CompensatePreview,
  DraftActionLedger,
  DraftActionView,
  DraftDocument,
  DraftNodeCard,
  DraftNodeHistoryView,
} from './types';

export function listDraftActions(
  ledger: DraftActionLedger
): readonly DraftActionLedger['actions'][number][] {
  return [...ledger.actions].reverse();
}

export function selectedActionView(
  ledger: DraftActionLedger,
  actionId?: string
): DraftActionView | null {
  const action = actionId === undefined ? ledger.actions.at(-1) : actionById(ledger, actionId);
  if (!action) return null;
  const before = replayToRevision(ledger, action.beforeRevision);
  const after = replayToRevision(ledger, action.afterRevision);
  return {
    action,
    cards: affectedNodeCards(
      before,
      after,
      ledger,
      action.beforeRevision,
      action.afterRevision,
      action.operations
    ),
  };
}

export function netDiffCards(ledger: DraftActionLedger): readonly DraftNodeCard[] {
  return affectedNodeCards(ledger.base, currentComposition(ledger), ledger);
}

export function nodeHistory(
  ledger: DraftActionLedger,
  nodeId: string,
  selectedActionId?: string
): DraftNodeHistoryView {
  const current = currentLineage(ledger).find((entry) => entry.nodeId === nodeId);
  const latest = lineageForNode(ledger, nodeId);
  const path = current?.path ?? latest?.path ?? null;
  const entries = [...ledger.actions].reverse().flatMap((action) => {
    const before = replayToRevision(ledger, action.beforeRevision);
    const after = replayToRevision(ledger, action.afterRevision);
    const cards = affectedNodeCards(
      before,
      after,
      ledger,
      action.beforeRevision,
      action.afterRevision,
      action.operations
    );
    const at = (revision: number) =>
      ledger.lineage.find(
        (entry) =>
          entry.nodeId === nodeId &&
          entry.fromRevision <= revision &&
          (entry.toRevision === null || entry.toRevision > revision)
      );
    const beforeLocation = at(action.beforeRevision);
    const afterLocation = at(action.afterRevision);
    const beforeValue = beforeLocation ? mappingGet(before, beforeLocation.path) : undefined;
    const afterValue = afterLocation ? mappingGet(after, afterLocation.path) : undefined;
    if (yValuesEqual(beforeValue, afterValue) && beforeLocation?.path === afterLocation?.path)
      return [];
    const card =
      cards.find((item) => item.nodeId === nodeId) ??
      cards.find(
        (item) =>
          (beforeLocation &&
            (item.beforePath === beforeLocation.path ||
              beforeLocation.path.startsWith(`${item.beforePath}/`))) ||
          (afterLocation &&
            (item.afterPath === afterLocation.path ||
              afterLocation.path.startsWith(`${item.afterPath}/`)))
      );
    return [
      {
        actionId: action.actionId,
        sequence: action.sequence,
        channel: action.channel,
        revision: action.afterRevision,
        before: beforeValue,
        after: afterValue,
        beforePath: beforeLocation?.path,
        afterPath: afterLocation?.path,
        ownerNodeId: card?.nodeId ?? nodeId,
        publishedAt: action.publishedAt,
        actor: action.actor,
        isSelected: selectedActionId === action.actionId,
      },
    ];
  });
  return {
    state: current ? 'present' : latest ? 'deleted' : 'unknown',
    nodeId,
    path,
    current: current ? mappingGet(currentComposition(ledger), current.path) : undefined,
    entries,
  };
}

export function previewCompensate(ledger: DraftActionLedger, actionId: string): CompensatePreview {
  const action = actionById(ledger, actionId);
  if (!action) throw new Error(`Unknown action ${actionId}`);
  const actionBefore = replayToRevision(ledger, action.beforeRevision);
  const actionAfter = replayToRevision(ledger, action.afterRevision);
  const current = currentComposition(ledger);
  const cards = affectedNodeCards(
    actionBefore,
    actionAfter,
    ledger,
    action.beforeRevision,
    action.afterRevision,
    action.operations
  );
  const conflicts: Array<CompensatePreview['conflicts'][number]> = [];
  const operations: YOp[] = [];
  for (const card of cards) {
    const identity = currentLineage(ledger).find((entry) => entry.path === card.path);
    const live = mappingGet(current, card.path);
    if (
      (card.after !== undefined && identity?.nodeId !== card.nodeId) ||
      (card.after === undefined && identity !== undefined) ||
      (card.beforePath !== undefined &&
        card.afterPath !== undefined &&
        card.beforePath !== card.afterPath) ||
      !yValuesEqual(live, card.after)
    ) {
      conflicts.push({ path: card.path, expected: card.after, current: live });
      continue;
    }
    operations.push(
      card.before === undefined
        ? { unset: { path: card.path } }
        : { set: { path: card.path, value: card.before as DraftDocument } }
    );
  }
  return { actionId, operations, conflicts };
}
