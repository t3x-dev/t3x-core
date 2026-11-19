import type { Context, Next } from 'hono';

const detailPath = /^\/api\/v1\/projects\/[^/]+$/;
const pendingPath = /^\/(?:api\/)?v1\/projects\/[^/]+\/schema-studio\/pending\/[^/]+$/;
const stages = new WeakMap<Context, Map<string, number>>();

export function isProjectDetailRead(c: Context): boolean {
  return c.req.method === 'GET' && detailPath.test(c.req.path);
}

export function isPendingSchemaRead(c: Context): boolean {
  return c.req.method === 'GET' && pendingPath.test(c.req.path);
}

export async function repositoryReadTimingMiddleware(c: Context, next: Next) {
  if (
    c.req.method !== 'GET' ||
    !(c.req.path === '/api/v1/projects' || isProjectDetailRead(c) || isPendingSchemaRead(c))
  ) {
    return next();
  }

  const timings = new Map<string, number>();
  const start = performance.now();
  stages.set(c, timings);
  try {
    await next();
    if (!c.res.ok) return;
    timings.set('railway_api', performance.now() - start);
    for (const [name, duration] of timings) {
      c.header('Server-Timing', `${name};dur=${duration.toFixed(2)}`, { append: true });
    }
  } finally {
    stages.delete(c);
  }
}

/** Durations include the caller's wait for PostgreSQL, including transport. */
export async function timeRepositoryRead<T>(
  c: Context,
  stage: string,
  work: () => Promise<T>
): Promise<T> {
  const timings = stages.get(c);
  if (!timings) return work();
  const start = performance.now();
  try {
    return await work();
  } finally {
    timings.set(stage, performance.now() - start + (timings.get(stage) ?? 0));
  }
}
