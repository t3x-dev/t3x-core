import type { NativeYOp as YOp } from '@t3x-dev/core';
import { applyDraftYOps, canonicalJson, cloneDocument } from './document';
import { nextLineage } from './lineage';
import {
  actionById,
  createDraftActionLedger,
  currentComposition,
  isMapping,
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
  input = cloneDocument(input);
  const requestDigest = canonicalJson({
    actionId: input.actionId,
    actor: input.actor,
    channel: input.channel,
    operations: input.operations,
    expectedRevision: input.expectedRevision,
    targetRevision: input.targetRevision ?? null,
    precondition: input.precondition ?? null,
    generation: input.generation ?? null,
    reason: input.reason ?? null,
  });
  const priorReceipt = ledger.receipts?.find((r) => r.actionId === input.actionId);
  const existing = actionById(ledger, input.actionId);
  const digest = operationsDigest(input.operations);
  if (existing) {
    if (existing.requestDigest === requestDigest) {
      return { kind: 'reused', ledger, action: existing };
    }
    return {
      kind: 'conflict',
      ledger,
      reason: 'idempotency_mismatch',
      message: `Action ${input.actionId} was published with different operations`,
    };
  }

  if (priorReceipt) {
    return priorReceipt.requestDigest === requestDigest
      ? { kind: 'no_change', ledger, receipt: priorReceipt }
      : {
          kind: 'conflict',
          ledger,
          reason: 'idempotency_mismatch',
          message: 'Request identity reused with different facts',
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

  if (input.operations.some((operation) => Object.hasOwn(operation, 'source')))
    return {
      kind: 'rejected',
      ledger,
      reason: 'apply_failed',
      message:
        'Operation source metadata is not trusted evidence; provenance must be bound by the server',
    };
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
  const afterRevision = ledger.compositionRevision + 1;
  const lineage = nextLineage(ledger, input.operations, before, after, afterRevision);
  const identities = (entries: typeof lineage) =>
    entries.filter((e) => e.toRevision === null).map(({ nodeId, path }) => ({ nodeId, path }));
  if (
    yValuesEqual(before, after) &&
    canonicalJson(identities([...ledger.lineage])) === canonicalJson(identities(lineage))
  ) {
    const receipt = {
      actionId: input.actionId,
      outcome: 'no_change' as const,
      expectedRevision: input.expectedRevision,
      compositionRevision: ledger.compositionRevision,
      message: 'Document unchanged',
      requestDigest,
    };
    return {
      kind: 'no_change',
      ledger: { ...ledger, receipts: [...(ledger.receipts ?? []), receipt] },
      receipt,
    };
  }

  const action: DraftActionRecord = {
    schema: DRAFT_ACTION_SCHEMA,
    actionId: input.actionId,
    sequence: ledger.actions.length + 1,
    channel: input.channel,
    actor: input.actor,
    publishedAt: input.publishedAt,
    ...(input.precondition ? { precondition: input.precondition } : {}),
    ...(input.targetRevision === undefined ? {} : { targetRevision: input.targetRevision }),
    beforeRevision: ledger.compositionRevision,
    afterRevision,
    operations: Object.freeze([...input.operations]),
    operationsDigest: digest,
    requestDigest,
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.generation ? { generation: input.generation } : {}),
  };
  const next: DraftActionLedger = {
    ...ledger,
    compositionRevision: afterRevision,
    actions: Object.freeze([...ledger.actions, action]),
    lineage,
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
  if (!isMapping(base) || !isMapping(current))
    throw new TypeError('Legacy import requires mapping documents');
  const keys = [...mappingKeys(current)];
  for (const key of mappingKeys(base)) {
    if (!keys.includes(key)) keys.push(key);
  }
  const operations: YOp[] = [];
  for (const key of keys) {
    const path = JSON.stringify(key);
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
  const after = replayToRevision(ledger, action.afterRevision);
  const lineage = ledger.lineage.find(
    (entry) =>
      entry.nodeId === nodeId &&
      entry.fromRevision <= action.afterRevision &&
      (entry.toRevision === null || entry.toRevision > action.afterRevision)
  );
  const current = ledger.lineage.find(
    (entry) => entry.nodeId === nodeId && entry.toRevision === null
  );
  if (!current)
    throw new Error('Cannot restore a deleted node without an explicit recreate command');
  const path = current.path;
  if (!path) throw new Error(`Node ${nodeId} has no path at action ${actionId}`);
  const value = lineage ? mappingGet(after, lineage.path) : undefined;
  return {
    path,
    value,
    operations: value === undefined ? [{ unset: { path } }] : [{ set: { path, value } }],
  };
}
