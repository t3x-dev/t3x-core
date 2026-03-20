/**
 * Rate Limiting Middleware
 *
 * Two-layer rate limiting:
 * - L1 (IP-based): 200 requests/minute per IP — applied to all requests
 * - L2 (Key-based): 100 requests/minute per API key — applied after auth
 *
 * Uses a simple in-memory sliding window counter.
 * Suitable for single-instance deployments. For multi-instance,
 * replace with Redis-backed limiter.
 */

import type { Context, Next } from 'hono';
import { createError } from '../lib/errors';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 60_000; // 1 minute

class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private readonly limit: number;
  private intervalId: ReturnType<typeof setInterval>;

  constructor(limit: number) {
    this.limit = limit;

    // Periodic cleanup every 5 minutes
    this.intervalId = setInterval(() => this.cleanup(), 5 * 60_000);
  }

  /** Stop the periodic cleanup timer (for graceful shutdown / test cleanup). */
  destroy(): void {
    clearInterval(this.intervalId);
  }

  /**
   * Check if a key has exceeded the rate limit.
   * @returns remaining requests, or -1 if rate limited
   */
  check(key: string): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now > entry.resetAt) {
      // New window
      this.store.set(key, { count: 1, resetAt: now + WINDOW_MS });
      return { allowed: true, remaining: this.limit - 1, resetAt: now + WINDOW_MS };
    }

    entry.count++;

    if (entry.count > this.limit) {
      return { allowed: false, remaining: 0, resetAt: entry.resetAt };
    }

    return { allowed: true, remaining: this.limit - entry.count, resetAt: entry.resetAt };
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.resetAt) {
        this.store.delete(key);
      }
    }
  }
}

// Singleton limiters
const ipLimiter = new RateLimiter(200); // L1: 200/min per IP
const unknownLimiter = new RateLimiter(10); // L1 fallback: 10/min for requests without IP headers
const keyLimiter = new RateLimiter(100); // L2: 100/min per API key

/**
 * Extract client IP using TRUST_PROXY env var.
 *
 * TRUST_PROXY controls how many proxy hops to trust:
 *   - "0" or unset (default): Don't trust headers, use socket address only
 *   - "1": One proxy (e.g., Nginx) — use rightmost XFF entry or X-Real-IP
 *   - "2": Two proxies (e.g., CDN + LB) — use second-from-right XFF entry
 *
 * This prevents IP spoofing in self-hosted deployments where the API is
 * exposed directly to the internet without a reverse proxy.
 */
function getClientIp(c: Context): string | null {
  const trustProxy = parseInt(process.env.TRUST_PROXY || '0', 10);

  if (trustProxy <= 0) {
    // Don't trust any headers — fall back to connection address
    // Hono doesn't expose socket directly; return null to use fallback bucket
    return null;
  }

  // Trust proxy headers: take the (N-from-right) entry in X-Forwarded-For
  const xff = c.req.header('x-forwarded-for');
  if (xff) {
    const parts = xff
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    // XFF is ordered: [client, proxy1, proxy2, ...]. We trust the last N entries
    // are proxies, so the real client is at index (length - trustProxy).
    const clientIndex = Math.max(0, parts.length - trustProxy);
    if (parts[clientIndex]) return parts[clientIndex];
  }

  return c.req.header('x-real-ip') || null;
}

/**
 * L1 Rate Limit — IP-based, applied before auth.
 * 200 requests per minute per IP address.
 * Requests without IP headers use a separate bucket with a 10/min limit.
 * A unique key per request object prevents all unknown-IP requests from sharing one bucket.
 */
export async function rateLimitL1(c: Context, next: Next) {
  // Skip rate limiting when auth is disabled (local dev)
  if (process.env.AUTH_DISABLED?.toLowerCase() === 'true') return next();

  const ip = getClientIp(c);

  let result: { allowed: boolean; remaining: number; resetAt: number };
  let limitHeader: string;

  if (ip) {
    result = ipLimiter.check(`ip:${ip}`);
    limitHeader = '200';
  } else {
    // No IP available — use a fixed key per pathname so rate limiting still applies.
    // All requests without IP headers to the same path share a single bucket.
    const fallbackKey = `unknown-ip:${new URL(c.req.url).pathname}`;
    result = unknownLimiter.check(fallbackKey);
    limitHeader = '10';
  }

  c.header('X-RateLimit-Limit', limitHeader);
  c.header('X-RateLimit-Remaining', String(result.remaining));
  c.header('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));

  if (!result.allowed) {
    return c.json(createError('RATE_LIMITED', 'Too many requests. Please try again later.'), 429);
  }

  return next();
}

/**
 * L2 Rate Limit — Key-based, applied after auth.
 * 100 requests per minute per API key.
 */
export async function rateLimitL2(c: Context, next: Next) {
  // Only apply if authenticated with API key
  const apiKey = c.get('apiKey');
  if (!apiKey) return next();

  const result = keyLimiter.check(`key:${apiKey.id}`);

  c.header('X-RateLimit-Key-Limit', '100');
  c.header('X-RateLimit-Key-Remaining', String(result.remaining));
  c.header('X-RateLimit-Key-Reset', String(Math.ceil(result.resetAt / 1000)));

  if (!result.allowed) {
    return c.json(
      createError('RATE_LIMITED', 'API key rate limit exceeded. Please try again later.'),
      429
    );
  }

  return next();
}
