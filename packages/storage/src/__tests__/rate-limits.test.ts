import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { cleanupExpiredRateLimitBuckets, consumeRateLimit } from '../queries/rate-limits';
import { createTestDB } from './setup';

describe('persistent rate limits', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const testDb = await createTestDB();
    db = testDb.db;
    cleanup = testDb.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('shares a counter between independent service instances and across recreation', async () => {
    const instanceA = (keyHash: string) =>
      consumeRateLimit(db, {
        scope: 'business-ip',
        keyHash,
        limit: 2,
        windowMs: 60_000,
        now: 1_700_000_000_000,
      });
    const instanceB = (keyHash: string) =>
      consumeRateLimit(db, {
        scope: 'business-ip',
        keyHash,
        limit: 2,
        windowMs: 60_000,
        now: 1_700_000_000_000,
      });

    expect(await instanceA('shared')).toMatchObject({ allowed: true, count: 1, remaining: 1 });
    expect(await instanceB('shared')).toMatchObject({ allowed: true, count: 2, remaining: 0 });

    // Recreating the service does not recreate its state: PostgreSQL owns the counter.
    const recreatedInstance = instanceA;
    expect(await recreatedInstance('shared')).toMatchObject({
      allowed: false,
      count: 3,
      remaining: 0,
    });
  });

  it('atomically counts concurrent requests without undercounting or bypass', async () => {
    const attempts = await Promise.all(
      Array.from({ length: 40 }, () =>
        consumeRateLimit(db, {
          scope: 'api-key',
          keyHash: 'concurrent',
          limit: 20,
          windowMs: 60_000,
          now: 1_700_000_000_000,
        })
      )
    );

    expect(attempts.filter((attempt) => attempt.allowed)).toHaveLength(20);
    expect(attempts.map((attempt) => attempt.count).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 40 }, (_, index) => index + 1)
    );
  });

  it('isolates policies and starts a fresh fixed window', async () => {
    const first = await consumeRateLimit(db, {
      scope: 'login',
      keyHash: 'same-identity',
      limit: 1,
      windowMs: 60_000,
      now: 1_700_000_000_000,
    });
    const otherPolicy = await consumeRateLimit(db, {
      scope: 'oauth-callback',
      keyHash: 'same-identity',
      limit: 1,
      windowMs: 60_000,
      now: 1_700_000_000_000,
    });
    const nextWindow = await consumeRateLimit(db, {
      scope: 'login',
      keyHash: 'same-identity',
      limit: 1,
      windowMs: 60_000,
      now: 1_700_000_060_000,
    });

    expect(first.count).toBe(1);
    expect(otherPolicy.count).toBe(1);
    expect(nextWindow.count).toBe(1);
  });

  it('removes expired buckets without touching active windows', async () => {
    await consumeRateLimit(db, {
      scope: 'cleanup',
      keyHash: 'active',
      limit: 1,
      windowMs: 60_000,
      now: 2_000_000_000_000,
    });

    expect(await cleanupExpiredRateLimitBuckets(db, 1_800_000_000_000)).toBeGreaterThan(0);
    const active = await consumeRateLimit(db, {
      scope: 'cleanup',
      keyHash: 'active',
      limit: 1,
      windowMs: 60_000,
      now: 2_000_000_000_000,
    });
    expect(active.count).toBe(2);
  });
});
