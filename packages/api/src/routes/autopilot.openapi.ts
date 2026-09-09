/**
 * Autopilot Routes (OpenAPI)
 *
 * Knowledge autopilot configuration endpoints.
 *
 * GET  /v1/projects/:projectId/autopilot/config     - Get autopilot config
 * PUT  /v1/projects/:projectId/autopilot/config     - Update autopilot config
 * GET  /v1/projects/:projectId/autopilot/adaptive   - Get adaptive threshold suggestion
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { computeAdaptiveConfig, DEFAULT_AUTOPILOT_CONFIG } from '@t3x-dev/core';
import {
  getAdaptiveFeedbackStats,
  getAutopilotConfig,
  updateAutopilotConfig,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertProjectAccess } from '../lib/project-access';
import { ErrorResponseSchema } from '../schemas/common';

export const autopilotRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });

// ── Shared Schemas ──────────────────────────────────────────

const ProjectIdParam = z.object({
  projectId: z.string().openapi({ description: 'Project ID' }),
});

const AutopilotConfigSchema = z.object({
  enabled: z.boolean(),
  min_nodes: z.number(),
  auto_create_leaf: z.boolean(),
  target_branch: z.string(),
});

// ── GET /v1/projects/:projectId/autopilot/config ────────────

const GetConfigResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    config: AutopilotConfigSchema,
  }),
});

const getConfigRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/autopilot/config',
  tags: ['Autopilot'],
  summary: 'Get autopilot configuration for a project',
  description:
    'Returns the current autopilot configuration. Falls back to defaults if not configured.',
  request: { params: ProjectIdParam },
  responses: {
    200: {
      description: 'Autopilot config',
      content: { 'application/json': { schema: GetConfigResponseSchema } },
    },
    500: {
      description: 'Internal error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

autopilotRoutes.openapi(getConfigRoute, async (c) => {
  const { projectId } = c.req.valid('param');

  try {
    const db = await getDB();
    const accessResult = await assertProjectAccess(c, db, projectId);
    if (accessResult instanceof Response) return accessResult;
    const stored = await getAutopilotConfig(db, projectId);
    const config = stored ?? { ...DEFAULT_AUTOPILOT_CONFIG };

    return c.json({ success: true as const, data: { config } }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'GET_FAILED', message);
  }
});

// ── PUT /v1/projects/:projectId/autopilot/config ────────────

const UpdateConfigBodySchema = z.object({
  enabled: z.boolean().optional(),
  min_nodes: z.number().int().min(1).optional(),
  auto_create_leaf: z.boolean().optional(),
  target_branch: z.string().min(1).optional(),
});

const UpdateConfigResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    config: AutopilotConfigSchema,
  }),
});

const updateConfigRoute = createRoute({
  method: 'put',
  path: '/v1/projects/{projectId}/autopilot/config',
  tags: ['Autopilot'],
  summary: 'Update autopilot configuration',
  description:
    'Partially updates autopilot configuration. Missing fields are preserved from existing config.',
  request: {
    params: ProjectIdParam,
    body: {
      content: {
        'application/json': { schema: UpdateConfigBodySchema },
      },
    },
  },
  responses: {
    200: {
      description: 'Updated config',
      content: { 'application/json': { schema: UpdateConfigResponseSchema } },
    },
    400: {
      description: 'Invalid config',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Internal error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

autopilotRoutes.openapi(updateConfigRoute, async (c) => {
  const { projectId } = c.req.valid('param');
  const body = c.req.valid('json');

  try {
    const db = await getDB();
    const accessResult = await assertProjectAccess(c, db, projectId);
    if (accessResult instanceof Response) return accessResult;
    const config = await updateAutopilotConfig(db, projectId, body);

    return c.json({ success: true as const, data: { config } }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'UPDATE_FAILED', message);
  }
});

// ── GET /v1/projects/:projectId/autopilot/adaptive ──────────

const AdaptiveResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    adaptive: z
      .object({
        suppressedTypes: z.array(z.string()),
        cosineThresholdDelta: z.number(),
      })
      .nullable(),
    message: z.string().optional(),
    stats: z
      .object({
        total: z.number(),
        accepted: z.number(),
        rejected: z.number(),
        edited: z.number(),
        accept_rate: z.number(),
      })
      .optional(),
  }),
});

const getAdaptiveRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/autopilot/adaptive',
  tags: ['Autopilot'],
  summary: 'Get adaptive threshold suggestion based on feedback',
  description:
    'Computes an adaptive configuration from extraction feedback statistics. ' +
    'Requires at least 10 feedback entries to provide a meaningful suggestion.',
  request: { params: ProjectIdParam },
  responses: {
    200: {
      description: 'Adaptive suggestion (or null if insufficient data)',
      content: { 'application/json': { schema: AdaptiveResponseSchema } },
    },
    500: {
      description: 'Internal error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

autopilotRoutes.openapi(getAdaptiveRoute, async (c) => {
  const { projectId } = c.req.valid('param');

  try {
    const db = await getDB();
    const accessResult = await assertProjectAccess(c, db, projectId);
    if (accessResult instanceof Response) return accessResult;
    const stats = await getAdaptiveFeedbackStats(db, projectId);

    if (stats.overall.total < 10) {
      return c.json(
        {
          success: true as const,
          data: {
            adaptive: null,
            message: 'Insufficient feedback data',
          },
        },
        200
      );
    }

    const adaptive = computeAdaptiveConfig(stats);

    return c.json(
      {
        success: true as const,
        data: {
          adaptive,
          stats: {
            total: stats.overall.total,
            accepted: Math.round(stats.overall.acceptRate * stats.overall.total),
            rejected: Math.round(stats.overall.rejectRate * stats.overall.total),
            edited:
              stats.overall.total -
              Math.round(stats.overall.acceptRate * stats.overall.total) -
              Math.round(stats.overall.rejectRate * stats.overall.total),
            accept_rate: stats.overall.acceptRate,
          },
        },
      },
      200
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'GET_FAILED', message);
  }
});
