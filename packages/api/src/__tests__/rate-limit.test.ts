/**
 * Rate Limit Middleware Tests
 *
 * Tests the two-layer rate limiting middleware:
 * - L1 (IP-based): 200 requests/minute per IP
 * - L2 (Key-based): 100 requests/minute per API key
 */

import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createRateLimitL1,
  createRateLimitL2,
  getClientIp,
  hashRateLimitIdentity,
  RATE_LIMIT_POLICIES,
  type RateLimitStore,
  resolveIpRateLimitPolicy,
} from '../middleware/rate-limit';

const originalAuthDisabled = process.env.AUTH_DISABLED;

class MemoryRateLimitStore implements RateLimitStore {
  private readonly counters = new Map<string, number>();

  async consume(input: Parameters<RateLimitStore['consume']>[0]) {
    const now = input.now ?? Date.now();
    const windowStart = Math.floor(now / input.windowMs) * input.windowMs;
    const resetAt = windowStart + input.windowMs;
    const bucket = `${input.scope}:${input.keyHash}:${windowStart}`;
    const count = (this.counters.get(bucket) ?? 0) + 1;
    this.counters.set(bucket, count);
    return {
      allowed: count <= input.limit,
      count,
      remaining: Math.max(0, input.limit - count),
      resetAt,
    };
  }
}

/**
 * Creates a test app with L1 (IP-based) rate limiting only.
 */
function createL1TestApp(store: RateLimitStore = new MemoryRateLimitStore()) {
  const app = new Hono();
  app.use('*', createRateLimitL1(store));
  app.get('/test', (c) => c.json({ success: true }));
  return app;
}

/**
 * Creates a test app with L2 (Key-based) rate limiting.
 * The middleware simulates an authenticated request by setting apiKey in context.
 */
function createL2TestApp(store: RateLimitStore = new MemoryRateLimitStore()) {
  const app = new Hono();
  // Simulate auth middleware setting apiKey
  app.use('*', async (c, next) => {
    const keyId = c.req.header('X-Test-Key-Id');
    if (keyId) {
      // biome-ignore lint/suspicious/noExplicitAny: test mock access
      (c as any).set('apiKey', { id: keyId, name: 'Test Key' });
    }
    return next();
  });
  app.use('*', createRateLimitL2(store));
  app.get('/test', (c) => c.json({ success: true }));
  return app;
}

