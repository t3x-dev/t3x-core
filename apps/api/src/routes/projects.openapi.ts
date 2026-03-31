/**
 * Projects Routes with OpenAPI
 */
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { getModelInfo } from '@t3x-dev/core';
import {
  branches,
  commits,
  conversations,
  deleteProject,
  findProjectByIdIncludingDeleted,
  findProjects,
  findProjectWithStats,
  getBusinessRules,
  insertProject,
  permanentDeleteProject,
  putBusinessRules,
  restoreProject,
  updateProject,
  verifyHashChain,
} from '@t3x-dev/storage';
import { eq, sql } from 'drizzle-orm';
import { getDB } from '../lib/db';
import { assertProjectAccess, getUserId } from '../lib/project-access';
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
        .from(commits)
        .where(eq(commits.projectId, p.projectId))
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
    const userId = getUserId(c);

    // Cursor-based pagination mode
    if (cursor !== undefined) {
      const result = await findProjects(db, { cursor, limit, owner_id: userId });
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
    const projects = await findProjects(db, { limit, offset, owner_id: userId });

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
    const userId = getUserId(c);
    const project = await insertProject(db, {
      name: body.name,
      metadata: body.metadata,
      ownerId: userId,
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

// @ts-expect-error - OpenAPI handler return type
projectRoutes.openapi(getProjectRoute, async (c) => {
  const { id } = c.req.valid('param');

  try {
    const db = await getDB();

    // Access control check
    const accessResult = await assertProjectAccess(c, db, id);
    if (accessResult instanceof Response) return accessResult;

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

    // Count commits for this project
    const [commitCountRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(commits)
      .where(eq(commits.projectId, id));
    const commitsCount = Number(commitCountRow?.count ?? 0);

    const apiProject = {
      project_id: project.projectId,
      name: project.name,
      created_at: project.createdAt.toISOString(),
      metadata: project.metadataJson ? JSON.parse(project.metadataJson) : null,
      provider_config: project.providerConfig ? JSON.parse(project.providerConfig) : null,
      conversations_count: project.stats.conversationsCount,
      turns_count: project.stats.turnsCount,
      commits_count: commitsCount || project.stats.commitsCount,
      branches_count: project.stats.branchesCount,
      drafts_count: project.stats.draftsCount,
      extraction_style: project.extractionStyle ?? null,
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
    400: {
      description: 'Invalid request (e.g., unknown model)',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
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

// @ts-expect-error - OpenAPI handler return type
projectRoutes.openapi(updateProjectRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');

  try {
    const db = await getDB();

    // Access control check
    const accessResult = await assertProjectAccess(c, db, id);
    if (accessResult instanceof Response) return accessResult;

    // Validate default_model against catalog if provided
    if (body.default_model != null && !getModelInfo(body.default_model)) {
      return c.json(
        {
          success: false as const,
          error: { code: 'INVALID_MODEL', message: `Unknown model: ${body.default_model}` },
        },
        400
      );
    }

    const project = await updateProject(db, id, {
      name: body.name,
      metadata: body.metadata,
      providerConfig:
        body.provider_config === undefined
          ? undefined
          : body.provider_config === null
            ? null
            : JSON.stringify(body.provider_config),
      defaultProvider: body.default_provider,
      defaultModel: body.default_model,
      extractionStyle: body.extraction_style,
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
      default_provider: project.defaultProvider ?? null,
      default_model: project.defaultModel ?? null,
      extraction_style: project.extractionStyle ?? null,
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
  description: 'Soft-deletes a project by default. Use ?permanent=true for irreversible hard deletion.',
  request: {
    params: IdParamSchema,
    query: z.object({
      permanent: z.string().optional(),
    }),
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

// @ts-expect-error - OpenAPI handler return type
projectRoutes.openapi(deleteProjectRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { permanent } = c.req.valid('query');

  try {
    const db = await getDB();

    if (permanent === 'true') {
      // Permanent delete: find even soft-deleted projects
      const project = await findProjectByIdIncludingDeleted(db, id);
      if (!project) {
        return c.json(
          { success: false as const, error: { code: 'NOT_FOUND', message: `Project ${id} not found` } },
          404
        );
      }

      // Access control on the actual project row
      const apiKey = c.get('apiKey') as import('@t3x-dev/core').ApiKey | undefined;
      const userId = apiKey?.user_id;
      if (userId && project.ownerId && project.ownerId !== userId) {
        return c.json(
          { success: false as const, error: { code: 'FORBIDDEN', message: 'Access denied' } },
          403
        );
      }

      const deleted = await permanentDeleteProject(db, id);
      if (!deleted) {
        return c.json(
          { success: false as const, error: { code: 'NOT_FOUND', message: `Project ${id} not found` } },
          404
        );
      }
    } else {
      // Soft delete
      const accessResult = await assertProjectAccess(c, db, id);
      if (accessResult instanceof Response) return accessResult;

      const deleted = await deleteProject(db, id);
      if (!deleted) {
        return c.json(
          { success: false as const, error: { code: 'NOT_FOUND', message: `Project ${id} not found` } },
          404
        );
      }
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

// Restore project route
const restoreProjectRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{id}/restore',
  tags: ['Projects'],
  summary: 'Restore a soft-deleted project',
  request: {
    params: IdParamSchema,
  },
  responses: {
    200: {
      description: 'Project restored',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(ProjectSchema),
        },
      },
    },
    404: {
      description: 'Project not found or not deleted',
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

// @ts-expect-error - OpenAPI handler return type
projectRoutes.openapi(restoreProjectRoute, async (c) => {
  const { id } = c.req.valid('param');

  try {
    const db = await getDB();

    // Access control: must check against the deleted row
    const project = await findProjectByIdIncludingDeleted(db, id);
    if (!project) {
      return c.json(
        { success: false as const, error: { code: 'NOT_FOUND', message: `Project ${id} not found` } },
        404
      );
    }

    const apiKey = c.get('apiKey') as import('@t3x-dev/core').ApiKey | undefined;
    const userId = apiKey?.user_id;
    if (userId && project.ownerId && project.ownerId !== userId) {
      return c.json(
        { success: false as const, error: { code: 'FORBIDDEN', message: 'Access denied' } },
        403
      );
    }

    const restored = await restoreProject(db, id);
    if (!restored) {
      return c.json(
        { success: false as const, error: { code: 'NOT_FOUND', message: `Project ${id} not found or not deleted` } },
        404
      );
    }

    const apiProject = {
      project_id: restored.projectId,
      name: restored.name,
      created_at: restored.createdAt.toISOString(),
      metadata: restored.metadataJson ? JSON.parse(restored.metadataJson) : null,
    };

    return c.json({ success: true as const, data: apiProject }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ success: false as const, error: { code: 'RESTORE_FAILED', message } }, 500);
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

// @ts-expect-error - OpenAPI handler return type
projectRoutes.openapi(verifyProjectRoute, async (c) => {
  const { id } = c.req.valid('param');

  try {
    const db = await getDB();

    // Access control check
    const accessResult = await assertProjectAccess(c, db, id);
    if (accessResult instanceof Response) return accessResult;

    const result = await verifyHashChain(db, id);

    return c.json({ success: true as const, data: result }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ success: false as const, error: { code: 'VERIFY_FAILED', message } }, 500);
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

// @ts-expect-error - OpenAPI handler return type
projectRoutes.openapi(getBusinessRulesRoute, async (c) => {
  const { id } = c.req.valid('param');
  try {
    const db = await getDB();

    // Access control check
    const accessResult = await assertProjectAccess(c, db, id);
    if (accessResult instanceof Response) return accessResult;

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

// @ts-expect-error - OpenAPI handler return type
projectRoutes.openapi(putBusinessRulesRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { rules } = c.req.valid('json');
  try {
    const db = await getDB();

    // Access control check
    const accessResult = await assertProjectAccess(c, db, id);
    if (accessResult instanceof Response) return accessResult;

    const updated = await putBusinessRules(db, id, rules);
    return c.json({ success: true as const, data: { rules: updated } }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ success: false as const, error: { code: 'PUT_RULES_FAILED', message } }, 500);
  }
});
