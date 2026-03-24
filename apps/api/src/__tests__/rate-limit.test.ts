/**
 * Rate Limit Middleware Tests
 *
 * Tests the two-layer rate limiting middleware:
 * - L1 (IP-based): 200 requests/minute per IP
 * - L2 (Key-based): 100 requests/minute per API key
 */

import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rateLimitL1, rateLimitL2 } from '../middleware/rate-limit';

/**
 * Creates a test app with L1 (IP-based) rate limiting only.
 */
function createL1TestApp() {
  const app = new Hono();
  app.use('*', rateLimitL1);
  app.get('/test', (c) => c.json({ success: true }));
  return app;
}

/**
 * Creates a test app with L2 (Key-based) rate limiting.
 * The middleware simulates an authenticated request by setting apiKey in context.
 */
function createL2TestApp() {
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
  app.use('*', rateLimitL2);
  app.get('/test', (c) => c.json({ success: true }));
  return app;
}

describe('Rate Limit Middleware', () => {
  // We need to handle the setInterval cleanup in RateLimiter constructor.
  // Use fake timers to prevent the cleanup interval from running.
  beforeEach(() => {
    vi.useFakeTimers();
    // Trust proxy headers in tests (simulates reverse proxy deployment)
    process.env.TRUST_PROXY = '1';
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.TRUST_PROXY;
  });

  describe('L1 — IP-based rate limiting', () => {
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
});
