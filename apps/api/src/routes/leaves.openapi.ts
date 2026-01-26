/**
 * Leaves Routes with OpenAPI
 *
 * REST API endpoints for Leaf nodes with OpenAPI documentation.
 * Leaves contain constraints, output, and validation results.
 *
 * Endpoints:
 * - POST   /v1/leaves                     - Create a new leaf
 * - GET    /v1/leaves/:id                 - Get leaf by ID
 * - GET    /v1/commits/:hash/leaves       - List leaves by commit
 * - GET    /v1/projects/:projectId/leaves - List leaves by project
 * - PATCH  /v1/leaves/:id                 - Update leaf
 * - DELETE /v1/leaves/:id                 - Delete leaf
 * - POST   /v1/leaves/:id/generate        - Generate output (future)
 * - POST   /v1/leaves/:id/validate        - Validate output (future)
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { getDB } from '../lib/db';
import { ErrorResponseSchema, IdParamSchema, SuccessResponseSchema } from '../schemas/common';
import {
  CreateLeafRequest,
  LeafResponse,
  UpdateLeafRequest,
} from '../schemas/v4-contracts';
// Storage functions (provided by @t3x/storage)
import {
  createLeaf,
  findLeafById,
  findLeavesByCommit,
  findLeavesByProject,
  updateLeaf,
  deleteLeaf,
  deletePinByRef,
} from '@t3x/storage/pglite';
import type { Leaf } from '@t3x/core';

export const leavesRoutes = new OpenAPIHono();

// ============================================================
// Response helpers
// ============================================================

/**
 * Convert storage Leaf to API response format
 * Storage returns Leaf (snake_case), API uses snake_case with null for missing values
 */
function toApiLeaf(leaf: Leaf) {
  return {
    id: leaf.id,
    commit_hash: leaf.commit_hash,
    type: leaf.type,
    title: leaf.title ?? null,
    constraints: leaf.constraints ?? [],
    config: leaf.config ?? {},
    output: leaf.output ?? null,
    generated_at: leaf.generated_at ?? null,
    assertions: leaf.assertions ?? null,
    project_id: leaf.project_id,
    created_at: leaf.created_at,
    created_by: leaf.created_by ?? null,
  };
}

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
  description: 'Lists all leaf nodes associated with a specific commit.',
  request: {
    params: z.object({
      hash: z.string().min(1),
    }),
  },
  responses: {
    200: {
      description: 'List of leaves',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.array(LeafResponse)),
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
  description: 'Lists all leaf nodes in a project.',
  request: {
    params: z.object({
      projectId: z.string().min(1),
    }),
    query: z.object({
      type: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(1000).default(100),
      offset: z.coerce.number().int().min(0).default(0),
    }),
  },
  responses: {
    200: {
      description: 'List of leaves',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.array(LeafResponse)),
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
  description: 'Updates a leaf node (title, constraints, config).',
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
leavesRoutes.openapi(createLeafRoute, async (c) => {
  const body = c.req.valid('json');

  try {
    const db = await getDB();

    // Create leaf in database (storage generates IDs for leaf and constraints)
    const leaf = await createLeaf(db, {
      commit_hash: body.commit_hash,
      type: body.type,
      title: body.title,
      constraints: body.constraints,
      config: body.config ?? {},
      project_id: body.project_id,
    });

    return c.json({ success: true as const, data: toApiLeaf(leaf) }, 201);
  } catch (err) {
    // Handle PostgreSQL foreign key violation (commit or project not found)
    if (err instanceof Error && 'code' in err && (err as { code: string }).code === '23503') {
      return c.json(
        {
          success: false as const,
          error: { code: 'REFERENCE_NOT_FOUND', message: 'Referenced commit or project not found' },
        },
        404
      );
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ success: false as const, error: { code: 'CREATE_FAILED', message } }, 500);
  }
});

// GET /v1/leaves/:id - Get leaf by ID
leavesRoutes.openapi(getLeafRoute, async (c) => {
  const { id } = c.req.valid('param');

  try {
    const db = await getDB();
    const leaf = await findLeafById(db, id);

    if (!leaf) {
      return c.json(
        {
          success: false as const,
          error: { code: 'NOT_FOUND', message: `Leaf ${id} not found` },
        },
        404
      );
    }

    return c.json({ success: true as const, data: toApiLeaf(leaf) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ success: false as const, error: { code: 'GET_FAILED', message } }, 500);
  }
});

// GET /v1/commits/:hash/leaves - List leaves by commit
leavesRoutes.openapi(listLeavesByCommitRoute, async (c) => {
  const { hash } = c.req.valid('param');
  const decodedHash = decodeURIComponent(hash);

  try {
    const db = await getDB();
    const leaves = await findLeavesByCommit(db, decodedHash);

    return c.json({ success: true as const, data: leaves.map(toApiLeaf) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ success: false as const, error: { code: 'LIST_FAILED', message } }, 500);
  }
});

// GET /v1/projects/:projectId/leaves - List leaves by project
leavesRoutes.openapi(listLeavesByProjectRoute, async (c) => {
  const { projectId } = c.req.valid('param');
  const { type: _type, limit, offset } = c.req.valid('query');

  try {
    const db = await getDB();
    // Note: type filtering not yet supported by storage, using limit/offset only
    const leaves = await findLeavesByProject(db, projectId, { limit, offset });

    return c.json({ success: true as const, data: leaves.map(toApiLeaf) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ success: false as const, error: { code: 'LIST_FAILED', message } }, 500);
  }
});

// PATCH /v1/leaves/:id - Update leaf
leavesRoutes.openapi(updateLeafRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');

  try {
    const db = await getDB();

    // Storage handles constraint ID generation
    const leaf = await updateLeaf(db, id, {
      title: body.title,
      constraints: body.constraints,
      config: body.config,
    });

    if (!leaf) {
      return c.json(
        {
          success: false as const,
          error: { code: 'NOT_FOUND', message: `Leaf ${id} not found` },
        },
        404
      );
    }

    return c.json({ success: true as const, data: toApiLeaf(leaf) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ success: false as const, error: { code: 'UPDATE_FAILED', message } }, 500);
  }
});

// DELETE /v1/leaves/:id - Delete leaf
leavesRoutes.openapi(deleteLeafRoute, async (c) => {
  const { id } = c.req.valid('param');

  try {
    const db = await getDB();

    // First, get the leaf to find its project_id for pin cleanup
    const leaf = await findLeafById(db, id);
    if (!leaf) {
      return c.json(
        {
          success: false as const,
          error: { code: 'NOT_FOUND', message: `Leaf ${id} not found` },
        },
        404
      );
    }

    // Delete the leaf
    const deleted = await deleteLeaf(db, id);

    if (!deleted) {
      return c.json(
        {
          success: false as const,
          error: { code: 'NOT_FOUND', message: `Leaf ${id} not found` },
        },
        404
      );
    }

    // Clean up associated pins (leaf pins that reference this leaf)
    await deletePinByRef(db, leaf.project_id, 'leaf', id);

    return c.json({ success: true as const, data: { deleted: true as const, id } }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ success: false as const, error: { code: 'DELETE_FAILED', message } }, 500);
  }
});

export default leavesRoutes;
