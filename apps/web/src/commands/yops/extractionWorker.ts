/**
 * L2 — LLM extraction with deterministic retry loop.
 *
 * Policy (locked): surgical retry payload (only failing ops go back to LLM),
 * budget 2 retries (3 LLM calls max), then degrade.
 *
 * Degradation contract (resilience): on retry exhaustion the worker no
 * longer throws away every op the model produced. It partitions the last
 * batch into a verified subset (passes both source provenance and
 * executable-structure checks against the base tree) and a failing
 * subset, commits the verified subset, and returns
 * `{ committed, partial }` instead of throwing. The caller (useExtraction)
 * surfaces the failing ops as a soft warning. Only when nothing can be
 * salvaged does the worker throw — so the user never loses a fully-good
 * batch because of a single unverifiable quote.
 *
 * The legacy last-resort deterministic repair for the narrow
 * "populate missing define" pattern is still attempted before degradation.
 */

import type { SemanticContent, SourcedYOp, ValidationTurn } from '@t3x-dev/core';
import { normalizeOpTurnHashes, repairOpQuotes, validateSource } from '@t3x-dev/core';
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
}

export interface ExtractionOutcome {
  /** Number of ops committed to the conversation's yops_log. */
  committed: number;
  /**
   * Present when the LLM produced a mix of verified + failing ops and the
   * worker degraded to committing only the verified subset. Callers should
   * surface `failingOps` as a soft warning (not an error) and re-hydrate.
   */
  partial?: {
    failingOps: RetryFailingOp[];
    reason: ExtractionFailedError['reason'];
  };
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

/**
 * Try to salvage a verified subset from a batch the model couldn't fully
 * verify after retry exhaustion. Returns the committable subset (passes
 * both source and structure checks) when it has at least one op, or
 * `null` when nothing can be salvaged.
 */
function salvageVerifiedSubset(
  baseTree: SemanticContent,
  ops: readonly SourcedYOp[],
  failingOpIndices: Set<number>
): SourcedYOp[] | null {
  const verified = ops.filter((_, idx) => !failingOpIndices.has(idx));
  if (verified.length === 0) return null;
  const structure = validateExecutableStructure(baseTree, verified);
  return structure.ok ? verified : null;
}

export async function runExtraction({
  baseTree,
  conversationId,
  turns,
  llm,
}: ExtractionInput): Promise<ExtractionOutcome> {
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

    normalizeOpTurnHashes(ops, turns);
    repairOpQuotes(ops, turns);
    const sourceResult = validateSource(ops, turns);
    if (!sourceResult.ok) {
      attempt++;
      prevFailing = sourceResult.failingOps;

      if (attempt > MAX_RETRIES) {
        // Resilience: instead of throwing the whole batch away, try to
        // commit the verified subset and surface the failing slots as a
        // soft warning. Only throw when nothing is salvageable so the
        // pipeline never silently produces zero ops while the user has
        // valid data sitting in the same response.
        const failingIndices = new Set(sourceResult.failingOps.map((f) => f.opIndex));
        const verified = salvageVerifiedSubset(baseTree, ops, failingIndices);
        if (verified) {
          await commitOps(conversationId, verified);
          return {
            committed: verified.length,
            partial: {
              failingOps: sourceResult.failingOps,
              reason: pickReason(sourceResult.failingOps),
            },
          };
        }
        throw new ExtractionFailedError(
          sourceResult.failingOps,
          attempt,
          pickReason(sourceResult.failingOps)
        );
      }
      continue;
    }

    const structureResult = validateExecutableStructure(baseTree, ops);
    if (structureResult.ok) {
      await commitOps(conversationId, ops);
      return { committed: ops.length };
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
          await commitOps(conversationId, repairedOps);
          return { committed: repairedOps.length };
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

      // Same degradation as the source path: filter the structurally
      // failing ops and try to commit the rest. If nothing salvageable,
      // throw.
      const failingIndices = new Set(structureResult.failingOps.map((f) => f.opIndex));
      const verified = salvageVerifiedSubset(baseTree, ops, failingIndices);
      if (verified) {
        await commitOps(conversationId, verified);
        return {
          committed: verified.length,
          partial: {
            failingOps: structureResult.failingOps,
            reason: pickReason(structureResult.failingOps),
          },
        };
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
