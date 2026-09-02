/**
 * Projects Routes with OpenAPI
 */
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { DEMO_WORKSPACE_FIXTURE, getCanonicalModelId, getModelInfo } from '@t3x-dev/core';
import {
  branches,
  claimUnownedProjects,
  conversations,
  DEFAULT_ORGANIZATION_NAMESPACE_SLUG,
  deleteProject,
  ensureMainBranch,
  findNamespaceBySlug,
  findPersonalNamespaceByOwner,
  findProjects,
  findProjectWithStats,
  findUnownedProjects,
  getBusinessRules,
  insertProject,
  leaves,
  permanentDeleteProject,
  projects,
  putBusinessRules,
  restoreProject,
  seedDemoWorkspace,
  transitionCommits,
  updateProject,
  verifyHashChain,
} from '@t3x-dev/storage';
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { isAuthenticationDisabled } from '../lib/auth-config';
import { getDB } from '../lib/db';
import { errorResponse } from '../lib/errors';
import { assertNamespaceAccess } from '../lib/namespace-access';
import { hasOperatorAccess } from '../lib/operator-access';
import {
  assertProjectAccess,
  assertProjectAccessIncludingDeleted,
  assertProjectCreationAccess,
  getProjectListAuthority,
  getUserId,
} from '../lib/project-access';
import {
  CursorPageResponseSchema,
  ErrorResponseSchema,
  IdParamSchema,
  PaginationQuerySchema,
  SuccessResponseSchema,
} from '../schemas/common';
import { NamespaceSlugSchema } from '../schemas/namespaces';
import {
  CreateProjectSchema,
  ListProjectsResponseSchema,
  ProjectSchema,
  ProjectWithCountsSchema,
  ProjectWithStatsSchema,
  UpdateProjectSchema,
} from '../schemas/projects';

export const projectRoutes = new OpenAPIHono();

function requireProjectOperator(c: Context): Response | null {
  if (!hasOperatorAccess(c)) {
    return errorResponse(c, 'FORBIDDEN', 'Legacy project recovery requires operator access');
  }
  return null;
}

function isDemoProject(project: { name: string; metadataJson: string | null }) {
  if (!project.metadataJson) return false;
  const metadata = JSON.parse(project.metadataJson) as Record<string, unknown>;
  return (
    metadata.demo_fixture_id === DEMO_WORKSPACE_FIXTURE.id ||
    (metadata.is_demo === true && project.name === DEMO_WORKSPACE_FIXTURE.project.name)
  );
}

function toApiProject(project: {
  projectId: string;
  name: string;
  visibility: 'private' | 'unlisted' | 'public';
  createdAt: Date;
  metadataJson: string | null;
}) {
  return {
    project_id: project.projectId,
    name: project.name,
    visibility: project.visibility,
    created_at: project.createdAt.toISOString(),
    metadata: project.metadataJson ? JSON.parse(project.metadataJson) : null,
  };
}

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
      namespace: NamespaceSlugSchema.optional(),
    }),
  },
  responses: {
    200: {
      description: 'List of projects',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.union([CursorPageResponseSchema(ProjectWithCountsSchema), ListProjectsResponseSchema])
          ),
        },
      },
    },
    403: {
      description: 'Namespace access denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Namespace not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
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
  const { limit, offset, cursor, namespace: namespaceSlug } = c.req.valid('query');

  // Shared helper: enrich a project row with counts
  const enrichProject = async (
    db: Awaited<ReturnType<typeof getDB>>,
    p: {
      projectId: string;
      name: string;
      visibility: 'private' | 'unlisted' | 'public';
      createdAt: Date;
      metadataJson: string | null;
    }
  ) => {
    const [convCountRow, commitCountRow, branchCountRow, outputCountRow] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(conversations)
        .where(eq(conversations.projectId, p.projectId))
        .then((rows) => rows[0]),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(transitionCommits)
        .where(eq(transitionCommits.projectId, p.projectId))
        .then((rows) => rows[0]),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(branches)
        .where(eq(branches.projectId, p.projectId))
        .then((rows) => rows[0]),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(leaves)
        .where(and(eq(leaves.projectId, p.projectId), isNotNull(leaves.generatedAt)))
        .then((rows) => rows[0]),
    ]);
    return {
      project_id: p.projectId,
      name: p.name,
      visibility: p.visibility,
      created_at: p.createdAt.toISOString(),
      metadata: p.metadataJson ? JSON.parse(p.metadataJson) : null,
      conversations_count: Number(convCountRow?.count ?? 0),
      commits_count: Number(commitCountRow?.count ?? 0),
      branches_count: Number(branchCountRow?.count ?? 0),
      outputs_count: Number(outputCountRow?.count ?? 0),
    };
  };

  try {
    const db = await getDB();
    const userId = getUserId(c);
    const authority = getProjectListAuthority(c);
    if (!authority && !isAuthenticationDisabled()) {
      return errorResponse(c, 'FORBIDDEN', 'Project access denied');
    }
    const namespace = namespaceSlug ? await findNamespaceBySlug(db, namespaceSlug) : null;
    if (namespaceSlug && !namespace) {
      return errorResponse(c, 'NOT_FOUND', 'Namespace not found');
    }
    if (namespace) {
      const denied = await assertNamespaceAccess(c, db, namespace, 'namespace:read');
      if (denied) return denied;
    }
    if (!namespaceSlug && !authority) await seedDemoWorkspaceIfEmpty(db, userId);

    // Cursor-based pagination mode
    if (cursor !== undefined) {
      const result = await findProjects(db, {
        cursor,
        limit,
        authority,
        namespace_id: namespace?.namespaceId,
      });
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
    const projects = await findProjects(db, {
      limit,
      offset,
      authority,
      namespace_id: namespace?.namespaceId,
    });

    // Enrich each project with counts using COUNT queries (avoid N+1 full-table fetches)
    const apiProjects = await Promise.all(projects.map((p) => enrichProject(db, p)));

    return c.json({ success: true as const, data: { projects: apiProjects, limit, offset } }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ success: false as const, error: { code: 'LIST_FAILED', message } }, 500);
  }
});

