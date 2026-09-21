import { NativeYOpSchema as YOpSchema } from '@t3x-dev/core';
import { publishDraftAction } from './commands';
import { canonicalJson } from './document';
import { createDraftActionLedger } from './replay';
import {
  DRAFT_ACTION_LEDGER_SCHEMA,
  type DraftActionLedger,
  type DraftActionRecord,
} from './types';

/** Reconstruct persisted identity from the immutable trace; never trust a cached lineage. */
export function parseDraftActionLedger(value: unknown): DraftActionLedger {
  if (!value || typeof value !== 'object') throw new TypeError('Missing Draft action ledger');
  const ledger = value as DraftActionLedger;
  if (
    ledger.schema !== DRAFT_ACTION_LEDGER_SCHEMA ||
    ledger.version !== 1 ||
    !Array.isArray(ledger.actions) ||
    !Array.isArray(ledger.lineage)
  )
    throw new TypeError('Unsupported Draft action ledger');
  // Reject non-JSON values and detach the caller-owned object.
  const clean = JSON.parse(canonicalJson(ledger)) as DraftActionLedger;
  let reconstructed = createDraftActionLedger(clean.base);
  for (const action of clean.actions) {
    validateAction(action);
    const outcome = publishDraftAction(reconstructed, {
      actionId: action.actionId,
      channel: action.channel,
      actor: action.actor,
      operations: action.operations,
      expectedRevision: action.beforeRevision,
      publishedAt: action.publishedAt,
      reason: action.reason,
      targetRevision: action.targetRevision,
      precondition: action.precondition,
      generation: action.generation,
    });
    if (outcome.kind !== 'published' || canonicalJson(outcome.action) !== canonicalJson(action))
      throw new TypeError(`Invalid Draft action: ${action.actionId}`);
    reconstructed = outcome.ledger;
  }
  if (
    clean.compositionRevision !== reconstructed.compositionRevision ||
    canonicalJson(clean.lineage) !== canonicalJson(reconstructed.lineage)
  )
    throw new TypeError('Draft revision/lineage does not match replay');
  const ids = new Set(clean.actions.map((a) => a.actionId));
  for (const receipt of clean.receipts ?? []) {
    if (
      !receipt.actionId ||
      ids.has(receipt.actionId) ||
      receipt.outcome !== 'no_change' ||
      typeof receipt.requestDigest !== 'string' ||
      !Number.isInteger(receipt.compositionRevision) ||
      receipt.compositionRevision < 0 ||
      receipt.compositionRevision > clean.compositionRevision ||
      receipt.expectedRevision !== receipt.compositionRevision
    )
      throw new TypeError('Invalid Draft operation receipt');
    ids.add(receipt.actionId);
  }
  return { ...reconstructed, ...(clean.receipts ? { receipts: clean.receipts } : {}) };
}

function validateAction(action: DraftActionRecord) {
  if (
    !action ||
    typeof action.actionId !== 'string' ||
    !action.actionId ||
    !['manual', 'mcp', 'assistant', 'import'].includes(action.channel) ||
    !action.actor ||
    !['human', 'agent', 'service'].includes(action.actor.kind) ||
    typeof action.actor.id !== 'string' ||
    !action.actor.id ||
    !Number.isFinite(Date.parse(action.publishedAt)) ||
    !Array.isArray(action.operations)
  )
    throw new TypeError('Invalid Draft action facts');
  for (const op of action.operations) YOpSchema.parse(op);
}

/** Historical authoring basis for explanation/verification, never a writable Draft. */
export function draftLedgerAtRevision(
  ledger: DraftActionLedger,
  revision: number
): DraftActionLedger {
  if (!Number.isInteger(revision) || revision < 0 || revision > ledger.compositionRevision)
    throw new RangeError('Invalid composition revision');
  return parseDraftActionLedger({
    ...ledger,
    compositionRevision: revision,
    actions: ledger.actions.filter((action) => action.afterRevision <= revision),
    lineage: ledger.lineage
      .filter((entry) => entry.fromRevision <= revision)
      .map((entry) => ({
        ...entry,
        toRevision:
          entry.toRevision !== null && entry.toRevision > revision ? null : entry.toRevision,
      })),
    receipts: [],
  });
}
