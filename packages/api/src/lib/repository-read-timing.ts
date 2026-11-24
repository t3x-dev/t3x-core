import type { Context, Next } from 'hono';
import { pinoLogger } from '../middleware/logger';

const listPaths = new Set([
  '/api/v1/projects',
  '/api/v1/explore/projects',
  '/api/v1/yschema/catalog',
]);
const detailPath = /^\/api\/v1\/projects\/[^/]+$/;
const pendingPath = /^\/(?:api\/)?v1\/projects\/[^/]+\/schema-studio\/pending\/[^/]+$/;
const schemaPreviewPath = /^\/(?:api\/)?v1\/projects\/[^/]+\/schema-studio\/preview$/;
const repositoryAddressPath = /^\/api\/v1\/repositories\/[^/]+\/[^/]+$/;
const requests = new WeakMap<
  Context,
  {
    timings: Map<string, number>;
    outcome?: 'empty' | 'unavailable';
  }
>();

export function markRepositoryReadOutcome(c: Context, outcome: 'empty' | 'unavailable') {
  const request = requests.get(c);
  if (request) request.outcome = outcome;
}

export function isProjectDetailRead(c: Context): boolean {
  return c.req.method === 'GET' && detailPath.test(c.req.path);
}

export function isPendingSchemaRead(c: Context): boolean {
  return c.req.method === 'GET' && pendingPath.test(c.req.path);
}

export function isSchemaPreviewRead(c: Context): boolean {
  return c.req.method === 'POST' && schemaPreviewPath.test(c.req.path);
}

export async function repositoryReadTimingMiddleware(c: Context, next: Next) {
  const timedGet =
    c.req.method === 'GET' &&
    (listPaths.has(c.req.path) ||
      repositoryAddressPath.test(c.req.path) ||
      isProjectDetailRead(c) ||
      isPendingSchemaRead(c));
  if (!timedGet && !isSchemaPreviewRead(c)) return next();

  const timings = new Map<string, number>();
  const start = performance.now();
  const request: NonNullable<ReturnType<typeof requests.get>> = { timings };
  requests.set(c, request);
  try {
    await next();

    timings.set('railway_api', performance.now() - start);
    if (c.res.ok) {
      for (const [name, duration] of timings) {
        c.header('Server-Timing', `${name};dur=${duration.toFixed(2)}`, { append: true });
      }
    }
    const interactionId = c.req.header('x-t3x-interaction-id');
    const requestId = c.get('requestId') as unknown;
    if (interactionId && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(interactionId)) {
      pinoLogger.info(
        {
          event: 't3x.repository_read',
          interaction_id: interactionId,
          request_id:
            typeof requestId === 'string' && /^[0-9a-f-]{36}$/i.test(requestId)
              ? requestId
              : undefined,
          status: c.res.status,
          outcome: c.res.ok ? (request.outcome ?? 'ok') : 'error',
          stages_ms: Object.fromEntries(timings),
        },
        'repository read timing'
      );
    }
  } finally {
    requests.delete(c);
  }
}

/** Durations include the caller's wait for PostgreSQL, including transport. */
export async function timeRepositoryRead<T>(
  c: Context,
  stage: string,
  work: () => Promise<T>
): Promise<T> {
  const timings = requests.get(c)?.timings;
  if (!timings) return work();
  const start = performance.now();
  try {
    return await work();
  } finally {
    timings.set(stage, performance.now() - start + (timings.get(stage) ?? 0));
  }
}
