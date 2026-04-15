/**
 * Extraction Feedback Routes (OpenAPI)
 *
 * Adaptive learning loop: exposes feedback statistics and
 * cosine-bucket analysis for extraction calibration.
 *
 * Endpoints:
 * - GET /v1/projects/:projectId/extraction-feedback/stats
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { getAdaptiveFeedbackStats } from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { zodErrorHook } from '../lib/errors';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

export const extractionFeedbackRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// Schemas
// ============================================================

const ProjectIdParam = z.object({
  projectId: z.string().min(1).openapi({ description: 'Project ID' }),
});

const InferenceTypeStatsSchema = z.object({
  total: z.number(),
  accepted: z.number(),
  edited: z.number(),
  rejected: z.number(),
});

const FeedbackStatsResponseSchema = z
  .object({
    by_inference_type: z.record(z.string(), InferenceTypeStatsSchema),
    overall: z.object({
      total: z.number(),
      accept_rate: z.number(),
      edit_rate: z.number(),
      reject_rate: z.number(),
    }),
  })
  .openapi('ExtractionFeedbackStats');

// ============================================================
// GET /v1/projects/:projectId/extraction-feedback/stats
// ============================================================

const feedbackStatsRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/extraction-feedback/stats',
  tags: ['Extraction Feedback'],
  summary: 'Get extraction feedback statistics for adaptive learning',
  description:
    'Returns aggregated accept/edit/reject rates grouped by inference type. ' +
    'Used by the adaptive threshold computation to calibrate extraction parameters.',
  request: {
    params: ProjectIdParam,
  },
  responses: {
    200: {
      description: 'Feedback statistics',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(FeedbackStatsResponseSchema),
        },
      },
    },
    500: {
      description: 'Internal error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

extractionFeedbackRoutes.openapi(feedbackStatsRoute, async (c) => {
  try {
    const { projectId } = c.req.valid('param');
    const db = await getDB();
    const stats = await getAdaptiveFeedbackStats(db, projectId);

    // Map camelCase internal format to snake_case API format
    const apiStats = {
      by_inference_type: stats.byInferenceType,
      overall: {
        total: stats.overall.total,
        accept_rate: stats.overall.acceptRate,
        edit_rate: stats.overall.editRate,
        reject_rate: stats.overall.rejectRate,
      },
    };

    return c.json({ success: true as const, data: apiStats }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch feedback stats';
    return c.json({ success: false as const, error: { code: 'INTERNAL_ERROR', message } }, 500);
  }
});
