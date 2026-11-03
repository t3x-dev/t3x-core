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

import type { RequestPrincipal } from '@t3x-dev/application';
import {
  type AnyDB,
  findActiveSessionByToken,
  findApiKeyByValue,
  touchLastUsed,
  touchSessionLastSeen,
} from '@t3x-dev/storage';
import type { Context, Next } from 'hono';
import { isAuthenticationDisabled } from '../lib/auth-config';
import { getDB } from '../lib/db';
import { createError } from '../lib/errors';
import {
  localDevelopmentRequestPrincipal,
  requestPrincipalFromApiKey,
  requestPrincipalFromSession,
  runnerRequestPrincipal,
  setRequestPrincipal,
  WEB_SESSION_TOKEN_PREFIX,
} from '../lib/request-principal';
import { isRunnerServiceRoute, runnerServiceAuthenticationError } from '../lib/runner-service-auth';
import type { AppEnv } from '../types';
import { pinoLogger } from './logger';

/** Extension point for deployments that accept more than persisted API keys. */
export type BearerTokenVerifier = (
  db: AnyDB,
  token: string | null
) => Promise<RequestPrincipal | null>;

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
const RESERVED_IDENTITY_HEADERS = [
  'X-T3X-Actor',
  'X-T3X-Owner',
  'X-T3X-Delegator',
  'X-T3X-Principal',
  'X-T3X-Role',
  'X-T3X-Namespace',
  'X-T3X-Scopes',
] as const;

function reservedIdentityHeader(c: Context): string | undefined {
  return RESERVED_IDENTITY_HEADERS.find((header) => c.req.header(header) !== undefined);
}

function rejectIdentityOverride(c: Context): Response | null {
  const header = reservedIdentityHeader(c);
  return header
    ? c.json(createError('INVALID_REQUEST', `${header} is server-controlled`), 400)
    : null;
}

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
export async function authMiddleware(c: Context<AppEnv>, next: Next) {
  // Runner callbacks and lookups use a narrowly scoped service identity. Check
  // this before AUTH_DISABLED so machine routes never become anonymous as a
  // side effect of local-development settings.
  if (isRunnerServiceRoute(c.req.path, c.req.method)) {
    const authenticationError = runnerServiceAuthenticationError(c);
    if (authenticationError) return authenticationError;
    const identityOverride = rejectIdentityOverride(c);
    if (identityOverride) return identityOverride;
    setRequestPrincipal(c, runnerRequestPrincipal());
    return next();
  }

  // Skip auth only when explicitly disabled (AUTH_DISABLED=true, case-insensitive).
  // Production builds require an additional explicit opt-in so a stray
  // AUTH_DISABLED=true cannot silently expose a deployed API.
  if (isAuthenticationDisabled()) {
    const identityOverride = rejectIdentityOverride(c);
    if (identityOverride) return identityOverride;
    setRequestPrincipal(c, localDevelopmentRequestPrincipal());
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
    if (keyValue.startsWith(WEB_SESSION_TOKEN_PREFIX)) {
      const session = await findActiveSessionByToken(db, keyValue);
      if (!session) {
        return c.json(createError('UNAUTHORIZED', 'Invalid session'), 401);
      }

      const identityOverride = rejectIdentityOverride(c);
      if (identityOverride) return identityOverride;

      c.set('session', session);
      c.set('userId', session.user_id);
      setRequestPrincipal(c, requestPrincipalFromSession(session, 'http'));
      touchSessionLastSeen(db, session.id).catch(() => {});
      return next();
    }

    const apiKey = await findApiKeyByValue(db, keyValue);

    if (!apiKey) {
      return c.json(createError('UNAUTHORIZED', 'Invalid API key'), 401);
    }

    const identityOverride = rejectIdentityOverride(c);
    if (identityOverride) return identityOverride;

    // Store API key info in context for downstream use
    c.set('apiKey', apiKey);
    setRequestPrincipal(c, requestPrincipalFromApiKey(apiKey, 'http'));
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
): Promise<RequestPrincipal | null> {
  if (!token) return null;
  if (token.startsWith(WEB_SESSION_TOKEN_PREFIX)) {
    const session = await findActiveSessionByToken(db, token);
    return session ? requestPrincipalFromSession(session, 'websocket') : null;
  }
  const apiKey = await findApiKeyByValue(db, token);
  if (!apiKey) return null;
  return requestPrincipalFromApiKey(apiKey, 'websocket');
}
