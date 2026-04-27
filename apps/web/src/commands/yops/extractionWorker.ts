/**
 * L2 — LLM extraction with deterministic retry loop.
 *
 * Policy (locked): surgical retry payload (only failing ops go back to LLM),
 * budget 2 retries (3 LLM calls max), hard fail on exhaustion.
 *
 * The only exception is a last-resort deterministic repair for the narrow
 * "populate missing define" pattern. It is intentionally delayed until retry
 * exhaustion so LLM self-repair remains the primary path.
 */

import type { SemanticContent, SourcedYOp, ValidationTurn } from '@t3x-dev/core';
// normalize/repair/validate moved to server-side core pipeline
// (runExtractionV2Pipeline handles source provenance after compile).
// Web no longer re-runs them — the API contract already guarantees
// verified quotes when it returns 200.
import { ExtractionFailedError, ExtractionRequestError } from './errors';
import { repairMissingDefinesForPopulate } from './repairMissingDefines';
import { validateExecutableStructure } from './structureValidator';
import type { LLMCallInput, RetryFailingOp } from './types';
import { commitOps } from './yopsService';

const MAX_RETRIES = 2;
const ENABLE_LAST_RESORT_REPAIR = true;

export type LLMCall = (input: LLMCallInput) => Promise<SourcedYOp[]>;

export interface ExtractionInput {
  baseTree: SemanticContent;
  conversationId: string;
  turns: ValidationTurn[];
  llm: LLMCall;
  /**
   * When true (default), the worker calls `commitOps` after a successful
   * validation pass — preserves today's "Extract auto-applies" behavior.
   *
   * When false, the worker returns the validated ops without writing to
   * `yops_log`. Callers own the persistence decision and would invoke
   * `commitOps` themselves on an explicit apply step. Validation, retry,
   * and last-resort repair all run regardless of this flag — only the
   * final write is gated.
   */
  commit?: boolean;
}

export interface ExtractionResult {
  /** The validated, possibly repaired ops the worker arrived at. */
  ops: SourcedYOp[];
  /**
   * True when the worker called `commitOps` itself (i.e. `commit !== false`).
   * Callers reading this can avoid double-applying.
   */
  committed: boolean;
}

function collectInsertedDefinePaths(
  originalOps: readonly SourcedYOp[],
  repairedOps: readonly SourcedYOp[]
): string[] {
  const originalDefines = new Set(
    originalOps.flatMap((op) => ('define' in op && op.define?.path ? [op.define.path] : []))
  );

  return repairedOps.flatMap((op) => {
    if (!('define' in op) || !op.define?.path) return [];
    return originalDefines.has(op.define.path) ? [] : [op.define.path];
  });
}

function pickReason(failingOps: RetryFailingOp[]): ExtractionFailedError['reason'] {
  if (failingOps.every((f) => f.reason === 'unverifiable_quote')) return 'unverifiable_quote';
  if (failingOps.every((f) => f.reason === 'missing_source')) return 'missing_source';
  if (failingOps.every((f) => f.reason === 'invalid_structure')) return 'invalid_structure';
  return 'exhausted_retries';
}

export async function runExtraction({
  baseTree,
  conversationId,
  turns,
  llm,
  commit = true,
}: ExtractionInput): Promise<ExtractionResult> {
  let attempt = 0;
  let prevFailing: RetryFailingOp[] | undefined;

  while (true) {
    let ops: SourcedYOp[];
    try {
      ops = await llm({ turns, failingOps: prevFailing });
    } catch (e) {
      attempt++;

      if (e instanceof ExtractionRequestError) {
        const retryDecision = e.failure.retry;
        const exhausted =
          !retryDecision.retryable || attempt >= retryDecision.maxAttempts || attempt > MAX_RETRIES;
        if (exhausted) {
          throw new ExtractionFailedError([], attempt, 'llm_error', e.message, e.failure.code);
        }
        continue;
      }

      const msg = e instanceof Error ? e.message : String(e);
      if (attempt > MAX_RETRIES) {
        throw new ExtractionFailedError([], attempt, 'llm_error', msg);
      }
      continue;
    }

    // Source-quote validation now lives server-side inside
    // runExtractionV2Pipeline (post-#N+1 architecture move). The API
    // returns 200 only when every op's turn_ref.quote is verified
    // against turn content; an unverifiable quote surfaces as a typed
    // 'unverifiable_quote' ExtractionFailure (mapped to 400). Web
    // therefore trusts the contract and skips the redundant
    // normalize/repair/validate triple — those would be no-ops on a
    // server-validated batch and the extra retry loop here used to
    // double-spend the LLM budget without ever forwarding failingOps
    // through the wire.
    //
    // `prevFailing` is no longer mutated by this branch; it stays in
    // scope only for the structure-validation retry path below.

    const structureResult = validateExecutableStructure(baseTree, ops);
    if (structureResult.ok) {
      if (commit) await commitOps(conversationId, ops);
      return { ops, committed: commit };
    }

    attempt++;
    if (attempt > MAX_RETRIES) {
      if (ENABLE_LAST_RESORT_REPAIR) {
        const repairedOps = repairMissingDefinesForPopulate(baseTree, ops);
        const insertedDefinePaths = collectInsertedDefinePaths(ops, repairedOps);
        const repairedStructure = validateExecutableStructure(baseTree, repairedOps);
        if (insertedDefinePaths.length > 0 && repairedStructure.ok) {
          console.warn(
            '[extraction] applied last-resort repair for missing define-before-populate',
            {
              conversationId,
              attempt,
              originalOps: ops.length,
              repairedOps: repairedOps.length,
              insertedDefinePaths,
            }
          );
          if (commit) await commitOps(conversationId, repairedOps);
          return { ops: repairedOps, committed: commit };
        }

        if (insertedDefinePaths.length > 0) {
          console.warn('[extraction] last-resort repair did not produce a valid structure', {
            conversationId,
            attempt,
            originalOps: ops.length,
            repairedOps: repairedOps.length,
            insertedDefinePaths,
          });
        }
      }

      throw new ExtractionFailedError(
        structureResult.failingOps,
        attempt,
        pickReason(structureResult.failingOps)
      );
    }

    prevFailing = structureResult.failingOps;
  }
}
