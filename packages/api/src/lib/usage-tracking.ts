/**
 * Usage Tracking Utilities
 *
 * Shared helpers for recording LLM token usage across all API routes.
 *
 * - `recordUsageFireAndForget`: Fire-and-forget usage recording
 * - `getUserId`: Extract user ID from Hono context
 */

import { type RecordUsageInput, recordUsage } from '@t3x-dev/storage';
import type { Context } from 'hono';
import { pinoLogger } from '../middleware/logger';
import { getRequestPrincipal } from './request-principal';

export type { RecordUsageInput };

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
export function getUserId(c: Context): string | null {
  return getRequestPrincipal(c)?.userId ?? null;
}
