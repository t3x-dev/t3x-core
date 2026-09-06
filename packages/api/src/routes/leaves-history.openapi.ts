import { retiredLeafResponses, retiredLeafWriter } from '../lib/leaf-retirement';
/** Historical Leaf readers; writer routes return HTTP 410 without accessing storage. */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { findHistoryByLeafId, findLeafById } from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertProjectAccess } from '../lib/project-access';
import { ErrorResponseSchema, IdParamSchema, SuccessResponseSchema } from '../schemas/common';
import { LeafHistoryResponse } from '../schemas/contracts';
import { toApiLeafHistory } from './leaves-shared';

export const leavesHistoryRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// Route Definitions
// ============================================================

// GET /v1/leaves/:id/history - List history for a leaf
const listLeafHistoryRoute = createRoute({
  method: 'get',
  path: '/v1/leaves/{id}/history',
  tags: ['Leaves'],
  summary: 'List generation history',
  description: 'Lists all generation history entries for a leaf, ordered by most recent first.',
  request: {
    params: IdParamSchema,
    query: z.object({
      limit: z.coerce.number().int().min(1).max(100).default(20),
      offset: z.coerce.number().int().min(0).default(0),
    }),
  },
  responses: {
    200: {
      description: 'History list',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.array(LeafHistoryResponse)),
        },
      },
    },
    404: {
      description: 'Leaf not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// POST /v1/leaves/:id/restore - Restore output from history
const restoreLeafOutputRoute = createRoute({
  method: 'post',
  path: '/v1/leaves/{id}/restore',
  tags: ['Leaves'],
  summary: 'Retired Leaf writer; use exact State or Commit export',
  deprecated: true,
  responses: retiredLeafResponses,
});

// DELETE /v1/leaf-history/:id - Delete a history entry
const deleteLeafHistoryRoute = createRoute({
  method: 'delete',
  path: '/v1/leaf-history/{id}',
  tags: ['Leaves'],
  summary: 'Retired Leaf writer; use exact State or Commit export',
  deprecated: true,
  responses: retiredLeafResponses,
});

// ============================================================
// Route Handlers
// ============================================================

// GET /v1/leaves/:id/history - List generation history
leavesHistoryRoutes.openapi(listLeafHistoryRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { limit, offset } = c.req.valid('query');

  try {
    const db = await getDB();

    // First verify the leaf exists
    const leaf = await findLeafById(db, id);
    if (!leaf) {
      return errorResponse(c, 'LEAF_NOT_FOUND', `Leaf not found: ${id}`);
    }
    const accessResult = await assertProjectAccess(c, db, leaf.project_id);
    if (accessResult instanceof Response) return accessResult;

    // Get history entries
    const history = await findHistoryByLeafId(db, id, { limit, offset });

    return c.json({ success: true as const, data: history.map(toApiLeafHistory) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'LIST_FAILED', message);
  }
});

// POST /v1/leaves/:id/restore - Restore output from history
leavesHistoryRoutes.openapi(restoreLeafOutputRoute, retiredLeafWriter);

// DELETE /v1/leaf-history/:id - Delete a history entry
leavesHistoryRoutes.openapi(deleteLeafHistoryRoute, retiredLeafWriter);
