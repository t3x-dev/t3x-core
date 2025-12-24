/**
 * Projects Routes with OpenAPI
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { getDB } from '../lib/db';
import { insertProject, findProjects, findProjectById, findProjectWithStats, updateProject, deleteProject } from '@t3x/storage/pglite';
import {
  ProjectSchema,
  ProjectWithStatsSchema,
  CreateProjectSchema,
  UpdateProjectSchema,
  ListProjectsResponseSchema,
} from '../schemas/projects';
import { PaginationQuerySchema, IdParamSchema, ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

export const projectRoutes = new OpenAPIHono();

// List projects route
const listProjectsRoute = createRoute({
  method: 'get',
  path: '/v1/projects',
  tags: ['Projects'],
  summary: 'List all projects',
  request: {
    query: PaginationQuerySchema,
  },
  responses: {
    200: {
      description: 'List of projects',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(ListProjectsResponseSchema),
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
  const { limit, offset } = c.req.valid('query');

  try {
    const db = await getDB();
    const projects = await findProjects(db, { limit, offset });

    const apiProjects = projects.map((p) => ({
      project_id: p.projectId,
      name: p.name,
      created_at: p.createdAt.toISOString(),
      metadata: p.metadataJson ? JSON.parse(p.metadataJson) : null,
    }));

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
      return c.json({ success: false as const, error: { code: 'NOT_FOUND', message: `Project ${id} not found` } }, 404);
    }

    const apiProject = {
      project_id: project.projectId,
      name: project.name,
      created_at: project.createdAt.toISOString(),
      metadata: project.metadataJson ? JSON.parse(project.metadataJson) : null,
      conversations_count: project.stats.conversationsCount,
      turns_count: project.stats.turnsCount,
      commits_count: project.stats.commitsCount,
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
    });

    if (!project) {
      return c.json({ success: false as const, error: { code: 'NOT_FOUND', message: `Project ${id} not found` } }, 404);
    }

    const apiProject = {
      project_id: project.projectId,
      name: project.name,
      created_at: project.createdAt.toISOString(),
      metadata: project.metadataJson ? JSON.parse(project.metadataJson) : null,
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
          schema: SuccessResponseSchema(z.object({ deleted: z.literal(true), project_id: z.string() })),
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
      return c.json({ success: false as const, error: { code: 'NOT_FOUND', message: `Project ${id} not found` } }, 404);
    }

    return c.json({ success: true as const, data: { deleted: true as const, project_id: id } }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ success: false as const, error: { code: 'DELETE_FAILED', message } }, 500);
  }
});
