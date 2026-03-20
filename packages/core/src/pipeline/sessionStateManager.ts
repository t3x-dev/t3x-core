/**
 * Session State Manager (Step 1)
 *
 * Decides whether the extraction pipeline should run, based on conversation state.
 * Pure code, zero LLM, ~1ms.
 *
 * SessionContext is computed from existing data (delta_log + turn count) on every
 * request — no separate storage needed.
 *
 * @see docs/hlq_docs/2026-03-20-agentic-pipeline-8step-design.md §4.1
 * @see https://github.com/t3x-dev/t3x-core/issues/615
 */

import type { PipelineDecision, SessionContext } from './types';

/**
 * Decide whether the pipeline should extract, wait, or skip.
 *
 * Rules (evaluated in order):
 * 1. turnCount === 0                             → wait  (nothing to extract)
 * 2. turnCount === lastExtractionTurnCount       → skip  (no new turns)
 * 3. extractionCount === 0 && turnCount < 2      → wait  (first extraction needs ≥2 turns)
 * 4. otherwise                                   → extract
 */
export function decideAction(ctx: SessionContext): PipelineDecision {
  if (ctx.turnCount === 0) {
    return 'wait';
  }

  if (ctx.turnCount === ctx.lastExtractionTurnCount) {
    return 'skip';
  }

  if (ctx.extractionCount === 0 && ctx.turnCount < 2) {
    return 'wait';
  }

  return 'extract';
}

/**
 * Compute SessionContext from delta log metadata and turn count.
 *
 * This function accepts minimal inputs (not DeltaLogRecord) so that
 * @t3x-dev/core has no dependency on @t3x-dev/storage.
 *
 * The API layer is responsible for extracting these values from DB records.
 */
export function computeSessionContext(
  deltaLogSources: string[],
  lastExtractionTurnCount: number,
  turnCount: number
): SessionContext {
  const extractionCount = deltaLogSources.filter(
    (s) => s === 'pipeline' || s === 'llm_extraction'
  ).length;

  return {
    turnCount,
    extractionCount,
    lastExtractionTurnCount,
  };
}
