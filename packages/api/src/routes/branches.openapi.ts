/**
 * Branches Routes
 *
 * GET  /v1/branches         - List branches (requires project_id query)
 * POST /v1/branches         - Create branch
 * GET  /v1/branches/current - Get current branch
 * POST /v1/branches/switch  - Switch current branch
 * PUT  /v1/branches/rules   - Update a branch's rules
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { ApiKey } from '@t3x-dev/core';
import {
  type AnyDB,
  bindTransitionPolicy,
  DraftAuthoringConflictError,
  ensureMainBranch,
  findBranchByName,
  findBranchesByProject,
  findCurrentBranch,
  getTransitionPolicyBinding,
  listTransitionPolicyBindings,
  NotFoundError,
  switchBranch,
  type TransitionPolicyBinding,
  unbindTransitionPolicy,
} from '@t3x-dev/storage';
import type { Context } from 'hono';
import { createBranchWorkspace } from '../lib/branch-workspace';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertProjectAccess } from '../lib/project-access';
import { deriveTrustedTransitionPrincipal } from '../lib/transition-authority';
import {
  branchRulesFromBinding,
  planBranchRuleChange,
} from '../lib/transition-control-plane/applicable-policy';
import {
  CursorPageResponseSchema,
  ErrorResponseSchema,
  SuccessResponseSchema,
} from '../schemas/common';

export const branchRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });

// ============================================================
// Shared schema
// ============================================================

const BranchRulesResponse = z
  .object({
    commit: z.object({
      require_independent_review: z.boolean(),
      source: z.enum(['default', 'preset', 'custom']),
    }),
  })
  .openapi('BranchRules');

const BranchResponse = z.object({
  branch_id: z.string(),
  project_id: z.string(),
  name: z.string(),
  parent_branch: z.string().nullable(),
  head_commit_hash: z.string().nullable(),
  description: z.string().nullable(),
  is_current: z.boolean(),
  rules: BranchRulesResponse,
  created_at: z.string(),
  updated_at: z.string(),
});

type BranchRow = {
  branchId: string;
  projectId: string;
  name: string;
  parentBranch: string | null;
  headCommitHash: string | null;
  description: string | null;
  isCurrent: number;
  createdAt: Date;
  updatedAt: Date;
};

const toApiBranch = (b: BranchRow, binding: TransitionPolicyBinding | null) => {
  const rules = branchRulesFromBinding(binding);
  return {
    branch_id: b.branchId,
    project_id: b.projectId,
    name: b.name,
    parent_branch: b.parentBranch,
    head_commit_hash: b.headCommitHash,
    description: b.description,
    is_current: b.isCurrent === 1,
    rules: {
      commit: {
        require_independent_review: rules.commit.requireIndependentReview,
        source: rules.commit.source,
      },
    },
    created_at: b.createdAt.toISOString(),
    updated_at: b.updatedAt.toISOString(),
  };
};

async function withRules(db: AnyDB, branch: BranchRow) {
  return toApiBranch(branch, await getTransitionPolicyBinding(db, branch.projectId, branch.name));
}

async function listWithRules(db: AnyDB, projectId: string, branchList: BranchRow[]) {
  const bindings = new Map(
    (await listTransitionPolicyBindings(db, projectId)).map((binding) => [binding.refName, binding])
  );
  return branchList.map((branch) => toApiBranch(branch, bindings.get(branch.name) ?? null));
}

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
    200: {
      description: 'Matching branch already exists',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(BranchResponse),
        },
      },
    },
    201: {
      description: 'Branch created successfully',
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
      description: 'Project not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Existing branch does not match the requested parent',
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
  description:
    'Switches the active branch for a project. Optionally creates the branch if it does not exist.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            project_id: z.string().min(1),
            branch_name: z.string().min(1),
            create_if_missing: z.boolean().optional(),
            parent_branch: z.string().min(1).optional(),
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

    await ensureMainBranch(db, projectId);

    // Cursor-based pagination mode
    if (cursor !== undefined) {
      const result = await findBranchesByProject(db, { projectId, cursor, limit });
      return c.json(
        {
          success: true as const,
          data: {
            items: await listWithRules(db, projectId, result.items),
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
          branches: await listWithRules(db, projectId, branchList),
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

    const existing = await findBranchByName(db, body.project_id, body.name);
    if (existing) {
      if (branchMatchesCreateIntent(existing, body.parent_branch ?? null)) {
        return c.json({ success: true as const, data: await withRules(db, existing) }, 200);
      }
      return errorResponse(
        c,
        'CONFLICT',
        `Branch ${body.name} already exists with a different parent`
      );
    }

    try {
      const branch = await createBranchWorkspace(db, {
        projectId: body.project_id,
        name: body.name,
        parentBranch: body.parent_branch,
        description: body.description,
      });

      return c.json({ success: true as const, data: await withRules(db, branch) }, 201);
    } catch (err) {
      const concurrent = await findBranchByName(db, body.project_id, body.name);
      if (concurrent) {
        if (branchMatchesCreateIntent(concurrent, body.parent_branch ?? null)) {
          return c.json({ success: true as const, data: await withRules(db, concurrent) }, 200);
        }
        return errorResponse(
          c,
          'CONFLICT',
          `Branch ${body.name} already exists with a different parent`
        );
      }
      throw err;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (err instanceof NotFoundError) return errorResponse(c, 'NOT_FOUND', message);
    if (err instanceof DraftAuthoringConflictError) return errorResponse(c, 'CONFLICT', message);
    return errorResponse(c, 'CREATE_FAILED', message);
  }
});

function branchMatchesCreateIntent(
  branch: { parentBranch: string | null },
  parentBranch: string | null
): boolean {
  return branch.parentBranch === parentBranch;
}

// GET /v1/branches/current - Get current branch
branchRoutes.openapi(getCurrentBranchRoute, async (c) => {
  const { project_id: projectId } = c.req.valid('query');

  try {
    const db = await getDB();

    const accessResult = await assertProjectAccess(c, db, projectId);
    if (accessResult instanceof Response) return accessResult;

    let branch = await findCurrentBranch(db, projectId);

    if (!branch) {
      await ensureMainBranch(db, projectId);
      branch = await switchBranch(db, projectId, 'main');
    }

    if (!branch) {
      return errorResponse(c, 'NOT_FOUND', 'No current branch set');
    }

    return c.json({ success: true as const, data: await withRules(db, branch) }, 200);
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

    if (!branch && body.branch_name === 'main') {
      branch = await ensureMainBranch(db, body.project_id);
    }

    if (!branch) {
      if (body.create_if_missing) {
        branch = await createBranchWorkspace(db, {
          projectId: body.project_id,
          name: body.branch_name,
          parentBranch: body.parent_branch,
        });
      } else {
        return errorResponse(c, 'NOT_FOUND', `Branch ${body.branch_name} not found`);
      }
    }

    const switched = await switchBranch(db, body.project_id, body.branch_name);
    if (!switched) {
      return errorResponse(c, 'UPDATE_FAILED', 'Failed to switch branch');
    }

    return c.json({ success: true as const, data: await withRules(db, switched) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (err instanceof NotFoundError) return errorResponse(c, 'NOT_FOUND', message);
    if (err instanceof DraftAuthoringConflictError) return errorResponse(c, 'CONFLICT', message);
    return errorResponse(c, 'UPDATE_FAILED', message);
  }
});

// PUT /v1/branches/rules - Update a branch's rules
const updateBranchRulesRoute = createRoute({
  method: 'put',
  path: '/v1/branches/rules',
  tags: ['Branches'],
  summary: 'Update branch rules',
  description:
    'Updates the rules of an existing branch. Omitted rule kinds are left unchanged. Requires a human principal.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z
            .object({
              project_id: z.string().min(1),
              branch_name: z.string().min(1),
              rules: z
                .object({
                  commit: z.object({ require_independent_review: z.boolean() }).strict().optional(),
                })
                .strict(),
            })
            .strict(),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Branch with updated rules',
      content: { 'application/json': { schema: SuccessResponseSchema(BranchResponse) } },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: {
      description: 'Forbidden',
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

function authenticatedApiKey(c: Context): ApiKey | undefined {
  return c.get('apiKey') as ApiKey | undefined;
}

branchRoutes.openapi(updateBranchRulesRoute, async (c) => {
  const apiKey = authenticatedApiKey(c);
  if (apiKey !== undefined && apiKey.principal_kind !== 'human') {
    return errorResponse(c, 'FORBIDDEN', 'Branch rules require a human principal');
  }
  const body = c.req.valid('json');

  try {
    const db = await getDB();

    const accessResult = await assertProjectAccess(c, db, body.project_id);
    if (accessResult instanceof Response) return accessResult;

    const branch = await findBranchByName(db, body.project_id, body.branch_name);
    if (!branch) {
      return errorResponse(c, 'NOT_FOUND', `Branch ${body.branch_name} not found`);
    }

    let binding = await getTransitionPolicyBinding(db, body.project_id, body.branch_name);
    if (body.rules.commit !== undefined) {
      const change = planBranchRuleChange({
        refName: body.branch_name,
        binding,
        requireIndependentReview: body.rules.commit.require_independent_review,
      });
      if (change.action === 'unbind') {
        await unbindTransitionPolicy(db, body.project_id, body.branch_name);
        binding = null;
      } else if (change.action === 'bind') {
        binding = await bindTransitionPolicy(db, {
          projectId: body.project_id,
          refName: body.branch_name,
          uri: change.uri,
          policy: change.policy,
          actor: deriveTrustedTransitionPrincipal(apiKey).actor,
        });
      }
    }

    return c.json({ success: true as const, data: toApiBranch(branch, binding) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'UPDATE_FAILED', message);
  }
});
