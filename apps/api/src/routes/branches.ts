/**
 * Branches Routes
 *
 * GET  /v1/branches - List branches (requires project_id query)
 * POST /v1/branches - Create branch
 * GET  /v1/branches/current - Get current branch
 * POST /v1/branches/switch - Switch current branch
 */

import {
  findBranchByName,
  findBranchesByProject,
  findCurrentBranch,
  findProjectById,
  insertBranch,
  switchBranch,
} from '@t3x/storage/pglite';
import { Hono } from 'hono';
import { getDB } from '../lib/db';
import { jsonError, jsonSuccess } from '../lib/response';

export const branchRoutes = new Hono();

/**
 * GET /v1/branches - List branches
 *
 * Supports cursor-based pagination: pass `cursor` query parameter
 * (empty string for first page) to receive `{ items, next_cursor, has_more }` response.
 * Omit `cursor` for legacy offset/limit mode.
 */
branchRoutes.get('/v1/branches', async (c) => {
  const projectId = c.req.query('project_id');

  if (!projectId) {
    return jsonError(c, 'INVALID_REQUEST', 'project_id query param is required', 400);
  }

  const limit = Math.min(Math.max(parseInt(c.req.query('limit') ?? '100', 10) || 100, 1), 1000);
  const offset = Math.max(parseInt(c.req.query('offset') ?? '0', 10) || 0, 0);
  const cursor = c.req.query('cursor');

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

  try {
    const db = await getDB();

    // Cursor-based pagination mode
    if (cursor !== undefined) {
      const result = await findBranchesByProject(db, { projectId, cursor, limit });
      return jsonSuccess(c, {
        items: result.items.map(toApiBranch),
        next_cursor: result.next_cursor,
        has_more: result.has_more,
      });
    }

    // Legacy offset/limit mode
    const branchList = await findBranchesByProject(db, { projectId, limit, offset });

    return jsonSuccess(c, {
      branches: branchList.map(toApiBranch),
      project_id: projectId,
      limit,
      offset,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'LIST_FAILED', message, 500);
  }
});

/**
 * POST /v1/branches - Create branch
 */
branchRoutes.post('/v1/branches', async (c) => {
  let body: {
    project_id?: string;
    name?: string;
    parent_branch?: string;
    description?: string;
  } | null = null;

  try {
    body = await c.req.json();
  } catch {
    return jsonError(c, 'INVALID_JSON', 'Invalid JSON body', 400);
  }

  if (!body?.project_id || !body?.name) {
    return jsonError(c, 'INVALID_REQUEST', 'project_id and name are required', 400);
  }

  try {
    const db = await getDB();

    // Verify project exists
    const project = await findProjectById(db, body.project_id);
    if (!project) {
      return jsonError(c, 'NOT_FOUND', `Project ${body.project_id} not found`, 404);
    }

    // Check if branch already exists
    const existing = await findBranchByName(db, body.project_id, body.name);
    if (existing) {
      return jsonError(c, 'CONFLICT', `Branch ${body.name} already exists`, 400);
    }

    const branch = await insertBranch(db, {
      projectId: body.project_id,
      name: body.name,
      parentBranch: body.parent_branch,
      description: body.description,
    });

    const apiBranch = {
      branch_id: branch.branchId,
      project_id: branch.projectId,
      name: branch.name,
      parent_branch: branch.parentBranch,
      head_commit_hash: branch.headCommitHash,
      description: branch.description,
      is_current: branch.isCurrent === 1,
      created_at: branch.createdAt.toISOString(),
      updated_at: branch.updatedAt.toISOString(),
    };

    return jsonSuccess(c, apiBranch, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'CREATE_FAILED', message, 500);
  }
});

/**
 * GET /v1/branches/current - Get current branch
 */
branchRoutes.get('/v1/branches/current', async (c) => {
  const projectId = c.req.query('project_id');

  if (!projectId) {
    return jsonError(c, 'INVALID_REQUEST', 'project_id query param is required', 400);
  }

  try {
    const db = await getDB();
    const branch = await findCurrentBranch(db, projectId);

    if (!branch) {
      return jsonError(c, 'NOT_FOUND', 'No current branch set', 404);
    }

    const apiBranch = {
      branch_id: branch.branchId,
      project_id: branch.projectId,
      name: branch.name,
      parent_branch: branch.parentBranch,
      head_commit_hash: branch.headCommitHash,
      description: branch.description,
      is_current: branch.isCurrent === 1,
      created_at: branch.createdAt.toISOString(),
      updated_at: branch.updatedAt.toISOString(),
    };

    return jsonSuccess(c, apiBranch);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'GET_FAILED', message, 500);
  }
});

/**
 * POST /v1/branches/switch - Switch current branch
 */
branchRoutes.post('/v1/branches/switch', async (c) => {
  let body: {
    project_id?: string;
    branch_name?: string;
    create_if_missing?: boolean;
  } | null = null;

  try {
    body = await c.req.json();
  } catch {
    return jsonError(c, 'INVALID_JSON', 'Invalid JSON body', 400);
  }

  if (!body?.project_id || !body?.branch_name) {
    return jsonError(c, 'INVALID_REQUEST', 'project_id and branch_name are required', 400);
  }

  try {
    const db = await getDB();

    // Check if branch exists
    let branch = await findBranchByName(db, body.project_id, body.branch_name);

    if (!branch) {
      if (body.create_if_missing) {
        // Create the branch
        branch = await insertBranch(db, {
          projectId: body.project_id,
          name: body.branch_name,
        });
      } else {
        return jsonError(c, 'NOT_FOUND', `Branch ${body.branch_name} not found`, 404);
      }
    }

    const switched = await switchBranch(db, body.project_id, body.branch_name);
    if (!switched) {
      return jsonError(c, 'SWITCH_FAILED', 'Failed to switch branch', 500);
    }

    const apiBranch = {
      branch_id: switched.branchId,
      project_id: switched.projectId,
      name: switched.name,
      parent_branch: switched.parentBranch,
      head_commit_hash: switched.headCommitHash,
      description: switched.description,
      is_current: switched.isCurrent === 1,
      created_at: switched.createdAt.toISOString(),
      updated_at: switched.updatedAt.toISOString(),
    };

    return jsonSuccess(c, apiBranch);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'SWITCH_FAILED', message, 500);
  }
});
