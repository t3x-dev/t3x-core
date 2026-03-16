/**
 * Leaves History Routes
 *
 * History management for leaf generation outputs.
 *
 * Endpoints:
 * - GET    /v1/leaves/:id/history     - List generation history
 * - POST   /v1/leaves/:id/restore     - Restore output from history
 * - DELETE /v1/leaf-history/:id       - Delete a history entry
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  deleteLeafHistory,
  findHistoryByLeafId,
  findLeafById,
  findLeafHistoryById,
  updateLeafOutput,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { ErrorResponseSchema, IdParamSchema, SuccessResponseSchema } from '../schemas/common';
import {
  DeleteLeafHistoryResponse,
  LeafHistoryResponse,
  LeafResponse,
  RestoreLeafOutputRequest,
} from '../schemas/v4-contracts';
import { toApiLeaf, toApiLeafHistory } from './leaves-shared';

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
  summary: 'Restore output from history',
  description: 'Restores a previous output version to the leaf.',
  request: {
    params: IdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: RestoreLeafOutputRequest,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Output restored successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(LeafResponse),
        },
      },
    },
    400: {
      description: 'History entry does not belong to this leaf',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    404: {
      description: 'Leaf or history not found',
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

// DELETE /v1/leaf-history/:id - Delete a history entry
const deleteLeafHistoryRoute = createRoute({
  method: 'delete',
  path: '/v1/leaf-history/{id}',
  tags: ['Leaves'],
  summary: 'Delete history entry',
  description: 'Deletes a specific generation history entry.',
  request: {
    params: IdParamSchema,
  },
  responses: {
    200: {
      description: 'History entry deleted successfully',
      content: {
        'application/json': {
          schema: DeleteLeafHistoryResponse,
        },
      },
    },
    404: {
      description: 'History entry not found',
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

    // Get history entries
    const history = await findHistoryByLeafId(db, id, { limit, offset });

    return c.json({ success: true as const, data: history.map(toApiLeafHistory) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'LIST_FAILED', message);
  }
});

// POST /v1/leaves/:id/restore - Restore output from history
leavesHistoryRoutes.openapi(restoreLeafOutputRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { history_id } = c.req.valid('json');

  try {
    const db = await getDB();

    // 1. Verify the leaf exists
    const leaf = await findLeafById(db, id);
    if (!leaf) {
      return errorResponse(c, 'LEAF_NOT_FOUND', `Leaf not found: ${id}`);
    }

    // 2. Get the history entry
    const history = await findLeafHistoryById(db, history_id);
    if (!history) {
      return errorResponse(c, 'HISTORY_NOT_FOUND', `History entry not found: ${history_id}`);
    }

    // 3. Verify the history belongs to this leaf
    if (history.leaf_id !== id) {
      return errorResponse(
        c,
        'HISTORY_MISMATCH',
        `History entry ${history_id} does not belong to leaf ${id}`
      );
    }

    // 4. Update leaf with the restored output
    const updatedLeaf = await updateLeafOutput(db, id, history.output);
    if (!updatedLeaf) {
      return errorResponse(c, 'UPDATE_FAILED', 'Failed to restore output');
    }

    return c.json({ success: true as const, data: toApiLeaf(updatedLeaf) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'RESTORE_FAILED', message);
  }
});

// DELETE /v1/leaf-history/:id - Delete a history entry
leavesHistoryRoutes.openapi(deleteLeafHistoryRoute, async (c) => {
  const { id } = c.req.valid('param');

  try {
    const db = await getDB();

    // Delete the history entry
    const deleted = await deleteLeafHistory(db, id);

    if (!deleted) {
      return errorResponse(c, 'HISTORY_NOT_FOUND', `History entry not found: ${id}`);
    }

    return c.json({ success: true as const, data: { deleted: true as const, id } }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'DELETE_FAILED', message);
  }
});
