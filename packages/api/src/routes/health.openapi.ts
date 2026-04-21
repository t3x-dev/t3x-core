/** biome-ignore-all lint/suspicious/noExplicitAny: health route inspects dynamic provider runtime metadata pending stricter shared status types */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { findProjects } from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { zodErrorHook } from '../lib/errors';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

const startTime = Date.now();

export const healthRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });

const HealthDataSchema = z.object({
  status: z.literal('ok'),
  version: z.string(),
  uptime: z.number(),
});

const ReadyDataSchema = z.object({
  status: z.literal('ready'),
  checks: z.object({ database: z.literal('ok') }),
});

const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  tags: ['Health'],
  summary: 'Liveness probe',
  description: 'Always returns 200 if the process is alive. No dependency checks.',
  responses: {
    200: {
      description: 'Process is alive',
      content: { 'application/json': { schema: SuccessResponseSchema(HealthDataSchema) } },
    },
  },
});

const readyRoute = createRoute({
  method: 'get',
  path: '/ready',
  tags: ['Health'],
  summary: 'Readiness probe',
  description: 'Verifies that the database is reachable via a simple query.',
  responses: {
    200: {
      description: 'Database is reachable',
      content: { 'application/json': { schema: SuccessResponseSchema(ReadyDataSchema) } },
    },
    503: {
      description: 'Database unavailable',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

healthRoutes.openapi(healthRoute, (c) => {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  return c.json({
    success: true as const,
    data: { status: 'ok' as const, version: '1.0.0', uptime: uptimeSeconds },
  });
});

healthRoutes.openapi(readyRoute, async (c: any): Promise<any> => {
  try {
    const db = await getDB();
    await findProjects(db, { limit: 1, offset: 0 });
    return c.json({
      success: true as const,
      data: { status: 'ready' as const, checks: { database: 'ok' as const } },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database check failed';
    return c.json({ success: false as const, error: { code: 'NOT_READY', message } }, 503);
  }
});
