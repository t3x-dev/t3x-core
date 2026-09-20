import type { YOp } from '@t3x-dev/core';
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
    cards: affectedNodeCards(before, after, ledger),
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
    const cards = affectedNodeCards(before, after, ledger);
    const card = cards.find((item) => item.nodeId === nodeId);
    if (!card) return [];
    return [
      {
        actionId: action.actionId,
        sequence: action.sequence,
        channel: action.channel,
        revision: action.afterRevision,
        before: card.before,
        after: card.after,
        isSelected: selectedActionId === action.actionId,
      },
    ];
  });
  return {
    nodeId,
    path,
    current: path ? mappingGet(currentComposition(ledger), path) : undefined,
    entries,
  };
}

export function previewCompensate(ledger: DraftActionLedger, actionId: string): CompensatePreview {
  const action = actionById(ledger, actionId);
  if (!action) throw new Error(`Unknown action ${actionId}`);
  const actionBefore = replayToRevision(ledger, action.beforeRevision);
  const actionAfter = replayToRevision(ledger, action.afterRevision);
  const current = currentComposition(ledger);
  const cards = affectedNodeCards(actionBefore, actionAfter, ledger);
  const conflicts: Array<CompensatePreview['conflicts'][number]> = [];
  const operations: YOp[] = [];
  for (const card of cards) {
    const live = mappingGet(current, card.path);
    if (!yValuesEqual(live, card.after)) {
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
