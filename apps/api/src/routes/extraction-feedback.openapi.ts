/**
 * Extraction Feedback Routes (OpenAPI)
 *
 * Adaptive learning loop: exposes feedback statistics and
 * confidence-bucket analysis for extraction calibration.
 *
 * Endpoints:
 * - GET /v1/projects/:projectId/extraction-feedback/stats
 * - GET /v1/projects/:projectId/extraction-feedback/cosine-buckets
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { getAdaptiveFeedbackStats, getFeedbackByCosineBucket } from '@t3x/storage/pglite';
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

const CosineBucketSchema = z.object({
  bucket: z.string(),
  total: z.number(),
  accepted: z.number(),
  edited: z.number(),
  rejected: z.number(),
  accept_rate: z.number(),
});

const CosineBucketsResponseSchema = z.array(CosineBucketSchema).openapi('CosineBuckets');

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

// ============================================================
// GET /v1/projects/:projectId/extraction-feedback/cosine-buckets
// ============================================================

const cosineBucketsRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/extraction-feedback/cosine-buckets',
  tags: ['Extraction Feedback'],
  summary: 'Get feedback bucketed by confidence ranges',
  description:
    'Returns accept/edit/reject counts grouped into 0.1-wide confidence buckets. ' +
    'Helps identify confidence ranges that correlate with user corrections.',
  request: {
    params: ProjectIdParam,
  },
  responses: {
    200: {
      description: 'Confidence-bucketed feedback',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(CosineBucketsResponseSchema),
        },
      },
    },
    500: {
      description: 'Internal error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

extractionFeedbackRoutes.openapi(cosineBucketsRoute, async (c) => {
  try {
    const { projectId } = c.req.valid('param');
    const db = await getDB();
    const buckets = await getFeedbackByCosineBucket(db, projectId);

    return c.json({ success: true as const, data: buckets }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch cosine buckets';
    return c.json({ success: false as const, error: { code: 'INTERNAL_ERROR', message } }, 500);
  }
});
