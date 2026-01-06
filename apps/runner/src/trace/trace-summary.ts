/**
 * TraceSummary Builder
 *
 * Extracts lightweight statistics from RunRecord for storage and analysis.
 * This summary is always stored (small size ~1KB) regardless of trace policy.
 */

import type { RunRecord } from '../schemas/run-record.js';

/**
 * Trajectory statistics - execution path analysis
 */
export interface TrajectorySummary {
  total_steps: number;
  llm_calls: number;
  tool_calls: number;
  retrieval_calls: number;
  failed_steps: number;
}

/**
 * Token usage statistics
 */
export interface TokenStats {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/**
 * Complete trace summary - lightweight stats extracted from RunRecord
 */
export interface TraceSummary {
  trajectory: TrajectorySummary;
  tokens: TokenStats;
  latency_ms: number;
}

/**
 * Build TraceSummary from RunRecord
 *
 * Iterates through steps and aggregates statistics by span_kind.
 *
 * @param runRecord - The complete run record with steps
 * @returns TraceSummary with aggregated statistics
 */
export function buildTraceSummary(runRecord: RunRecord): TraceSummary {
  const trajectory: TrajectorySummary = {
    total_steps: 0,
    llm_calls: 0,
    tool_calls: 0,
    retrieval_calls: 0,
    failed_steps: 0,
  };

  const tokens: TokenStats = {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  };

  let totalLatency = 0;

  for (const step of runRecord.steps) {
    trajectory.total_steps++;

    // Count by span_kind
    const spanKind = step.span_kind || 'chain';
    switch (spanKind) {
      case 'llm':
        trajectory.llm_calls++;
        break;
      case 'tool':
        trajectory.tool_calls++;
        break;
      case 'retriever':
        trajectory.retrieval_calls++;
        break;
    }

    // Count failed steps
    if (step.status === 'error') {
      trajectory.failed_steps++;
    }

    // Aggregate token usage from LLM steps
    if (step.llm?.tokens) {
      tokens.prompt_tokens += step.llm.tokens.prompt || 0;
      tokens.completion_tokens += step.llm.tokens.completion || 0;
      tokens.total_tokens += step.llm.tokens.total || 0;
    }

    // Aggregate latency
    totalLatency += step.latency_ms || 0;
  }

  return {
    trajectory,
    tokens,
    latency_ms: totalLatency,
  };
}
