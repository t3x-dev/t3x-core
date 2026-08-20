/**
 * Response cache policy for authenticated and security-sensitive API responses.
 *
 * The middleware runs before authentication but applies the policy after
 * downstream middleware and routes complete. That ordering lets it observe
 * principals established by either the built-in API-key middleware or a Cloud
 * auth adapter while still covering authentication failures and auth callback
 * responses that return before a principal exists.
 *
 * Route-owned Cache-Control headers are authoritative. In particular, SSE
 * handlers retain `no-cache`, downloads retain their response body/headers,
 * and extensions may opt static assets into an explicit public cache policy.
 */

import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../types';

export const PRIVATE_NO_STORE = 'private, no-store';

const AUTH_PATH_PREFIX = '/api/v1/auth/';
const PUBLIC_SHARE_RESOLVE_PATTERN = /^\/api\/v1\/share\/[^/]+$/;

function isPublicShareResolve(method: string, path: string): boolean {
  return (
    method === 'GET' &&
    PUBLIC_SHARE_RESOLVE_PATTERN.test(path) &&
    !path.startsWith('/api/v1/share/entity/')
  );
}

export const responseCachePolicyMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  await next();

  if (c.res.headers.has('Cache-Control')) return;

  const hasPrincipal = c.get('apiKey') !== undefined || c.get('userId') !== undefined;
  const carriesAuthorization = c.req.header('Authorization') !== undefined;
  const isSensitiveAuthPath = c.req.path.startsWith(AUTH_PATH_PREFIX);
  const isRevocablePublicShare = isPublicShareResolve(c.req.method, c.req.path);

  if (hasPrincipal || carriesAuthorization || isSensitiveAuthPath || isRevocablePublicShare) {
    c.header('Cache-Control', PRIVATE_NO_STORE);
  }
});
