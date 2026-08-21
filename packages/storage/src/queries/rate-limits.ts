import { lte, sql } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { rateLimitBuckets } from '../schema';

export interface ConsumeRateLimitInput {
  /** Stable policy namespace, such as login, oauth-callback, or api-key. */
  scope: string;
  /** Opaque hash of the caller identity. Never pass a raw credential or username. */
  keyHash: string;
  limit: number;
  windowMs: number;
  /** Unix milliseconds. Defaults to the current time. */
  now?: number;
}

export interface ConsumeRateLimitResult {
  allowed: boolean;
  count: number;
  remaining: number;
  resetAt: number;
}

/**
 * Atomically consume one fixed-window allowance in PostgreSQL.
 *
 * INSERT ... ON CONFLICT performs the increment under PostgreSQL's row lock,
 * so concurrent requests from different processes cannot undercount.
 */
export async function consumeRateLimit(
  db: AnyDB,
  input: ConsumeRateLimitInput
): Promise<ConsumeRateLimitResult> {
  if (!input.scope || !input.keyHash) {
    throw new Error('Rate-limit scope and keyHash are required');
  }
  if (!Number.isSafeInteger(input.limit) || input.limit <= 0) {
    throw new Error('Rate-limit limit must be a positive integer');
  }
  if (!Number.isSafeInteger(input.windowMs) || input.windowMs <= 0) {
    throw new Error('Rate-limit windowMs must be a positive integer');
  }

  const now = input.now ?? Date.now();
  const windowStartMs = Math.floor(now / input.windowMs) * input.windowMs;
  const resetAt = windowStartMs + input.windowMs;

  const [row] = await db
    .insert(rateLimitBuckets)
    .values({
      scope: input.scope,
      keyHash: input.keyHash,
      windowStart: new Date(windowStartMs),
      count: 1,
      expiresAt: new Date(resetAt),
      updatedAt: new Date(now),
    })
    .onConflictDoUpdate({
      target: [rateLimitBuckets.scope, rateLimitBuckets.keyHash, rateLimitBuckets.windowStart],
      set: {
        count: sql`${rateLimitBuckets.count} + 1`,
        expiresAt: new Date(resetAt),
        updatedAt: new Date(now),
      },
    })
    .returning({ count: rateLimitBuckets.count });

  if (!row) throw new Error('Rate-limit counter update returned no row');

  return {
    allowed: row.count <= input.limit,
    count: row.count,
    remaining: Math.max(0, input.limit - row.count),
    resetAt,
  };
}

/** Delete expired buckets; safe to call concurrently from multiple instances. */
export async function cleanupExpiredRateLimitBuckets(db: AnyDB, now = Date.now()): Promise<number> {
  const rows = await db
    .delete(rateLimitBuckets)
    .where(lte(rateLimitBuckets.expiresAt, new Date(now)))
    .returning({ scope: rateLimitBuckets.scope });
  return rows.length;
}
