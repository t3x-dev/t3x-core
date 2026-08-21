/**
 * Distributed rate limiting.
 *
 * The API owns policy and identity selection; a RateLimitStore owns the
 * atomic counter. The default store persists counters in PostgreSQL, while
 * cloud deployments may inject a compatible Redis or managed store.
 */

import { createHash } from 'node:crypto';
import {
  type ConsumeRateLimitInput,
  type ConsumeRateLimitResult,
  consumeRateLimit as consumeDatabaseRateLimit,
} from '@t3x-dev/storage';
import type { Context, Next } from 'hono';
import { getDB } from '../lib/db';
import { createError } from '../lib/errors';
import type { AppEnv } from '../types';

export interface RateLimitStore {
  consume(input: ConsumeRateLimitInput): Promise<ConsumeRateLimitResult>;
}

export interface RateLimitPolicy {
  scope: string;
  limit: number;
  windowMs: number;
}

const WINDOW_MS = 60_000;

export const RATE_LIMIT_POLICIES = {
  businessIp: { scope: 'business-ip', limit: 200, windowMs: WINDOW_MS },
  unknownIp: { scope: 'unknown-ip', limit: 10, windowMs: WINDOW_MS },
  authEntryIp: { scope: 'auth-entry-ip', limit: 30, windowMs: WINDOW_MS },
  oauthCallbackIp: { scope: 'oauth-callback-ip', limit: 30, windowMs: WINDOW_MS },
  apiKey: { scope: 'api-key', limit: 100, windowMs: WINDOW_MS },
  registerIp: { scope: 'register-ip', limit: 5, windowMs: WINDOW_MS },
  loginUsername: { scope: 'login-username', limit: 10, windowMs: WINDOW_MS },
} as const satisfies Record<string, RateLimitPolicy>;

export function createDatabaseRateLimitStore(): RateLimitStore {
  return {
    async consume(input) {
      return consumeDatabaseRateLimit(await getDB(), input);
    },
  };
}

export const databaseRateLimitStore = createDatabaseRateLimitStore();

/** Hash caller identities before they cross the persistence boundary. */
export function hashRateLimitIdentity(scope: string, identity: string): string {
  return createHash('sha256').update(`${scope}\0${identity}`).digest('hex');
}

export async function consumeRateLimit(
  store: RateLimitStore,
  policy: RateLimitPolicy,
  identity: string,
  now = Date.now()
): Promise<ConsumeRateLimitResult> {
  return store.consume({
    ...policy,
    keyHash: hashRateLimitIdentity(policy.scope, identity),
    now,
  });
}

function getSocketIp(c: Context): string | null {
  const environment = (c.env ?? {}) as {
    incoming?: { socket?: { remoteAddress?: string } };
    server?: { incoming?: { socket?: { remoteAddress?: string } } };
  };
  return (
    environment.server?.incoming?.socket?.remoteAddress ??
    environment.incoming?.socket?.remoteAddress ??
    null
  );
}

/**
 * Extract client IP using TRUST_PROXY env var.
 *
 * The trusted address is selected from the right side of X-Forwarded-For so
 * callers cannot prepend a spoofed address ahead of the configured proxies.
 */
export function getClientIp(c: Context): string | null {
  const trustProxy = Number.parseInt(process.env.TRUST_PROXY || '0', 10);
  if (!Number.isSafeInteger(trustProxy) || trustProxy <= 0) return getSocketIp(c);

  const xff = c.req.header('x-forwarded-for');
  if (xff) {
    const parts = xff
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    const clientIndex = Math.max(0, parts.length - trustProxy);
    if (parts[clientIndex]) return parts[clientIndex];
  }

  return c.req.header('x-real-ip') || getSocketIp(c);
}

function isOAuthCallbackPath(pathname: string): boolean {
  return (
    /\/(?:api\/)?v1\/auth\/(?:callback|[^/]+\/callback)(?:\/|$)/.test(pathname) ||
    /\/api\/auth\/callback(?:\/|$)/.test(pathname)
  );
}

function isAuthEntryPath(pathname: string): boolean {
  return /\/(?:api\/)?v1\/auth\/(?:login|register)(?:\/|$)/.test(pathname);
}

export function resolveIpRateLimitPolicy(pathname: string): RateLimitPolicy {
  if (isOAuthCallbackPath(pathname)) return RATE_LIMIT_POLICIES.oauthCallbackIp;
  if (isAuthEntryPath(pathname)) return RATE_LIMIT_POLICIES.authEntryIp;
  return RATE_LIMIT_POLICIES.businessIp;
}

export function applyRateLimitHeaders(
  c: Context,
  policy: RateLimitPolicy,
  result: ConsumeRateLimitResult,
  prefix = ''
): void {
  const headerPrefix = prefix ? `X-RateLimit-${prefix}-` : 'X-RateLimit-';
  c.header(`${headerPrefix}Limit`, String(policy.limit));
  c.header(`${headerPrefix}Remaining`, String(result.remaining));
  c.header(`${headerPrefix}Reset`, String(Math.ceil(result.resetAt / 1000)));

  if (!result.allowed) {
    c.header('Retry-After', String(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))));
  }
}

export function getRequestRateLimitStore(c: Context): RateLimitStore {
  return (c as Context<AppEnv>).get('rateLimitStore') ?? databaseRateLimitStore;
}

/** L1: IP/path policy, applied before authentication. */
export function createRateLimitL1(store: RateLimitStore) {
  return async function rateLimitL1Middleware(c: Context<AppEnv>, next: Next) {
    c.set('rateLimitStore', store);

    // Local source development intentionally remains auth-free and unthrottled.
    if (process.env.AUTH_DISABLED?.toLowerCase() === 'true') return next();

    const pathname = new URL(c.req.url).pathname;
    // Probes must preserve their liveness/readiness semantics when storage is unavailable.
    if (pathname === '/health' || pathname === '/ready') return next();

    const ip = getClientIp(c);
    const routePolicy = resolveIpRateLimitPolicy(pathname);
    const policy = ip ? routePolicy : RATE_LIMIT_POLICIES.unknownIp;
    const identity = ip ?? pathname;
    const result = await consumeRateLimit(store, policy, identity);

    applyRateLimitHeaders(c, policy, result);
    if (!result.allowed) {
      return c.json(createError('RATE_LIMITED', 'Too many requests. Please try again later.'), 429);
    }

    return next();
  };
}

/** L2: authenticated API-key policy. */
export function createRateLimitL2(store: RateLimitStore) {
  return async function rateLimitL2Middleware(c: Context<AppEnv>, next: Next) {
    const apiKey = c.get('apiKey');
    if (!apiKey) return next();

    const policy = RATE_LIMIT_POLICIES.apiKey;
    const result = await consumeRateLimit(store, policy, apiKey.id);
    applyRateLimitHeaders(c, policy, result, 'Key');

    if (!result.allowed) {
      return c.json(
        createError('RATE_LIMITED', 'API key rate limit exceeded. Please try again later.'),
        429
      );
    }

    return next();
  };
}

// Backward-compatible middleware exports use the persistent self-hosted default.
export const rateLimitL1 = createRateLimitL1(databaseRateLimitStore);
export const rateLimitL2 = createRateLimitL2(databaseRateLimitStore);
