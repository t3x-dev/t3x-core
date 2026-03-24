/**
 * Branches Routes
 *
 * GET  /v1/branches         - List branches (requires project_id query)
 * POST /v1/branches         - Create branch
 * GET  /v1/branches/current - Get current branch
 * POST /v1/branches/switch  - Switch current branch
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  findBranchByName,
  findBranchesByProject,
  findCurrentBranch,
  insertBranch,
  switchBranch,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertProjectAccess } from '../lib/project-access';
import {
  CursorPageResponseSchema,
  ErrorResponseSchema,
  SuccessResponseSchema,
} from '../schemas/common';

export const branchRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });

// ============================================================
// Shared schema
// ============================================================

const BranchResponse = z.object({
  branch_id: z.string(),
  project_id: z.string(),
  name: z.string(),
  parent_branch: z.string().nullable(),
  head_commit_hash: z.string().nullable(),
  description: z.string().nullable(),
  is_current: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

const toApiBranch = (b: {
  branchId: string;
  projectId: string;
  name: string;
  parentBranch: string | null;
  headCommitHash: string | null;
  description: string | null;
  isCurrent: number;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  branch_id: b.branchId,
  project_id: b.projectId,
  name: b.name,
  parent_branch: b.parentBranch,
  head_commit_hash: b.headCommitHash,
  description: b.description,
  is_current: b.isCurrent === 1,
  created_at: b.createdAt.toISOString(),
  updated_at: b.updatedAt.toISOString(),
});

// ============================================================
// Route Definitions
// ============================================================

// GET /v1/branches - List branches
const listBranchesRoute = createRoute({
  method: 'get',
  path: '/v1/branches',
  tags: ['Branches'],
  summary: 'List branches',
  description:
    'Lists branches for a project. Supports cursor-based pagination via optional `cursor` query parameter, or legacy offset/limit mode.',
  request: {
    query: z.object({
      project_id: z.string().min(1),
      limit: z.coerce.number().int().min(1).max(1000).default(100),
      offset: z.coerce.number().int().min(0).default(0),
      cursor: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: 'List of branches',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.union([
              CursorPageResponseSchema(BranchResponse),
              z.object({
                branches: z.array(BranchResponse),
                project_id: z.string(),
                limit: z.number(),
                offset: z.number(),
              }),
            ])
          ),
        },
      },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// POST /v1/branches - Create branch
const createBranchRoute = createRoute({
  method: 'post',
  path: '/v1/branches',
  tags: ['Branches'],
  summary: 'Create branch',
  description: 'Creates a new branch for a project.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            project_id: z.string().min(1),
            name: z.string().min(1),
            parent_branch: z.string().optional(),
            description: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Branch created successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(BranchResponse),
        },
      },
    },
    400: {
      description: 'Invalid request or duplicate branch name',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Project not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// GET /v1/branches/current - Get current branch
const getCurrentBranchRoute = createRoute({
  method: 'get',
  path: '/v1/branches/current',
  tags: ['Branches'],
  summary: 'Get current branch',
  description: 'Returns the currently active branch for a project.',
  request: {
    query: z.object({
      project_id: z.string().min(1),
    }),
  },
  responses: {
    200: {
      description: 'Current branch',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(BranchResponse),
        },
      },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'No current branch set',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// POST /v1/branches/switch - Switch current branch
const switchBranchRoute = createRoute({
  method: 'post',
  path: '/v1/branches/switch',
  tags: ['Branches'],
  summary: 'Switch branch',
  description: 'Switches the active branch for a project. Optionally creates the branch if it does not exist.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            project_id: z.string().min(1),
            branch_name: z.string().min(1),
            create_if_missing: z.boolean().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Switched to branch successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(BranchResponse),
        },
      },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Branch not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// ============================================================
// Route Handlers
// ============================================================

// GET /v1/branches - List branches
branchRoutes.openapi(listBranchesRoute, async (c) => {
  const { project_id: projectId, limit, offset, cursor } = c.req.valid('query');

  try {
    const db = await getDB();

    const accessResult = await assertProjectAccess(c, db, projectId);
    if (accessResult instanceof Response) return accessResult;

    // Cursor-based pagination mode
    if (cursor !== undefined) {
      const result = await findBranchesByProject(db, { projectId, cursor, limit });
      return c.json(
        {
          success: true as const,
          data: {
            items: result.items.map(toApiBranch),
            next_cursor: result.next_cursor,
            has_more: result.has_more,
          },
        },
        200
      );
    }

    // Legacy offset/limit mode
    const branchList = await findBranchesByProject(db, { projectId, limit, offset });
    return c.json(
      {
        success: true as const,
        data: {
          branches: branchList.map(toApiBranch),
          project_id: projectId,
          limit,
          offset,
        },
      },
      200
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'LIST_FAILED', message);
  }
});

// POST /v1/branches - Create branch
branchRoutes.openapi(createBranchRoute, async (c) => {
  const body = c.req.valid('json');

  try {
    const db = await getDB();

    const accessResult = await assertProjectAccess(c, db, body.project_id);
    if (accessResult instanceof Response) return accessResult;

    // Check if branch already exists
    const existing = await findBranchByName(db, body.project_id, body.name);
    if (existing) {
      return errorResponse(c, 'CONFLICT', `Branch ${body.name} already exists`);
    }

    const branch = await insertBranch(db, {
      projectId: body.project_id,
      name: body.name,
      parentBranch: body.parent_branch,
      description: body.description,
    });

    return c.json({ success: true as const, data: toApiBranch(branch) }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'CREATE_FAILED', message);
  }
});

// GET /v1/branches/current - Get current branch
branchRoutes.openapi(getCurrentBranchRoute, async (c) => {
  const { project_id: projectId } = c.req.valid('query');

  try {
    const db = await getDB();

    const accessResult = await assertProjectAccess(c, db, projectId);
    if (accessResult instanceof Response) return accessResult;

    const branch = await findCurrentBranch(db, projectId);

    if (!branch) {
      return errorResponse(c, 'NOT_FOUND', 'No current branch set');
    }

    return c.json({ success: true as const, data: toApiBranch(branch) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'GET_FAILED', message);
  }
});

// POST /v1/branches/switch - Switch current branch
branchRoutes.openapi(switchBranchRoute, async (c) => {
  const body = c.req.valid('json');

  try {
    const db = await getDB();

    const accessResult = await assertProjectAccess(c, db, body.project_id);
    if (accessResult instanceof Response) return accessResult;

    // Check if branch exists
    let branch = await findBranchByName(db, body.project_id, body.branch_name);

    if (!branch) {
      if (body.create_if_missing) {
        branch = await insertBranch(db, {
          projectId: body.project_id,
          name: body.branch_name,
        });
      } else {
        return errorResponse(c, 'NOT_FOUND', `Branch ${body.branch_name} not found`);
      }
    }

    const switched = await switchBranch(db, body.project_id, body.branch_name);
    if (!switched) {
      return errorResponse(c, 'UPDATE_FAILED', 'Failed to switch branch');
    }

    return c.json({ success: true as const, data: toApiBranch(switched) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'UPDATE_FAILED', message);
  }
});
