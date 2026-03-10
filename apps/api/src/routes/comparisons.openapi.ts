/**
 * Comparisons Routes with OpenAPI
 *
 * Endpoints:
 * - POST   /v1/comparisons            - Save a comparison snapshot
 * - GET    /v1/comparisons             - List comparisons by project
 * - GET    /v1/comparisons/:id         - Get a comparison
 * - DELETE /v1/comparisons/:id         - Delete a comparison
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  createComparison,
  deleteComparison,
  getComparison,
  listComparisons,
} from '@t3x-dev/storage/pglite';
import { nanoid } from 'nanoid';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import {
  CursorPageResponseSchema,
  ErrorResponseSchema,
  SuccessResponseSchema,
} from '../schemas/common';

// ============================================================
// Schemas
// ============================================================

const ConfigSchema = z.object({
  model: z.string(),
  prompt_version: z.string(),
});

const SavedComparisonSchema = z.object({
  comparison_id: z.string(),
  project_id: z.string().nullable(),
  title: z.string(),
  control_config: ConfigSchema,
  treatment_config: ConfigSchema,
  control_run_ids: z.array(z.string()),
  treatment_run_ids: z.array(z.string()),
  result_snapshot: z.record(z.string(), z.any()),
  created_at: z.string(),
});

const CreateComparisonRequest = z.object({
  project_id: z.string().nullable().optional(),
  title: z.string().min(1).max(200),
  control_config: ConfigSchema,
  treatment_config: ConfigSchema,
  control_run_ids: z.array(z.string()),
  treatment_run_ids: z.array(z.string()),
  result_snapshot: z.record(z.string(), z.any()),
});

const ComparisonIdParam = z.object({
  id: z.string().min(1),
});

const ListComparisonsQuery = z.object({
  project_id: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50).optional(),
  offset: z.coerce.number().int().min(0).default(0).optional(),
  cursor: z.string().optional(),
});

export const comparisonsRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// Helper: format DB row → API response
// ============================================================

function formatComparison(row: {
  comparisonId: string;
  projectId: string | null;
  title: string;
  controlConfig: unknown;
  treatmentConfig: unknown;
  controlRunIds: unknown;
  treatmentRunIds: unknown;
  resultSnapshot: unknown;
  createdAt: Date;
}) {
  return {
    comparison_id: row.comparisonId,
    project_id: row.projectId,
    title: row.title,
    control_config: row.controlConfig,
    treatment_config: row.treatmentConfig,
    control_run_ids: row.controlRunIds,
    treatment_run_ids: row.treatmentRunIds,
    result_snapshot: row.resultSnapshot,
    created_at: row.createdAt.toISOString(),
  };
}

// ============================================================
// POST /v1/comparisons — Save a comparison
// ============================================================

const createComparisonRoute = createRoute({
  method: 'post',
  path: '/v1/comparisons',
  tags: ['Comparisons'],
  summary: 'Save a comparison snapshot',
  request: {
    body: {
      content: {
        'application/json': { schema: CreateComparisonRequest },
      },
    },
  },
  responses: {
    201: {
      description: 'Comparison created',
      content: {
        'application/json': { schema: SuccessResponseSchema(SavedComparisonSchema) },
      },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

comparisonsRoutes.openapi(createComparisonRoute, async (c) => {
  const body = c.req.valid('json');

  try {
    const db = await getDB();
    const comparisonId = `comp_${nanoid(12)}`;

    const row = await createComparison(db, {
      comparison_id: comparisonId,
      project_id: body.project_id,
      title: body.title,
      control_config: body.control_config,
      treatment_config: body.treatment_config,
      control_run_ids: body.control_run_ids,
      treatment_run_ids: body.treatment_run_ids,
      result_snapshot: body.result_snapshot,
    });

    return c.json({ success: true as const, data: formatComparison(row) }, 201);
  } catch (err) {
    return errorResponse(
      c,
      'CREATE_FAILED',
      err instanceof Error ? err.message : 'Failed to create comparison'
    );
  }
});

// ============================================================
// GET /v1/comparisons — List comparisons by project
// ============================================================

const listComparisonsRoute = createRoute({
  method: 'get',
  path: '/v1/comparisons',
  tags: ['Comparisons'],
  summary: 'List saved comparisons for a project',
  description:
    'Lists saved comparisons. Supports cursor-based pagination via optional `cursor` query parameter.',
  request: {
    query: ListComparisonsQuery,
  },
  responses: {
    200: {
      description: 'List of comparisons',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.union([
              CursorPageResponseSchema(SavedComparisonSchema),
              z.array(SavedComparisonSchema),
            ])
          ),
        },
      },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

comparisonsRoutes.openapi(listComparisonsRoute, async (c) => {
  const { project_id, limit, offset, cursor } = c.req.valid('query');

  try {
    const db = await getDB();

    // Cursor-based pagination mode
    if (cursor !== undefined) {
      const result = await listComparisons(db, project_id || null, { cursor, limit });
      return c.json({
        success: true as const,
        data: {
          items: result.items.map(formatComparison),
          next_cursor: result.next_cursor,
          has_more: result.has_more,
        },
      });
    }

    // Legacy offset/limit mode
    const rows = await listComparisons(db, project_id || null, { limit, offset });
    return c.json({
      success: true as const,
      data: rows.map(formatComparison),
    });
  } catch (err) {
    return errorResponse(
      c,
      'LIST_FAILED',
      err instanceof Error ? err.message : 'Failed to list comparisons'
    );
  }
});

// ============================================================
// GET /v1/comparisons/:id — Get a comparison
// ============================================================

const getComparisonRoute = createRoute({
  method: 'get',
  path: '/v1/comparisons/{id}',
  tags: ['Comparisons'],
  summary: 'Get a saved comparison by ID',
  request: {
    params: ComparisonIdParam,
  },
  responses: {
    200: {
      description: 'Comparison found',
      content: {
        'application/json': { schema: SuccessResponseSchema(SavedComparisonSchema) },
      },
    },
    404: {
      description: 'Comparison not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

comparisonsRoutes.openapi(getComparisonRoute, async (c) => {
  const { id } = c.req.valid('param');

  try {
    const db = await getDB();
    const row = await getComparison(db, id);
    if (!row) {
      return errorResponse(c, 'NOT_FOUND', `Comparison not found: ${id}`);
    }
    return c.json({ success: true as const, data: formatComparison(row) });
  } catch (err) {
    return errorResponse(
      c,
      'GET_FAILED',
      err instanceof Error ? err.message : 'Failed to get comparison'
    );
  }
});

// ============================================================
// DELETE /v1/comparisons/:id — Delete a comparison
// ============================================================

const deleteComparisonRoute = createRoute({
  method: 'delete',
  path: '/v1/comparisons/{id}',
  tags: ['Comparisons'],
  summary: 'Delete a saved comparison',
  request: {
    params: ComparisonIdParam,
  },
  responses: {
    200: {
      description: 'Comparison deleted',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.object({ deleted: z.literal(true) })),
        },
      },
    },
    404: {
      description: 'Comparison not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

comparisonsRoutes.openapi(deleteComparisonRoute, async (c) => {
  const { id } = c.req.valid('param');

  try {
    const db = await getDB();
    const deleted = await deleteComparison(db, id);
    if (!deleted) {
      return errorResponse(c, 'NOT_FOUND', `Comparison not found: ${id}`);
    }
    return c.json({ success: true as const, data: { deleted: true as const } });
  } catch (err) {
    return errorResponse(
      c,
      'DELETE_FAILED',
      err instanceof Error ? err.message : 'Failed to delete comparison'
    );
  }
});
