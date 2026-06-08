/**
 * Leaves CRUD Routes
 *
 * Basic create, read, update, delete operations for leaf nodes.
 *
 * Endpoints:
 * - POST   /v1/leaves                        - Create a new leaf
 * - GET    /v1/leaves/:id                    - Get leaf by ID
 * - GET    /v1/commits/:hash/leaves          - List leaves by commit
 * - GET    /v1/projects/:projectId/leaves    - List leaves by project
 * - PATCH  /v1/leaves/:id                    - Update leaf
 * - DELETE /v1/leaves/:id                    - Delete leaf
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  createLeaf,
  deleteLeaf,
  deletePinByRef,
  findLeafById,
  findLeavesByCommit,
  findLeavesByProject,
  getCommitUnified,
  insertLeafOutputEdit,
  updateLeafAtomic,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { hasDbErrorCode } from '../lib/db-errors';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { webhookDispatcher } from '../lib/webhook-dispatcher';
import { pinoLogger } from '../middleware/logger';
import {
  CursorPageResponseSchema,
  ErrorResponseSchema,
  IdParamSchema,
  SuccessResponseSchema,
} from '../schemas/common';
import { CreateLeafRequest, LeafResponse, UpdateLeafRequest } from '../schemas/contracts';
import { toApiLeaf } from './leaves-shared';

export const leavesCrudRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// Route Definitions
// ============================================================

// POST /v1/leaves - Create leaf
const createLeafRoute = createRoute({
  method: 'post',
  path: '/v1/leaves',
  tags: ['Leaves'],
  summary: 'Create a new leaf',
  description: 'Creates a new leaf node with constraints and configuration.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateLeafRequest,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Leaf created successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(LeafResponse),
        },
      },
    },
    400: {
      description: 'Invalid request',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    404: {
      description: 'Commit or project not found',
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

// GET /v1/leaves/:id - Get leaf by ID
const getLeafRoute = createRoute({
  method: 'get',
  path: '/v1/leaves/{id}',
  tags: ['Leaves'],
  summary: 'Get leaf by ID',
  description: 'Retrieves a leaf node by its unique ID.',
  request: {
    params: IdParamSchema,
  },
  responses: {
    200: {
      description: 'Leaf found',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(LeafResponse),
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

// GET /v1/commits/:hash/leaves - List leaves by commit
const listLeavesByCommitRoute = createRoute({
  method: 'get',
  path: '/v1/commits/{hash}/leaves',
  tags: ['Leaves'],
  summary: 'List leaves by commit',
  description:
    'Lists all leaf nodes associated with a specific commit. ' +
    'Supports cursor-based pagination via optional `cursor` query parameter.',
  request: {
    params: z.object({
      hash: z.string().min(1),
    }),
    query: z.object({
      type: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(1000).default(100),
      offset: z.coerce.number().int().min(0).default(0),
      cursor: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: 'List of leaves',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.union([CursorPageResponseSchema(LeafResponse), z.array(LeafResponse)])
          ),
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

// GET /v1/projects/:projectId/leaves - List leaves by project
const listLeavesByProjectRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/leaves',
  tags: ['Leaves'],
  summary: 'List leaves by project',
  description:
    'Lists all leaf nodes in a project. ' +
    'Supports cursor-based pagination via optional `cursor` query parameter.',
  request: {
    params: z.object({
      projectId: z.string().min(1),
    }),
    query: z.object({
      type: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(1000).default(100),
      offset: z.coerce.number().int().min(0).default(0),
      cursor: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: 'List of leaves',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.union([CursorPageResponseSchema(LeafResponse), z.array(LeafResponse)])
          ),
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

// PATCH /v1/leaves/:id - Update leaf
const updateLeafRoute = createRoute({
  method: 'patch',
  path: '/v1/leaves/{id}',
  tags: ['Leaves'],
  summary: 'Update leaf',
  description: 'Updates a leaf node (title, constraints, config, output).',
  request: {
    params: IdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: UpdateLeafRequest,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Leaf updated successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(LeafResponse),
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

// DELETE /v1/leaves/:id - Delete leaf
const deleteLeafRoute = createRoute({
  method: 'delete',
  path: '/v1/leaves/{id}',
  tags: ['Leaves'],
  summary: 'Delete leaf',
  description: 'Deletes a leaf node by its ID.',
  request: {
    params: IdParamSchema,
  },
  responses: {
    200: {
      description: 'Leaf deleted successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.object({
              deleted: z.literal(true),
              id: z.string(),
            })
          ),
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

// ============================================================
// Route Handlers
// ============================================================

// POST /v1/leaves - Create leaf
leavesCrudRoutes.openapi(createLeafRoute, async (c) => {
  const body = c.req.valid('json');

  try {
    const db = await getDB();

    // Auto-generate title from commit message if not provided
    let title = body.title;
    if (!title) {
      const commit = await getCommitUnified(db, body.commit_hash);
      const msg = commit?.message || body.commit_hash.slice(0, 16);
      title = `${msg} — ${body.type}`;
    }

    // Create leaf in database (storage generates IDs for leaf and constraints)
    const leaf = await createLeaf(db, {
      commit_hash: body.commit_hash,
      type: body.type,
      title,
      // biome-ignore lint/suspicious/noExplicitAny: generic error handler
      constraints: body.constraints as any,
      config: body.config ?? {},
      project_id: body.project_id,
    });

    // Fire webhook event (fire-and-forget)
    webhookDispatcher.dispatch(
      'leaf.created',
      {
        leaf_id: leaf.id,
        project_id: body.project_id,
        type: body.type,
        commit_hash: body.commit_hash,
      },
      body.project_id
    );

    return c.json({ success: true as const, data: toApiLeaf(leaf) }, 201);
  } catch (err) {
    // Handle PostgreSQL foreign key violation (commit or project not found)
    if (hasDbErrorCode(err, '23503')) {
      return errorResponse(c, 'REFERENCE_NOT_FOUND', 'Referenced commit or project not found');
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'CREATE_FAILED', message);
  }
});

// GET /v1/leaves/:id - Get leaf by ID
leavesCrudRoutes.openapi(getLeafRoute, async (c) => {
  const { id } = c.req.valid('param');

  try {
    const db = await getDB();
    const leaf = await findLeafById(db, id);

    if (!leaf) {
      return errorResponse(c, 'LEAF_NOT_FOUND', `Leaf not found: ${id}`);
    }

    return c.json({ success: true as const, data: toApiLeaf(leaf) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'GET_FAILED', message);
  }
});

// GET /v1/commits/:hash/leaves - List leaves by commit
leavesCrudRoutes.openapi(listLeavesByCommitRoute, async (c) => {
  const { hash } = c.req.valid('param');
  const { type, limit, offset, cursor } = c.req.valid('query');
  const decodedHash = decodeURIComponent(hash);

  try {
    const db = await getDB();

    // Cursor-based pagination mode
    if (cursor !== undefined) {
      const result = await findLeavesByCommit(db, decodedHash, {
        // biome-ignore lint/suspicious/noExplicitAny: generic error handler
        type: type as any,
        cursor: cursor as string,
        limit,
      });
      return c.json(
        {
          success: true as const,
          data: {
            items: result.items.map(toApiLeaf),
            next_cursor: result.next_cursor,
            has_more: result.has_more,
          },
        },
        200
      );
    }

    // Legacy offset/limit mode
    // biome-ignore lint/suspicious/noExplicitAny: generic error handler
    const leaves = await findLeavesByCommit(db, decodedHash, { type: type as any, limit, offset });

    return c.json({ success: true as const, data: leaves.map(toApiLeaf) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'LIST_FAILED', message);
  }
});

// GET /v1/projects/:projectId/leaves - List leaves by project
leavesCrudRoutes.openapi(listLeavesByProjectRoute, async (c) => {
  const { projectId } = c.req.valid('param');
  const { type, limit, offset, cursor } = c.req.valid('query');

  try {
    const db = await getDB();

    // Cursor-based pagination mode
    if (cursor !== undefined) {
      const result = await findLeavesByProject(db, projectId, {
        // biome-ignore lint/suspicious/noExplicitAny: generic error handler
        type: type as any,
        cursor: cursor as string,
        limit,
      });
      return c.json(
        {
          success: true as const,
          data: {
            items: result.items.map(toApiLeaf),
            next_cursor: result.next_cursor,
            has_more: result.has_more,
          },
        },
        200
      );
    }

    // Legacy offset/limit mode
    // biome-ignore lint/suspicious/noExplicitAny: generic error handler
    const leaves = await findLeavesByProject(db, projectId, { type: type as any, limit, offset });

    return c.json({ success: true as const, data: leaves.map(toApiLeaf) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'LIST_FAILED', message);
  }
});

// PATCH /v1/leaves/:id - Update leaf
leavesCrudRoutes.openapi(updateLeafRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');

  try {
    const db = await getDB();

    // Track output edits for reverse learning (Item 17)
    // If the user is changing the output, record the before/after
    if (body.output !== undefined) {
      const existing = await findLeafById(db, id);
      if (existing?.output && existing.output !== body.output) {
        insertLeafOutputEdit(db, {
          leaf_id: id,
          project_id: existing.project_id,
          original_output: existing.output!,
          modified_output: body.output!,
        }).catch((err) => {
          pinoLogger.warn({ err, leafId: id }, 'failed to track leaf output edit');
        });
      }
    }

    // Use atomic update to wrap all changes in a transaction
    const leaf = await updateLeafAtomic(db, id, {
      title: body.title,
      // biome-ignore lint/suspicious/noExplicitAny: generic error handler
      constraints: body.constraints as any,
      config: body.config,
      output: body.output ?? undefined,
    });

    if (!leaf) {
      return errorResponse(c, 'LEAF_NOT_FOUND', `Leaf not found: ${id}`);
    }

    return c.json({ success: true as const, data: toApiLeaf(leaf) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'UPDATE_FAILED', message);
  }
});

// DELETE /v1/leaves/:id - Delete leaf
leavesCrudRoutes.openapi(deleteLeafRoute, async (c) => {
  const { id } = c.req.valid('param');

  try {
    const db = await getDB();

    // Fetch leaf first to obtain project_id needed for pin cleanup.
    // Then immediately attempt delete — if it returns false (concurrent delete),
    // return 404. Pin cleanup only runs when delete actually succeeds.
    const leaf = await findLeafById(db, id);

    const deleted = await deleteLeaf(db, id);

    if (!deleted) {
      // Leaf was not found (either never existed or concurrently deleted)
      return errorResponse(c, 'LEAF_NOT_FOUND', `Leaf not found: ${id}`);
    }

    // Clean up associated pins only when delete succeeded
    if (leaf) {
      await deletePinByRef(db, leaf.project_id, 'leaf', id);
    }

    return c.json({ success: true as const, data: { deleted: true as const, id } }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'DELETE_FAILED', message);
  }
});
