/**
 * L2 — the ONLY entry point for writing YOps.
 *
 * Enforces structural source presence at entry (defense in depth — the
 * validator in core already runs for LLM ops in the extraction worker; gold
 * edits come through here too).
 *
 * Hands off to L1 infrastructure for persistence. Does not touch L3 store —
 * optimistic updates are the caller's responsibility so failure semantics
 * are explicit.
 */

import type { SourcedYOp, YOpsLogEntry } from '@t3x-dev/core';
import { type AppendYOpsOptions, appendYOps } from '@/infrastructure/yopsLog';
import { SourceValidationError } from './errors';

export type CommitOpsOptions = AppendYOpsOptions;

function assertSourcePresent(ops: readonly SourcedYOp[]): void {
  for (let i = 0; i < ops.length; i++) {
    const src = (ops[i] as { source?: { type?: string; author?: string } }).source;
    if (!src) {
      throw new SourceValidationError(i, 'source');
    }
    if (src.type !== 'llm' && src.type !== 'human') {
      throw new SourceValidationError(i, 'source.type');
    }
    if (src.type === 'human' && !src.author) {
      throw new SourceValidationError(i, 'source.author');
    }
  }
}

export async function commitOps(
  conversationId: string,
  ops: SourcedYOp[],
  options?: CommitOpsOptions
): Promise<YOpsLogEntry> {
  assertSourcePresent(ops);
  return appendYOps(conversationId, ops, options);
}
