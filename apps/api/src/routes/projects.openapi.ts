/**
 * Projects Routes with OpenAPI
 */
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  backfillMerkleRoots,
  branches,
  commitsV4,
  conversations,
  deleteProject,
  findProjects,
  findProjectWithStats,
  getBusinessRules,
  insertProject,
  putBusinessRules,
  updateProject,
  verifyHashChain,
  verifyMerkleRoots,
} from '@t3x-dev/storage/pglite';
import { eq, sql } from 'drizzle-orm';
import { getDB } from '../lib/db';
import {
  CursorPageResponseSchema,
  ErrorResponseSchema,
  IdParamSchema,
  PaginationQuerySchema,
  SuccessResponseSchema,
} from '../schemas/common';
import {
  CreateProjectSchema,
  ListProjectsResponseSchema,
  ProjectSchema,
  ProjectWithStatsSchema,
  UpdateProjectSchema,
} from '../schemas/projects';

export const projectRoutes = new OpenAPIHono();

// List projects route
const listProjectsRoute = createRoute({
  method: 'get',
  path: '/v1/projects',
  tags: ['Projects'],
  summary: 'List all projects',
  description:
    'Lists all projects. Supports cursor-based pagination via optional `cursor` query parameter.',
  request: {
    query: PaginationQuerySchema.extend({
      cursor: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: 'List of projects',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.union([CursorPageResponseSchema(ProjectSchema), ListProjectsResponseSchema])
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

projectRoutes.openapi(listProjectsRoute, async (c) => {
  const { limit, offset, cursor } = c.req.valid('query');

  // Shared helper: enrich a project row with counts
  const enrichProject = async (
    db: Awaited<ReturnType<typeof getDB>>,
    p: { projectId: string; name: string; createdAt: Date; metadataJson: string | null }
  ) => {
    const [convCountRow, commitCountRow, branchCountRow] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(conversations)
        .where(eq(conversations.projectId, p.projectId))
        .then((rows) => rows[0]),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(commitsV4)
        .where(eq(commitsV4.projectId, p.projectId))
        .then((rows) => rows[0]),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(branches)
        .where(eq(branches.projectId, p.projectId))
        .then((rows) => rows[0]),
    ]);
    return {
      project_id: p.projectId,
      name: p.name,
      created_at: p.createdAt.toISOString(),
      metadata: p.metadataJson ? JSON.parse(p.metadataJson) : null,
      conversations_count: Number(convCountRow?.count ?? 0),
      commits_count: Number(commitCountRow?.count ?? 0),
      branches_count: Number(branchCountRow?.count ?? 0),
    };
  };

  try {
    const db = await getDB();

    // Cursor-based pagination mode
    if (cursor !== undefined) {
      const result = await findProjects(db, { cursor, limit });
      const apiProjects = await Promise.all(result.items.map((p) => enrichProject(db, p)));
      return c.json(
        {
          success: true as const,
          data: {
            items: apiProjects,
            next_cursor: result.next_cursor,
            has_more: result.has_more,
          },
        },
        200
      );
    }

    // Legacy offset/limit mode
    const projects = await findProjects(db, { limit, offset });

    // Enrich each project with counts using COUNT queries (avoid N+1 full-table fetches)
    const apiProjects = await Promise.all(projects.map((p) => enrichProject(db, p)));

    return c.json({ success: true as const, data: { projects: apiProjects, limit, offset } }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ success: false as const, error: { code: 'LIST_FAILED', message } }, 500);
  }
});

// Create project route
const createProjectRoute = createRoute({
  method: 'post',
  path: '/v1/projects',
  tags: ['Projects'],
  summary: 'Create a new project',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateProjectSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Project created',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(ProjectSchema),
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

projectRoutes.openapi(createProjectRoute, async (c) => {
  const body = c.req.valid('json');

  try {
    const db = await getDB();
    const project = await insertProject(db, {
      name: body.name,
      metadata: body.metadata,
    });

    const apiProject = {
      project_id: project.projectId,
      name: project.name,
      created_at: project.createdAt.toISOString(),
      metadata: project.metadataJson ? JSON.parse(project.metadataJson) : null,
    };

    return c.json({ success: true as const, data: apiProject }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ success: false as const, error: { code: 'CREATE_FAILED', message } }, 500);
  }
});

// Get project by ID route
const getProjectRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{id}',
  tags: ['Projects'],
  summary: 'Get project by ID with stats',
  request: {
    params: IdParamSchema,
  },
  responses: {
    200: {
      description: 'Project details',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(ProjectWithStatsSchema),
        },
      },
    },
    404: {
      description: 'Project not found',
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

projectRoutes.openapi(getProjectRoute, async (c) => {
  const { id } = c.req.valid('param');

  try {
    const db = await getDB();
    const project = await findProjectWithStats(db, id);

    if (!project) {
      return c.json(
        {
          success: false as const,
          error: { code: 'NOT_FOUND', message: `Project ${id} not found` },
        },
        404
      );
    }

    // Use COUNT(*) query for v4 commits — same pattern as list endpoint
    const [v4CommitCountRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(commitsV4)
      .where(eq(commitsV4.projectId, id));
    const v4CommitsCount = Number(v4CommitCountRow?.count ?? 0);

    const apiProject = {
      project_id: project.projectId,
      name: project.name,
      created_at: project.createdAt.toISOString(),
      metadata: project.metadataJson ? JSON.parse(project.metadataJson) : null,
      provider_config: project.providerConfig ? JSON.parse(project.providerConfig) : null,
      conversations_count: project.stats.conversationsCount,
      turns_count: project.stats.turnsCount,
      commits_count: v4CommitsCount || project.stats.commitsCount,
      branches_count: project.stats.branchesCount,
      drafts_count: project.stats.draftsCount,
    };

    return c.json({ success: true as const, data: apiProject }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ success: false as const, error: { code: 'GET_FAILED', message } }, 500);
  }
});

// Update project route
const updateProjectRoute = createRoute({
  method: 'put',
  path: '/v1/projects/{id}',
  tags: ['Projects'],
  summary: 'Update a project',
  request: {
    params: IdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: UpdateProjectSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Project updated',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(ProjectSchema),
        },
      },
    },
    404: {
      description: 'Project not found',
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

projectRoutes.openapi(updateProjectRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');

  try {
    const db = await getDB();
    const project = await updateProject(db, id, {
      name: body.name,
      metadata: body.metadata,
      providerConfig:
        body.provider_config === undefined
          ? undefined
          : body.provider_config === null
            ? null
            : JSON.stringify(body.provider_config),
    });

    if (!project) {
      return c.json(
        {
          success: false as const,
          error: { code: 'NOT_FOUND', message: `Project ${id} not found` },
        },
        404
      );
    }

    const apiProject = {
      project_id: project.projectId,
      name: project.name,
      created_at: project.createdAt.toISOString(),
      metadata: project.metadataJson ? JSON.parse(project.metadataJson) : null,
      provider_config: project.providerConfig ? JSON.parse(project.providerConfig) : null,
    };

    return c.json({ success: true as const, data: apiProject }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ success: false as const, error: { code: 'UPDATE_FAILED', message } }, 500);
  }
});

// Delete project route
const deleteProjectRoute = createRoute({
  method: 'delete',
  path: '/v1/projects/{id}',
  tags: ['Projects'],
  summary: 'Delete a project',
  request: {
    params: IdParamSchema,
  },
  responses: {
    200: {
      description: 'Project deleted',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.object({ deleted: z.literal(true), project_id: z.string() })
          ),
        },
      },
    },
    404: {
      description: 'Project not found',
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

projectRoutes.openapi(deleteProjectRoute, async (c) => {
  const { id } = c.req.valid('param');

  try {
    const db = await getDB();
    const deleted = await deleteProject(db, id);

    if (!deleted) {
      return c.json(
        {
          success: false as const,
          error: { code: 'NOT_FOUND', message: `Project ${id} not found` },
        },
        404
      );
    }

    return c.json(
      { success: true as const, data: { deleted: true as const, project_id: id } },
      200
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ success: false as const, error: { code: 'DELETE_FAILED', message } }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Hash Chain Verification (Upgrade #6)
// ═══════════════════════════════════════════════════════════════════════════

const VerifyChainResultSchema = z.object({
  valid: z.boolean(),
  total: z.number(),
  verified_depth: z.number(),
  entry_points: z.number(),
  errors: z.object({
    hash_mismatch: z.array(z.string()),
    parent_not_found: z.array(z.string()),
    other: z.array(z.string()),
  }),
  merkle_roots: z.record(z.string(), z.string()),
  merkle_mismatches: z.array(z.string()),
  truncated: z.boolean(),
  verified_at: z.string(),
});

const verifyProjectRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/verify',
  tags: ['Projects'],
  summary: 'Verify hash chain integrity for a project',
  request: {
    params: IdParamSchema,
  },
  responses: {
    200: {
      description: 'Verification result',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(VerifyChainResultSchema),
        },
      },
    },
    404: {
      description: 'Project not found',
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

projectRoutes.openapi(verifyProjectRoute, async (c) => {
  const { id } = c.req.valid('param');

  try {
    const db = await getDB();

    // Check project exists
    const project = await findProjectWithStats(db, id);
    if (!project) {
      return c.json(
        {
          success: false as const,
          error: { code: 'NOT_FOUND', message: `Project ${id} not found` },
        },
        404
      );
    }

    const result = await verifyHashChain(db, id);

    return c.json({ success: true as const, data: result }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ success: false as const, error: { code: 'VERIFY_FAILED', message } }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Quick Merkle Verification
// ═══════════════════════════════════════════════════════════════════════════

const QuickVerifyResultSchema = z.object({
  valid: z.boolean(),
  checked: z.number(),
  mismatches: z.array(z.string()),
  missing_roots: z.array(z.string()),
  verified_at: z.string(),
});

const quickVerifyRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/verify/quick',
  tags: ['Projects'],
  summary: 'Quick Merkle root verification for recent commits',
  request: {
    params: IdParamSchema,
  },
  responses: {
    200: {
      description: 'Quick verification result',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(QuickVerifyResultSchema),
        },
      },
    },
    404: {
      description: 'Project not found',
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

projectRoutes.openapi(quickVerifyRoute, async (c) => {
  const { id } = c.req.valid('param');

  try {
    const db = await getDB();

    const project = await findProjectWithStats(db, id);
    if (!project) {
      return c.json(
        {
          success: false as const,
          error: { code: 'NOT_FOUND', message: `Project ${id} not found` },
        },
        404
      );
    }

    const result = await verifyMerkleRoots(db, id);

    return c.json(
      {
        success: true as const,
        data: { ...result, verified_at: new Date().toISOString() },
      },
      200
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json(
      { success: false as const, error: { code: 'QUICK_VERIFY_FAILED', message } },
      500
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Merkle Root Backfill
// ═══════════════════════════════════════════════════════════════════════════

const BackfillResultSchema = z.object({
  updated: z.number(),
  remaining: z.boolean(),
  verified_at: z.string(),
});

const backfillMerkleRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{id}/backfill-merkle',
  tags: ['Projects'],
  summary: 'Backfill merkle roots for commits without one',
  request: {
    params: IdParamSchema,
  },
  responses: {
    200: {
      description: 'Backfill result',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(BackfillResultSchema),
        },
      },
    },
    404: {
      description: 'Project not found',
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

projectRoutes.openapi(backfillMerkleRoute, async (c) => {
  const { id } = c.req.valid('param');

  try {
    const db = await getDB();

    const project = await findProjectWithStats(db, id);
    if (!project) {
      return c.json(
        {
          success: false as const,
          error: { code: 'NOT_FOUND', message: `Project ${id} not found` },
        },
        404
      );
    }

    const result = await backfillMerkleRoots(db, id);

    return c.json(
      {
        success: true as const,
        data: { ...result, verified_at: new Date().toISOString() },
      },
      200
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ success: false as const, error: { code: 'BACKFILL_FAILED', message } }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Business Rules
// ═══════════════════════════════════════════════════════════════════════════

const BusinessRuleSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['rule', 'llm']),
  rule: z.string().optional(),
  prompt: z.string().optional(),
  message: z.string().optional(),
  severity: z.enum(['error', 'warning']),
});

const getBusinessRulesRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/business-rules',
  tags: ['Projects'],
  summary: 'Get project business rules',
  request: {
    params: IdParamSchema,
  },
  responses: {
    200: {
      description: 'Business rules',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.object({ rules: z.array(BusinessRuleSchema) })),
        },
      },
    },
    404: {
      description: 'Project not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

projectRoutes.openapi(getBusinessRulesRoute, async (c) => {
  const { id } = c.req.valid('param');
  try {
    const db = await getDB();
    const project = await findProjectWithStats(db, id);
    if (!project) {
      return c.json(
        {
          success: false as const,
          error: { code: 'NOT_FOUND', message: `Project ${id} not found` },
        },
        404
      );
    }
    const rules = await getBusinessRules(db, id);
    return c.json({ success: true as const, data: { rules } }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ success: false as const, error: { code: 'GET_RULES_FAILED', message } }, 500);
  }
});

const putBusinessRulesRoute = createRoute({
  method: 'put',
  path: '/v1/projects/{id}/business-rules',
  tags: ['Projects'],
  summary: 'Update project business rules',
  request: {
    params: IdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: z.object({ rules: z.array(BusinessRuleSchema) }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Updated business rules',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.object({ rules: z.array(BusinessRuleSchema) })),
        },
      },
    },
    404: {
      description: 'Project not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

projectRoutes.openapi(putBusinessRulesRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { rules } = c.req.valid('json');
  try {
    const db = await getDB();
    const project = await findProjectWithStats(db, id);
    if (!project) {
      return c.json(
        {
          success: false as const,
          error: { code: 'NOT_FOUND', message: `Project ${id} not found` },
        },
        404
      );
    }
    const updated = await putBusinessRules(db, id, rules);
    return c.json({ success: true as const, data: { rules: updated } }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ success: false as const, error: { code: 'PUT_RULES_FAILED', message } }, 500);
  }
});