describe('Rate Limit Middleware', () => {
  beforeEach(() => {
    process.env.AUTH_DISABLED = 'false';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-21T00:00:00.000Z'));
    // Trust proxy headers in tests (simulates reverse proxy deployment)
    process.env.TRUST_PROXY = '1';
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.TRUST_PROXY;
    if (originalAuthDisabled === undefined) delete process.env.AUTH_DISABLED;
    else process.env.AUTH_DISABLED = originalAuthDisabled;
  });

  describe('L1 — IP-based rate limiting', () => {
    it('uses the Node socket address instead of untrusted proxy headers', async () => {
      process.env.TRUST_PROXY = '0';
      const app = new Hono();
      app.get('/test', (c) => c.json({ ip: getClientIp(c) }));

      const res = await app.request(
        '/test',
        { headers: { 'X-Forwarded-For': '198.51.100.99' } },
        { incoming: { socket: { remoteAddress: '203.0.113.7' } } }
      );

      expect(await res.json()).toEqual({ ip: '203.0.113.7' });
    });

    it('allows normal requests under the limit', async () => {
      const app = createL1TestApp();

      const res = await app.request('/test', {
        headers: { 'X-Forwarded-For': '192.168.1.100' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('includes X-RateLimit-* headers in response', async () => {
      const app = createL1TestApp();

      const res = await app.request('/test', {
        headers: { 'X-Forwarded-For': '192.168.1.101' },
      });

      expect(res.headers.get('X-RateLimit-Limit')).toBe('200');
      expect(res.headers.get('X-RateLimit-Remaining')).toBeDefined();
      expect(res.headers.get('X-RateLimit-Reset')).toBeDefined();
    });

    it('decrements remaining count on each request', async () => {
      const app = createL1TestApp();
      const ip = '192.168.1.102';

      const res1 = await app.request('/test', {
        headers: { 'X-Forwarded-For': ip },
      });
      const remaining1 = Number(res1.headers.get('X-RateLimit-Remaining'));

      const res2 = await app.request('/test', {
        headers: { 'X-Forwarded-For': ip },
      });
      const remaining2 = Number(res2.headers.get('X-RateLimit-Remaining'));

      expect(remaining2).toBe(remaining1 - 1);
    });

    it('returns 429 when IP limit exceeded', async () => {
      const app = createL1TestApp();
      const ip = '10.0.0.1';

      // Send 200 requests (the limit)
      for (let i = 0; i < 200; i++) {
        const res = await app.request('/test', {
          headers: { 'X-Forwarded-For': ip },
        });
        expect(res.status).toBe(200);
      }

      // 201st request should be rate limited
      const res = await app.request('/test', {
        headers: { 'X-Forwarded-For': ip },
      });

      expect(res.status).toBe(429);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('RATE_LIMITED');
      expect(res.headers.get('Retry-After')).toBe('60');
    });

    it('different IPs have independent limits', async () => {
      const app = createL1TestApp();

      // Exhaust limit for IP A
      for (let i = 0; i < 200; i++) {
        await app.request('/test', {
          headers: { 'X-Forwarded-For': '10.1.0.1' },
        });
      }

      // IP A should be rate limited
      const resA = await app.request('/test', {
        headers: { 'X-Forwarded-For': '10.1.0.1' },
      });
      expect(resA.status).toBe(429);

      // IP B should still be allowed
      const resB = await app.request('/test', {
        headers: { 'X-Forwarded-For': '10.1.0.2' },
      });
      expect(resB.status).toBe(200);
    });
  });

  describe('L2 — Key-based rate limiting', () => {
    it('allows requests under the key limit', async () => {
      const app = createL2TestApp();

      const res = await app.request('/test', {
        headers: { 'X-Test-Key-Id': 'ak_l2test1' },
      });

      expect(res.status).toBe(200);
    });

    it('skips L2 when no API key is set (unauthenticated)', async () => {
      const app = createL2TestApp();

      // No X-Test-Key-Id header = no apiKey in context
      const res = await app.request('/test');

      expect(res.status).toBe(200);
      // Should not have key-specific rate limit headers
      expect(res.headers.get('X-RateLimit-Key-Limit')).toBeNull();
    });

    it('includes X-RateLimit-Key-* headers for authenticated requests', async () => {
      const app = createL2TestApp();

      const res = await app.request('/test', {
        headers: { 'X-Test-Key-Id': 'ak_l2headers' },
      });

      expect(res.headers.get('X-RateLimit-Key-Limit')).toBe('100');
      expect(res.headers.get('X-RateLimit-Key-Remaining')).toBeDefined();
      expect(res.headers.get('X-RateLimit-Key-Reset')).toBeDefined();
    });

    it('returns 429 when key limit exceeded', async () => {
      const app = createL2TestApp();
      const keyId = 'ak_l2exceed';

      // Send 100 requests (the limit)
      for (let i = 0; i < 100; i++) {
        const res = await app.request('/test', {
          headers: { 'X-Test-Key-Id': keyId },
        });
        expect(res.status).toBe(200);
      }

      // 101st request should be rate limited
      const res = await app.request('/test', {
        headers: { 'X-Test-Key-Id': keyId },
      });

      expect(res.status).toBe(429);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('RATE_LIMITED');
      expect(res.headers.get('Retry-After')).toBe('60');
    });

    it('different API keys have independent limits', async () => {
      const app = createL2TestApp();

      // Exhaust limit for key A
      for (let i = 0; i < 100; i++) {
        await app.request('/test', {
          headers: { 'X-Test-Key-Id': 'ak_l2keyA' },
        });
      }

      // Key A should be rate limited
      const resA = await app.request('/test', {
        headers: { 'X-Test-Key-Id': 'ak_l2keyA' },
      });
      expect(resA.status).toBe(429);

      // Key B should still be allowed
      const resB = await app.request('/test', {
        headers: { 'X-Test-Key-Id': 'ak_l2keyB' },
      });
      expect(resB.status).toBe(200);
    });
  });

  describe('distributed policy behavior', () => {
    it('does not make liveness or readiness probe routing depend on the counter store', async () => {
      const store: RateLimitStore = {
        consume: async () => {
          throw new Error('database unavailable');
        },
      };
      const app = new Hono();
      app.use('*', createRateLimitL1(store));
      app.get('/health', (c) => c.text('alive'));
      app.get('/ready', (c) => c.text('route owns readiness'));

      expect((await app.request('/health')).status).toBe(200);
      expect((await app.request('/ready')).status).toBe(200);
    });

    it('shares counters between independently assembled API apps', async () => {
      const store = new MemoryRateLimitStore();
      const instanceA = createL1TestApp(store);
      const instanceB = createL1TestApp(store);
      const headers = { 'X-Forwarded-For': '10.9.0.1' };

      for (let i = 0; i < 100; i++) {
        expect((await instanceA.request('/test', { headers })).status).toBe(200);
        expect((await instanceB.request('/test', { headers })).status).toBe(200);
      }

      expect((await instanceA.request('/test', { headers })).status).toBe(429);
    });

    it('uses distinct limits for OAuth callbacks, auth entry, and business APIs', () => {
      expect(resolveIpRateLimitPolicy('/api/v1/auth/github/callback')).toEqual(
        RATE_LIMIT_POLICIES.oauthCallbackIp
      );
      expect(resolveIpRateLimitPolicy('/api/v1/auth/login')).toEqual(
        RATE_LIMIT_POLICIES.authEntryIp
      );
      expect(resolveIpRateLimitPolicy('/api/v1/projects')).toEqual(RATE_LIMIT_POLICIES.businessIp);
      expect(RATE_LIMIT_POLICIES.loginUsername.limit).toBe(10);
      expect(RATE_LIMIT_POLICIES.oauthCallbackIp.limit).toBe(30);
      expect(RATE_LIMIT_POLICIES.businessIp.limit).toBe(200);
    });

    it('hashes identities before handing them to the store', () => {
      const hash = hashRateLimitIdentity('login-username', 'user@example.com');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
      expect(hash).not.toContain('user@example.com');
    });
  });
});
