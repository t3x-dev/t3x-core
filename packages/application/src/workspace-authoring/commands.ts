import type { YOp } from '@t3x-dev/core';
import { applyDraftYOps } from './document';
import { nextLineage } from './lineage';
import {
  actionById,
  createDraftActionLedger,
  currentComposition,
  mappingGet,
  mappingKeys,
  operationsDigest,
  replayToRevision,
  yValuesEqual,
} from './replay';
import {
  DRAFT_ACTION_SCHEMA,
  type DraftActionLedger,
  type DraftActionRecord,
  type DraftDocument,
  type PublishDraftActionInput,
  type PublishDraftActionResult,
} from './types';

export function publishDraftAction(
  ledger: DraftActionLedger,
  input: PublishDraftActionInput
): PublishDraftActionResult {
  const existing = actionById(ledger, input.actionId);
  const digest = operationsDigest(input.operations);
  if (existing) {
    if (existing.operationsDigest === digest) {
      return { kind: 'reused', ledger, action: existing };
    }
    return {
      kind: 'conflict',
      ledger,
      reason: 'idempotency_mismatch',
      message: `Action ${input.actionId} was published with different operations`,
    };
  }

  if (input.targetRevision !== undefined && input.targetRevision !== ledger.compositionRevision) {
    return {
      kind: 'rejected',
      ledger,
      reason: 'historical_write',
      message: `Writes must target current revision ${ledger.compositionRevision}, not ${input.targetRevision}`,
    };
  }

  if (input.expectedRevision !== ledger.compositionRevision) {
    return {
      kind: 'conflict',
      ledger,
      reason: 'stale_revision',
      message: `Expected revision ${input.expectedRevision}, current is ${ledger.compositionRevision}`,
    };
  }

  const before = currentComposition(ledger);
  const applied = applyDraftYOps(before, input.operations);
  if (!applied.ok) {
    return {
      kind: 'rejected',
      ledger,
      reason: 'apply_failed',
      message: applied.message,
    };
  }
  const after = applied.doc;
  if (yValuesEqual(before, after)) {
    return {
      kind: 'no_change',
      ledger,
      receipt: {
        actionId: input.actionId,
        outcome: 'no_change',
        expectedRevision: input.expectedRevision,
        compositionRevision: ledger.compositionRevision,
        message: 'No successful action: document is unchanged',
      },
    };
  }

  const afterRevision = ledger.compositionRevision + 1;
  const action: DraftActionRecord = {
    schema: DRAFT_ACTION_SCHEMA,
    actionId: input.actionId,
    sequence: ledger.actions.length + 1,
    channel: input.channel,
    actor: input.actor,
    publishedAt: input.publishedAt,
    beforeRevision: ledger.compositionRevision,
    afterRevision,
    operations: Object.freeze([...input.operations]),
    operationsDigest: digest,
    ...(input.reason ? { reason: input.reason } : {}),
  };
  const next: DraftActionLedger = {
    ...ledger,
    compositionRevision: afterRevision,
    actions: Object.freeze([...ledger.actions, action]),
    lineage: nextLineage(ledger, input.operations, before, after, afterRevision),
  };
  return { kind: 'published', ledger: next, action };
}

export function importLegacyDocument(input: {
  base: DraftDocument;
  current: DraftDocument;
  actionId: string;
  publishedAt: string;
  actor: PublishDraftActionInput['actor'];
  reason: string;
}): PublishDraftActionResult {
  return publishDraftAction(createDraftActionLedger(input.base), {
    actionId: input.actionId,
    channel: 'import',
    actor: input.actor,
    operations: diffSetOps(input.base, input.current),
    expectedRevision: 0,
    publishedAt: input.publishedAt,
    reason: input.reason,
  });
}

function diffSetOps(base: DraftDocument, current: DraftDocument): YOp[] {
  const keys = [...mappingKeys(current)];
  for (const key of mappingKeys(base)) {
    if (!keys.includes(key)) keys.push(key);
  }
  const operations: YOp[] = [];
  for (const path of keys) {
    const from = mappingGet(base, path);
    const to = mappingGet(current, path);
    if (yValuesEqual(from, to)) continue;
    operations.push(to === undefined ? { unset: { path } } : { set: { path, value: to } });
  }
  return operations;
}

export function restoreNodeToAction(
  ledger: DraftActionLedger,
  nodeId: string,
  actionId: string
): { operations: YOp[]; path: string; value: DraftDocument | undefined } {
  const action = actionById(ledger, actionId);
  if (!action) throw new Error(`Unknown action ${actionId}`);
  const before = replayToRevision(ledger, action.beforeRevision);
  const after = replayToRevision(ledger, action.afterRevision);
  const lineage = ledger.lineage.find(
    (entry) =>
      entry.nodeId === nodeId &&
      entry.fromRevision <= action.afterRevision &&
      (entry.toRevision === null || entry.toRevision >= action.afterRevision)
  );
  const path = lineage?.path;
  if (!path) throw new Error(`Node ${nodeId} has no path at action ${actionId}`);
  const value = mappingGet(after, path);
  void before;
  return {
    path,
    value,
    operations: value === undefined ? [{ unset: { path } }] : [{ set: { path, value } }],
  };
}
