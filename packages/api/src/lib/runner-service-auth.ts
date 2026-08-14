import { timingSafeEqual } from 'node:crypto';
import type { Context } from 'hono';
import { createError } from './errors';

export function runnerServiceToken(): string | undefined {
  const token = process.env.RUNNER_SERVICE_TOKEN ?? process.env.RUNNER_SECRET;
  return token && token.length > 0 ? token : undefined;
}

function equalSecret(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  return (
    providedBytes.length === expectedBytes.length && timingSafeEqual(providedBytes, expectedBytes)
  );
}

export function runnerServiceAuthenticationError(c: Context): Response | null {
  const expected = runnerServiceToken();
  if (!expected) {
    return c.json(
      createError('SERVICE_UNAVAILABLE', 'RUNNER_SERVICE_TOKEN is not configured'),
      503
    );
  }

  const match = c.req.header('Authorization')?.match(/^Bearer\s+(.+)$/i);
  if (!equalSecret(match?.[1], expected)) {
    return c.json(createError('UNAUTHORIZED', 'Invalid or missing Runner service token'), 401);
  }
  return null;
}

export function isRunnerServiceRoute(path: string, method: string): boolean {
  if (method === 'POST' && path === '/api/v1/runs/ingest') return true;
  return method === 'GET' && /^\/api\/v1\/runs\/by-runner-id\/[^/]+$/.test(path);
}
