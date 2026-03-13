/**
 * Usage Routes
 *
 * Token consumption metering endpoints.
 *
 * - GET  /v1/usage       — Query usage summary and totals
 * - POST /v1/usage       — Record usage (for external services like runner)
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { getUsageSummary, getUsageTotal, recordUsage } from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { createError, zodErrorHook } from '../lib/errors';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

export const usageRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// Helpers
// ============================================================

function getUserId(c: { get: (key: string) => unknown }): string | null {
  const apiKey = c.get('apiKey') as { user_id?: string | null } | undefined;
  return apiKey?.user_id ?? null;
}

// ============================================================
// Schemas
// ============================================================

const UsageSummaryRowSchema = z.object({
  period: z.string(),
  input_tokens: z.number(),
  output_tokens: z.number(),
  estimated_cost: z.number(),
});

const UsageTotalSchema = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
  estimated_cost: z.number(),
});

const GetUsageQuerySchema = z.object({
  from: z.string().openapi({ description: 'Start date (ISO 8601)' }),
  to: z.string().openapi({ description: 'End date (ISO 8601)' }),
  group_by: z
    .enum(['day', 'week', 'month'])
    .default('day')
    .openapi({ description: 'Grouping period' }),
});

const RecordUsageBodySchema = z.object({
  project_id: z.string(),
  endpoint: z.string(),
  model: z.string(),
  input_tokens: z.number().int().min(0),
  output_tokens: z.number().int().min(0),
  estimated_cost: z.number().optional(),
});

// ============================================================
// GET /v1/usage
// ============================================================

const getUsageRoute = createRoute({
  method: 'get',
  path: '/v1/usage',
  tags: ['Usage'],
  summary: 'Get token usage summary and total',
  request: {
    query: GetUsageQuerySchema,
  },
  responses: {
    200: {
      description: 'Usage summary and total',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.object({
              summary: z.array(UsageSummaryRowSchema),
              total: UsageTotalSchema,
            })
          ),
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': { schema: ErrorResponseSchema },
      },
    },
  },
});

usageRoutes.openapi(getUsageRoute, async (c) => {
  const userId = getUserId(c);
  if (!userId) {
    return c.json(createError('UNAUTHORIZED', 'Authentication required'), 401);
  }

  const query = c.req.valid('query');
  const from = new Date(query.from);
  const to = new Date(query.to);
  const group_by = query.group_by;

  const db = await getDB();

  const [summary, total] = await Promise.all([
    getUsageSummary(db, { user_id: userId, from, to, group_by }),
    getUsageTotal(db, { user_id: userId, from, to }),
  ]);

  return c.json({ success: true as const, data: { summary, total } }, 200);
});

// ============================================================
// POST /v1/usage
// ============================================================

const recordUsageRoute = createRoute({
  method: 'post',
  path: '/v1/usage',
  tags: ['Usage'],
  summary: 'Record token usage (for external services)',
  request: {
    body: {
      content: {
        'application/json': { schema: RecordUsageBodySchema },
      },
    },
  },
  responses: {
    201: {
      description: 'Usage recorded',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.object({
              id: z.string(),
            })
          ),
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': { schema: ErrorResponseSchema },
      },
    },
  },
});

usageRoutes.openapi(recordUsageRoute, async (c) => {
  const userId = getUserId(c);
  if (!userId) {
    return c.json(createError('UNAUTHORIZED', 'Authentication required'), 401);
  }

  const body = c.req.valid('json');
  const db = await getDB();

  const result = await recordUsage(db, {
    user_id: userId,
    project_id: body.project_id,
    endpoint: body.endpoint,
    model: body.model,
    input_tokens: body.input_tokens,
    output_tokens: body.output_tokens,
    estimated_cost: body.estimated_cost,
  });

  return c.json({ success: true as const, data: { id: result.id } }, 201);
});
