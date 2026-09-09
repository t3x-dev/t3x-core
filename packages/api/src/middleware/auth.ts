/**
 * API Key Authentication Middleware
 *
 * Validates Bearer token in Authorization header against stored API keys.
 *
 * Behavior:
 * - AUTH_DISABLED=true env var skips authentication (for local dev)
 * - T3X_ALLOW_AUTH_DISABLED_IN_PRODUCTION=true allows that override in Docker/self-hosted
 * - Whitelisted paths bypass authentication
 * - Valid API key → sets apiKey in Hono context variables
 * - Invalid/missing key → 401 Unauthorized
 *
 * @see packages/api/src/lib/errors.ts for error codes
 */

import type { ApiKeyPrincipalKind, TransitionScope } from '@t3x-dev/core';
import { type AnyDB, findApiKeyByValue, touchLastUsed } from '@t3x-dev/storage';
import type { Context, Next } from 'hono';
import { isAuthenticationDisabled } from '../lib/auth-config';
import { getDB } from '../lib/db';
import { createError } from '../lib/errors';
import { isRunnerServiceRoute, runnerServiceAuthenticationError } from '../lib/runner-service-auth';
import { pinoLogger } from './logger';

/** Normalized authority returned by raw-token entry points such as WebSocket. */
export interface BearerTokenPrincipal {
  userId: string | null;
  projectId: string | null;
  /** Null for short-lived or otherwise non-persisted credentials. */
  keyId: string | null;
  principalKind: ApiKeyPrincipalKind;
  transitionScopes: readonly TransitionScope[];
}

/** Extension point for deployments that accept more than persisted API keys. */
export type BearerTokenVerifier = (
  db: AnyDB,
  token: string | null
) => Promise<BearerTokenPrincipal | null>;

/** Paths that never require authentication */
const PUBLIC_PATHS = [
  '/health',
  '/api/docs',
  '/api/openapi.json',
  '/api/v1/deployment/capabilities',
  '/api/v1/llm/models',
  // /ws owns its own auth via ?token= query param (headers are not settable
  // on browser WebSocket handshakes, so we cannot use Authorization: Bearer).
  '/ws',
];

/** Path prefixes that never require authentication */
const PUBLIC_PREFIXES = ['/api/v1/auth/callback', '/api/v1/auth/register', '/api/v1/auth/login'];

/**
 * Match the share resolve endpoint: GET /api/v1/share/:token
 * Only a single path segment after /share/ (no further slashes).
 * This excludes DELETE /api/v1/share/:id (different method) and
 * GET /api/v1/share/entity/:type/:id (has sub-path).
 */
const SHARE_RESOLVE_PATTERN = /^\/api\/v1\/share\/[^/]+$/;

function isPublicPath(path: string, method?: string): boolean {
  if (PUBLIC_PATHS.includes(path)) return true;
  for (const prefix of PUBLIC_PREFIXES) {
    if (path.startsWith(prefix)) return true;
  }
  // Share resolve: only GET /api/v1/share/:token (single segment, not /entity/)
  if (
    method === 'GET' &&
    SHARE_RESOLVE_PATTERN.test(path) &&
    !path.startsWith('/api/v1/share/entity')
  ) {
    return true;
  }
  return false;
}

/**
 * Authentication middleware for Hono.
 *
 * Auth is ENABLED by default.
 * Only disabled when AUTH_DISABLED is explicitly set to 'true'.
 */
export async function authMiddleware(c: Context, next: Next) {
  // Runner callbacks and lookups use a narrowly scoped service identity. Check
  // this before AUTH_DISABLED so machine routes never become anonymous as a
  // side effect of local-development settings.
  if (isRunnerServiceRoute(c.req.path, c.req.method)) {
    const authenticationError = runnerServiceAuthenticationError(c);
    if (authenticationError) return authenticationError;
    return next();
  }

  // Skip auth only when explicitly disabled (AUTH_DISABLED=true, case-insensitive).
  // Production builds require an additional explicit opt-in so a stray
  // AUTH_DISABLED=true cannot silently expose a deployed API.
  if (isAuthenticationDisabled()) {
    return next();
  }
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.AUTH_DISABLED?.toLowerCase() === 'true'
  ) {
    pinoLogger.warn('AUTH_DISABLED=true is ignored in production mode');
  }

  // Skip auth for public paths
  if (isPublicPath(c.req.path, c.req.method)) {
    return next();
  }

  // Extract Bearer token
  const authHeader = c.req.header('Authorization');
  if (!authHeader) {
    return c.json(
      createError(
        'UNAUTHORIZED',
        'Missing Authorization header. Use: Authorization: Bearer <api_key>'
      ),
      401
    );
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return c.json(
      createError(
        'UNAUTHORIZED',
        'Invalid Authorization header format. Use: Authorization: Bearer <api_key>'
      ),
      401
    );
  }

  const keyValue = match[1];

  try {
    const db = await getDB();
    const apiKey = await findApiKeyByValue(db, keyValue);

    if (!apiKey) {
      return c.json(createError('UNAUTHORIZED', 'Invalid API key'), 401);
    }

    // Store API key info in context for downstream use
    c.set('apiKey', apiKey);
    if (apiKey.user_id) {
      c.set('userId', apiKey.user_id);
    }

    // Update last_used_at in background (don't block the request)
    touchLastUsed(db, apiKey.id).catch(() => {});

    return next();
  } catch (err) {
    pinoLogger.error({ err }, 'error validating API key');
    return c.json(createError('INTERNAL_ERROR', 'Authentication error'), 500);
  }
}

/**
 * Verify a Bearer token (API key) and return the matching principal, or null
 * when the token is unknown or revoked. Read-only — no side effects.
 *
 * Used by non-HTTP entry points (e.g. WebSocket upgrade) that need to
 * authenticate a raw token from a query parameter rather than an
 * Authorization header.
 */
export async function verifyBearerToken(
  db: AnyDB,
  token: string | null
): Promise<BearerTokenPrincipal | null> {
  if (!token) return null;
  const apiKey = await findApiKeyByValue(db, token);
  if (!apiKey) return null;
  return {
    userId: apiKey.user_id,
    projectId: apiKey.project_id,
    keyId: apiKey.id,
    principalKind: apiKey.principal_kind,
    transitionScopes: apiKey.transition_scopes,
  };
}
