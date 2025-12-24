/**
 * Projects Routes
 *
 * GET  /v1/projects - List projects
 * POST /v1/projects - Create project
 * GET  /v1/projects/:id - Get project by ID
 */
import { Hono } from 'hono';
import { getDB } from '../lib/db';
import { jsonSuccess, jsonError } from '../lib/response';
import { insertProject, findProjects, findProjectById } from '@t3x/storage/pglite';

export const projectRoutes = new Hono();

/**
 * GET /v1/projects - List projects
 */
projectRoutes.get('/v1/projects', async (c) => {
  const limit = parseInt(c.req.query('limit') ?? '100', 10);
  const offset = parseInt(c.req.query('offset') ?? '0', 10);

  try {
    const db = await getDB();
    const projects = await findProjects(db, { limit, offset });

    const apiProjects = projects.map((p) => ({
      project_id: p.projectId,
      name: p.name,
      created_at: p.createdAt.toISOString(),
      metadata: p.metadataJson ? JSON.parse(p.metadataJson) : null,
    }));

    return jsonSuccess(c, { projects: apiProjects, limit, offset });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'LIST_FAILED', message, 500);
  }
});

/**
 * POST /v1/projects - Create project
 */
projectRoutes.post('/v1/projects', async (c) => {
  let body: { name?: string; metadata?: Record<string, unknown> } | null = null;

  try {
    body = await c.req.json();
  } catch {
    return jsonError(c, 'INVALID_JSON', 'Invalid JSON body', 400);
  }

  if (!body?.name) {
    return jsonError(c, 'INVALID_REQUEST', 'name is required', 400);
  }

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

    return jsonSuccess(c, apiProject, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'CREATE_FAILED', message, 500);
  }
});

/**
 * GET /v1/projects/:id - Get project by ID
 */
projectRoutes.get('/v1/projects/:id', async (c) => {
  const id = c.req.param('id');

  try {
    const db = await getDB();
    const project = await findProjectById(db, id);

    if (!project) {
      return jsonError(c, 'NOT_FOUND', `Project ${id} not found`, 404);
    }

    const apiProject = {
      project_id: project.projectId,
      name: project.name,
      created_at: project.createdAt.toISOString(),
      metadata: project.metadataJson ? JSON.parse(project.metadataJson) : null,
    };

    return jsonSuccess(c, apiProject);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'GET_FAILED', message, 500);
  }
});