async function seedDemoWorkspaceIfEmpty(
  db: Awaited<ReturnType<typeof getDB>>,
  userId: string | undefined
): Promise<void> {
  const conditions = [isNull(projects.deletedAt)];
  conditions.push(userId ? eq(projects.ownerId, userId) : isNull(projects.ownerId));

  const existing = await db
    .select({ projectId: projects.projectId })
    .from(projects)
    .where(and(...conditions))
    .limit(1);

  if (existing.length === 0) {
    await seedDemoWorkspace(db, { ownerId: userId ?? null });
  }
}

const unownedProjectsResponse = SuccessResponseSchema(
  z.object({ projects: z.array(ProjectSchema) })
);

const listUnownedProjectsRoute = createRoute({
  method: 'get',
  path: '/v1/projects/unowned',
  tags: ['Projects'],
  summary: 'List active legacy projects without an owner',
  description:
    'Operator-only recovery endpoint. Unowned projects are inaccessible to authenticated humans until explicitly claimed.',
  responses: {
    200: {
      description: 'Unowned projects',
      content: { 'application/json': { schema: unownedProjectsResponse } },
    },
    403: {
      description: 'Operator access required',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// @ts-expect-error - OpenAPI handler includes shared operator-denial response
projectRoutes.openapi(listUnownedProjectsRoute, async (c) => {
  const denied = requireProjectOperator(c);
  if (denied) return denied;

  try {
    const db = await getDB();
    const unowned = await findUnownedProjects(db);
    return c.json({ success: true as const, data: { projects: unowned.map(toApiProject) } }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ success: false as const, error: { code: 'LIST_FAILED', message } }, 500);
  }
});

const claimUnownedProjectsRoute = createRoute({
  method: 'post',
  path: '/v1/projects/claim-unowned',
  tags: ['Projects'],
  summary: 'Claim active legacy projects for the current operator',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({ project_ids: z.array(z.string().min(1)).min(1).max(100) }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Projects claimed by the current operator',
      content: { 'application/json': { schema: unownedProjectsResponse } },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: {
      description: 'Operator access required',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

projectRoutes.openapi(claimUnownedProjectsRoute, async (c) => {
  const denied = requireProjectOperator(c);
  if (denied) return denied;

  const userId = getUserId(c);
  if (!userId) {
    return errorResponse(c, 'FORBIDDEN', 'A human operator identity is required to claim projects');
  }

  try {
    const db = await getDB();
    const namespace = await findPersonalNamespaceByOwner(db, userId);
    if (!namespace) {
      return errorResponse(c, 'NOT_FOUND', 'Personal namespace not created yet');
    }
    const claimed = await claimUnownedProjects(
      db,
      userId,
      namespace.namespaceId,
      c.req.valid('json').project_ids
    );
    return c.json({ success: true as const, data: { projects: claimed.map(toApiProject) } }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ success: false as const, error: { code: 'UPDATE_FAILED', message } }, 500);
  }
});

const ensureDemoWorkspaceRoute = createRoute({
  method: 'post',
  path: '/v1/projects/demo-workspace',
  tags: ['Projects'],
  summary: 'Create or return the bundled demo workspace',
  description:
    'Explicitly creates or restores the bundled fixture demo workspace. This is used by the first-run walkthrough and does not run during ordinary project creation.',
  responses: {
    200: {
      description: 'Demo workspace is available',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(ProjectSchema),
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

projectRoutes.openapi(ensureDemoWorkspaceRoute, async (c) => {
  try {
    const db = await getDB();
    const userId = getUserId(c);
    const namespace = userId ? await findPersonalNamespaceByOwner(db, userId) : null;
    if (userId && !namespace) {
      return errorResponse(c, 'NOT_FOUND', 'Personal namespace not created yet');
    }
    if (namespace) {
      const denied = await assertNamespaceAccess(c, db, namespace, 'project:create');
      if (denied) return denied;
    }
    const existingProjects = await findProjects(db, {
      limit: 100,
      ...(userId ? { authority: getProjectListAuthority(c) } : {}),
    });
    const existingDemo = existingProjects.find(isDemoProject);
    if (existingDemo) {
      return c.json({ success: true as const, data: toApiProject(existingDemo) }, 200);
    }

    const result = await seedDemoWorkspace(db, {
      ownerId: userId ?? null,
      namespaceId: namespace?.namespaceId,
      resetDeleted: true,
    });
    if (result.project) {
      return c.json({ success: true as const, data: toApiProject(result.project) }, 200);
    }

    return c.json(
      {
        success: false as const,
        error: {
          code: 'DEMO_SEED_SKIPPED',
          message: 'Demo workspace could not be created. Reset the local demo seed and try again.',
        },
      },
      500
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ success: false as const, error: { code: 'DEMO_SEED_FAILED', message } }, 500);
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
    403: {
      description: 'Machine credentials cannot create projects',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    404: {
      description: 'Namespace not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
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

  const denied = assertProjectCreationAccess(c);
  if (denied) return denied;

  try {
    const db = await getDB();
    const userId = getUserId(c);
    const namespace = body.namespace
      ? await findNamespaceBySlug(db, body.namespace)
      : userId
        ? await findPersonalNamespaceByOwner(db, userId)
        : await findNamespaceBySlug(db, DEFAULT_ORGANIZATION_NAMESPACE_SLUG);
    if (!namespace) {
      return errorResponse(
        c,
        'NOT_FOUND',
        userId ? 'Personal namespace not created yet' : 'Namespace not found'
      );
    }
    const namespaceDenied = await assertNamespaceAccess(c, db, namespace, 'project:create');
    if (namespaceDenied) return namespaceDenied;
    const project = await insertProject(db, {
      name: body.name,
      metadata: body.metadata,
      ownerId: userId,
      namespaceId: namespace.namespaceId,
    });

    // Bootstrap the default 'main' branch so it always exists from day one.
    // Every commit defaults to `branch: 'main'`, so the branches table must
    // reflect that contract from the moment the project is created.
    // `ensureMainBranch` is idempotent, so retries are safe.
    await ensureMainBranch(db, project.projectId);

    const apiProject = {
      project_id: project.projectId,
      name: project.name,
      visibility: project.visibility,
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

    // Count CommitV2 rows for this project
    const [commitCountRow, outputCountRow] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(transitionCommits)
        .where(eq(transitionCommits.projectId, id))
        .then((rows) => rows[0]),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(leaves)
        .where(and(eq(leaves.projectId, id), isNotNull(leaves.generatedAt)))
        .then((rows) => rows[0]),
    ]);
    const commitsCount = Number(commitCountRow?.count ?? 0);
    const outputsCount = Number(outputCountRow?.count ?? 0);

    const apiProject = {
      project_id: project.projectId,
      name: project.name,
      visibility: project.visibility,
      created_at: project.createdAt.toISOString(),
      metadata: project.metadataJson ? JSON.parse(project.metadataJson) : null,
      provider_config: project.providerConfig ? JSON.parse(project.providerConfig) : null,
      conversations_count: project.stats.conversationsCount,
      turns_count: project.stats.turnsCount,
      commits_count: commitsCount || project.stats.commitsCount,
      branches_count: project.stats.branchesCount,
      drafts_count: project.stats.draftsCount,
      outputs_count: outputsCount,
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
  const canonicalDefaultModel =
    body.default_model == null ? body.default_model : getCanonicalModelId(body.default_model);

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
      defaultModel: canonicalDefaultModel,
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
      visibility: project.visibility,
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
  description:
    'Soft-deletes a project by default. Use ?permanent=true for irreversible hard deletion.',
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
    403: {
      description: 'Access denied',
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

projectRoutes.openapi(deleteProjectRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { permanent } = c.req.valid('query');

  try {
    const db = await getDB();

    if (permanent === 'true') {
      // Permanent delete: need access control including soft-deleted projects
      const accessResult = await assertProjectAccessIncludingDeleted(c, db, id);
      if (accessResult instanceof Response) return accessResult;

      const deleted = await permanentDeleteProject(db, id);
      if (!deleted) {
        return c.json(
          {
            success: false as const,
            error: { code: 'NOT_FOUND', message: `Project ${id} not found` },
          },
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
          {
            success: false as const,
            error: { code: 'NOT_FOUND', message: `Project ${id} not found` },
          },
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
    403: {
      description: 'Access denied',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
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

projectRoutes.openapi(restoreProjectRoute, async (c) => {
  const { id } = c.req.valid('param');

  try {
    const db = await getDB();

    // Access control: must check against the deleted row
    const accessResult = await assertProjectAccessIncludingDeleted(c, db, id);
    if (accessResult instanceof Response) return accessResult;

    const restored = await restoreProject(db, id);
    if (!restored) {
      return c.json(
        {
          success: false as const,
          error: { code: 'NOT_FOUND', message: `Project ${id} not found or not deleted` },
        },
        404
      );
    }

    const apiProject = {
      project_id: restored.projectId,
      name: restored.name,
      visibility: restored.visibility,
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
