/**
 * Usage Tracking Utilities
 *
 * Shared helpers for recording LLM token usage across all API routes.
 *
 * - `wrapWithUsageTracking`: Wraps an LLMProvider to accumulate token usage
 * - `recordUsageFireAndForget`: Fire-and-forget usage recording
 * - `getUserId`: Extract user ID from Hono context
 */

import type { LLMProvider } from '@t3x-dev/core';
import { type RecordUsageInput, recordUsage } from '@t3x-dev/storage/pglite';
import { pinoLogger } from '../middleware/logger';

export type { RecordUsageInput };

/**
 * Accumulated usage from a tracked provider.
 */
export interface TrackedUsage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * Wraps an LLMProvider to automatically accumulate token usage
 * from every `generate()` call. The wrapper is transparent to callers.
 *
 * Usage:
 *   const { provider: tracked, usage } = wrapWithUsageTracking(llm);
 *   await someCoreFn(tracked);  // internally calls generate() N times
 *   // usage now has total inputTokens / outputTokens
 */
export function wrapWithUsageTracking(provider: LLMProvider): {
  provider: LLMProvider;
  usage: TrackedUsage;
} {
  const usage: TrackedUsage = { inputTokens: 0, outputTokens: 0 };

  const wrapped: LLMProvider = {
    id: provider.id,
    generate: async (prompt, options) => {
      const result = await provider.generate(prompt, options);
      usage.inputTokens += result.usage.inputTokens;
      usage.outputTokens += result.usage.outputTokens;
      return result;
    },
    resolveConflict: async (baseText, sourceText, targetText, context) => {
      const result = await provider.resolveConflict(baseText, sourceText, targetText, context);
      usage.inputTokens += result.usage.inputTokens;
      usage.outputTokens += result.usage.outputTokens;
      return result;
    },
  };

  return { provider: wrapped, usage };
}

/**
 * Record token usage in the background (fire-and-forget).
 * Swallows errors with a warning log.
 */
export function recordUsageFireAndForget(
  db: Parameters<typeof recordUsage>[0],
  input: RecordUsageInput
): void {
  recordUsage(db, input).catch((err) => {
    pinoLogger.warn({ err, endpoint: input.endpoint }, 'Failed to record token usage');
  });
}

/**
 * Extract user_id from Hono request context (set by auth middleware).
 */
export function getUserId(c: { get: (key: string) => unknown }): string | null {
  const apiKey = c.get('apiKey') as { user_id?: string | null } | undefined;
  return apiKey?.user_id ?? null;
}
