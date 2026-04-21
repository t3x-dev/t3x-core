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
}: ExtractionInput): Promise<void> {
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
      return;
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
          return;
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
