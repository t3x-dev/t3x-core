/**
 * API Key Authentication Middleware
 *
 * Validates Bearer token in Authorization header against stored API keys.
 *
 * Behavior:
 * - AUTH_DISABLED=true env var skips authentication (for local dev)
 * - Whitelisted paths bypass authentication
 * - Valid API key → sets apiKey in Hono context variables
 * - Invalid/missing key → 401 Unauthorized
 *
 * @see apps/api/src/lib/errors.ts for error codes
 */

import type { Context, Next } from 'hono';
import { getDB } from '../lib/db';
import { createError } from '../lib/errors';

/** Paths that never require authentication */
const PUBLIC_PATHS = ['/health', '/api/docs', '/api/openapi.json'];

/** Path prefixes that never require authentication */
const PUBLIC_PREFIXES = ['/api/v1/share/'];

function isPublicPath(path: string): boolean {
  if (PUBLIC_PATHS.includes(path)) return true;
  for (const prefix of PUBLIC_PREFIXES) {
    if (path.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Authentication middleware for Hono.
 *
 * When AUTH_DISABLED=true, all requests pass through without authentication.
 * Otherwise, requires a valid API key via `Authorization: Bearer <key>` header.
 */
export async function authMiddleware(c: Context, next: Next) {
  // Skip auth if disabled (local development)
  if (process.env.AUTH_DISABLED === 'true') {
    return next();
  }

  // Skip auth for public paths
  if (isPublicPath(c.req.path)) {
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
    // Dynamic import to avoid circular dependency
    const { findApiKeyByValue, touchLastUsed } = await import('@t3x/storage');
    const db = await getDB();
    const apiKey = await findApiKeyByValue(db, keyValue);

    if (!apiKey) {
      return c.json(createError('UNAUTHORIZED', 'Invalid API key'), 401);
    }

    // Store API key info in context for downstream use
    c.set('apiKey', apiKey);

    // Update last_used_at in background (don't block the request)
    touchLastUsed(db, apiKey.id).catch(() => {});

    return next();
  } catch (err) {
    console.error('[Auth] Error validating API key:', err);
    return c.json(createError('INTERNAL_ERROR', 'Authentication error'), 500);
  }
}
