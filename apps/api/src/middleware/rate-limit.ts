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

  constructor(limit: number) {
    this.limit = limit;

    // Periodic cleanup every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60_000);
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
const keyLimiter = new RateLimiter(100); // L2: 100/min per API key

function getClientIp(c: Context): string {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'unknown'
  );
}

/**
 * L1 Rate Limit — IP-based, applied before auth.
 * 200 requests per minute per IP address.
 */
export async function rateLimitL1(c: Context, next: Next) {
  const ip = getClientIp(c);
  const result = ipLimiter.check(`ip:${ip}`);

  c.header('X-RateLimit-Limit', '200');
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
