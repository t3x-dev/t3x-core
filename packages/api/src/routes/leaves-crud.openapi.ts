import { retiredLeafResponses, retiredLeafWriter } from '../lib/leaf-retirement';
/** Historical Leaf readers; writer routes return HTTP 410 without accessing storage. */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { findLeafById, findLeavesByCommit, findLeavesByProject } from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertProjectAccess, assertRepositoryCommitAccess } from '../lib/project-access';
import {
  CursorPageResponseSchema,
  ErrorResponseSchema,
  IdParamSchema,
  SuccessResponseSchema,
} from '../schemas/common';
import { LeafResponse } from '../schemas/contracts';
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
  summary: 'Retired Leaf writer; use exact State or Commit export',
  deprecated: true,
  responses: retiredLeafResponses,
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
      project_id: z.string().optional(),
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
  summary: 'Retired Leaf writer; use exact State or Commit export',
  deprecated: true,
  responses: retiredLeafResponses,
});

// DELETE /v1/leaves/:id - Delete leaf
const deleteLeafRoute = createRoute({
  method: 'delete',
  path: '/v1/leaves/{id}',
  tags: ['Leaves'],
  summary: 'Retired Leaf writer; use exact State or Commit export',
  deprecated: true,
  responses: retiredLeafResponses,
});

// ============================================================
// Route Handlers
// ============================================================

// POST /v1/leaves - Create leaf
leavesCrudRoutes.openapi(createLeafRoute, retiredLeafWriter);

// GET /v1/leaves/:id - Get leaf by ID
leavesCrudRoutes.openapi(getLeafRoute, async (c) => {
  const { id } = c.req.valid('param');

  try {
    const db = await getDB();
    const leaf = await findLeafById(db, id);

    if (!leaf) {
      return errorResponse(c, 'LEAF_NOT_FOUND', `Leaf not found: ${id}`);
    }
    const accessResult = await assertProjectAccess(c, db, leaf.project_id);
    if (accessResult instanceof Response) return accessResult;

    return c.json({ success: true as const, data: toApiLeaf(leaf) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'GET_FAILED', message);
  }
});

// GET /v1/commits/:hash/leaves - List leaves by commit
leavesCrudRoutes.openapi(listLeavesByCommitRoute, async (c) => {
  const { hash } = c.req.valid('param');
  const { project_id, type, limit, offset, cursor } = c.req.valid('query');
  const decodedHash = decodeURIComponent(hash);

  try {
    const db = await getDB();
    const commitProjectId = await assertRepositoryCommitAccess(c, db, decodedHash, project_id);
    if (commitProjectId instanceof Response) return commitProjectId;

    // Cursor-based pagination mode
    if (cursor !== undefined) {
      const result = await findLeavesByCommit(db, decodedHash, {
        // biome-ignore lint/suspicious/noExplicitAny: generic error handler
        type: type as any,
        projectId: commitProjectId,
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
    const leaves = await findLeavesByCommit(db, decodedHash, {
      // biome-ignore lint/suspicious/noExplicitAny: route accepts forward-compatible leaf types
      type: type as any,
      projectId: commitProjectId,
      limit,
      offset,
    });

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
    const accessResult = await assertProjectAccess(c, db, projectId);
    if (accessResult instanceof Response) return accessResult;

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
leavesCrudRoutes.openapi(updateLeafRoute, retiredLeafWriter);

// DELETE /v1/leaves/:id - Delete leaf
leavesCrudRoutes.openapi(deleteLeafRoute, retiredLeafWriter);
