import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { findProjects } from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

const startTime = Date.now();

export const statusRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });

const StatusDataSchema = z.object({
  status: z.string(),
  version: z.string(),
  uptime: z.number(),
  database: z.string(),
  projects_count: z.string(),
});

const statusRoute = createRoute({
  method: 'get',
  path: '/v1/status',
  tags: ['Health'],
  summary: 'Detailed status with DB check',
  responses: {
    200: {
      description: 'Status OK',
      content: { 'application/json': { schema: SuccessResponseSchema(StatusDataSchema) } },
    },
    500: {
      description: 'Status error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

statusRoutes.openapi(statusRoute, async (c) => {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  try {
    const db = await getDB();
    const projects = await findProjects(db, { limit: 1, offset: 0 });
    return c.json({ success: true as const, data: {
      status: 'ok',
      version: '1.0.0',
      uptime: uptimeSeconds,
      database: 'connected',
      projects_count: projects.length > 0 ? 'available' : 'empty',
    } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'INTERNAL_ERROR', message);
  }
});
