/**
 * Projects Routes
 *
 * GET    /v1/projects - List projects
 * POST   /v1/projects - Create project
 * GET    /v1/projects/:id - Get project by ID
 * DELETE /v1/projects/:id - Delete project
 */

import {
  deleteProject,
  findBranchesByProject,
  findCommitsV4ByProject,
  findConversationsByProject,
  findProjectById,
  findProjects,
  insertProject,
} from '@t3x/storage/pglite';
import { Hono } from 'hono';
import { getDB } from '../lib/db';
import { jsonError, jsonSuccess } from '../lib/response';

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

    // Fetch counts for each project in parallel
    const enriched = await Promise.all(
      projects.map(async (p) => {
        const [convs, commits, branchesList] = await Promise.all([
          findConversationsByProject(db, { projectId: p.projectId, limit: 10000 }),
          findCommitsV4ByProject(db, p.projectId, { limit: 10000 }),
          findBranchesByProject(db, { projectId: p.projectId, limit: 10000 }),
        ]);
        return {
          project_id: p.projectId,
          name: p.name,
          created_at: p.createdAt.toISOString(),
          metadata: p.metadataJson ? JSON.parse(p.metadataJson) : null,
          conversations_count: convs.length,
          commits_count: commits.length,
          branches_count: branchesList.length,
        };
      })
    );

    return jsonSuccess(c, { projects: enriched, limit, offset });
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

/**
 * DELETE /v1/projects/:id - Delete project
 */
projectRoutes.delete('/v1/projects/:id', async (c) => {
  const id = c.req.param('id');

  try {
    const db = await getDB();
    const deleted = await deleteProject(db, id);

    if (!deleted) {
      return jsonError(c, 'NOT_FOUND', `Project ${id} not found`, 404);
    }

    return jsonSuccess(c, { deleted: true, project_id: id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'DELETE_FAILED', message, 500);
  }
});
