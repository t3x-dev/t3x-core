/**
 * L1 — yops log persistence adapter.
 *
 * Thin typed wrapper around the existing API client. Presents a
 * SourcedYOp-based interface to Layer 2 and maps HTTP errors to
 * typed PersistenceError.
 */

import type { SourcedYOp, YOpsLogEntry, YOpsSource } from '@t3x-dev/core';
import { ApiError } from '@/infrastructure/core';
import { createYOpsEntry, deleteYOpsEntry, listYOpsLog } from '@/infrastructure/trees';

export class PersistenceError extends Error {
  constructor(
    public operation: 'load' | 'append' | 'delete',
    public code: string,
    message: string,
    public cause?: unknown
  ) {
    super(message);
    this.name = 'PersistenceError';
  }
}

function wrapError(operation: PersistenceError['operation'], err: unknown): PersistenceError {
  if (err instanceof PersistenceError) return err;
  if (err instanceof ApiError) {
    return new PersistenceError(operation, err.code, err.message, err);
  }
  const msg = err instanceof Error ? err.message : String(err);
  return new PersistenceError(operation, 'UNKNOWN', msg, err);
}

/**
 * Derive the row-level source tag from per-op sources.
 * - All LLM ops → 'pipeline'
 * - Any human ops (or mixed) → 'manual'
 *
 * The row-level tag is a coarser, per-row classification, distinct from the
 * fine-grained per-op `source.type`. Both are real and load-bearing:
 * compression-v2 reads the row tag to flag manual edits, while the engine
 * and replay use the per-op source for provenance and validation.
 */
export function deriveRowSource(ops: readonly SourcedYOp[]): YOpsSource {
  if (ops.length === 0) return 'manual';
  const allLLM = ops.every((o) => (o as { source: { type: string } }).source.type === 'llm');
  return allLLM ? 'pipeline' : 'manual';
}

export async function appendYOps(conversationId: string, ops: SourcedYOp[]): Promise<YOpsLogEntry> {
  try {
    const rowSource = deriveRowSource(ops);
    return await createYOpsEntry(
      conversationId,
      ops as unknown as Parameters<typeof createYOpsEntry>[1],
      rowSource
    );
  } catch (err) {
    throw wrapError('append', err);
  }
}

export async function loadYOpsLog(
  conversationId: string,
  topicId?: string
): Promise<YOpsLogEntry[]> {
  try {
    return await listYOpsLog(conversationId, topicId);
  } catch (err) {
    throw wrapError('load', err);
  }
}

export async function removeYOpsEntry(conversationId: string, yopsId: string): Promise<void> {
  try {
    await deleteYOpsEntry(conversationId, yopsId);
  } catch (err) {
    throw wrapError('delete', err);
  }
}
