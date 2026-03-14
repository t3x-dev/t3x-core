/**
 * Deploy Agents Routes
 *
 * GET    /v1/deploy-agents - List deploy agents
 * POST   /v1/deploy-agents - Create deploy agent
 * GET    /v1/deploy-agents/:id - Get deploy agent
 * PUT    /v1/deploy-agents/:id - Update deploy agent
 * DELETE /v1/deploy-agents/:id - Delete deploy agent
 *
 * Note: This is different from the "agent" layer (LLM draft generation).
 */

import {
  deleteDeployAgent,
  findDeployAgentById,
  findDeployAgents,
  insertDeployAgent,
  updateDeployAgent,
} from '@t3x-dev/storage';
import { Hono } from 'hono';
import { getDB } from '../lib/db';
import { assertProjectAccess } from '../lib/project-access';
import { jsonError, jsonSuccess } from '../lib/response';

/** Mask auth tokens in responses to avoid leaking secrets. */
function maskAuth(authJson: string | null): unknown {
  if (!authJson) return null;
  try {
    const auth = JSON.parse(authJson);
    if (auth?.token) {
      auth.token =
        auth.token.length > 8 ? `${auth.token.slice(0, 4)}****${auth.token.slice(-4)}` : '********';
    }
    return auth;
  } catch {
    return null;
  }
}

export const deployAgentRoutes = new Hono();

/**
 * GET /v1/deploy-agents - List deploy agents
 *
 * Supports cursor-based pagination: pass `cursor` query parameter
 * (empty string for first page) to receive `{ items, next_cursor, has_more }` response.
 * Omit `cursor` for legacy offset/limit mode.
 */
deployAgentRoutes.get('/v1/deploy-agents', async (c) => {
  const projectId = c.req.query('project_id') ?? undefined;
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') ?? '100', 10) || 100, 1), 1000);
  const offset = Math.max(parseInt(c.req.query('offset') ?? '0', 10) || 0, 0);
  const cursor = c.req.query('cursor');

  const toApiAgent = (a: {
    deployAgentId: string;
    projectId: string | null;
    name: string;
    endpoint: string;
    type: string;
    authJson: string | null;
    status: string;
    lastRunId: string | null;
    lastRunAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) => ({
    deploy_agent_id: a.deployAgentId,
    project_id: a.projectId,
    name: a.name,
    endpoint: a.endpoint,
    type: a.type,
    auth: maskAuth(a.authJson),
    status: a.status,
    last_run_id: a.lastRunId,
    last_run_at: a.lastRunAt?.toISOString() ?? null,
    created_at: a.createdAt.toISOString(),
    updated_at: a.updatedAt.toISOString(),
  });

  try {
    const db = await getDB();

    // Access control check (if project-scoped)
    if (projectId) {
      const accessResult = await assertProjectAccess(c, db, projectId);
      if (accessResult instanceof Response) return accessResult;
    }

    // Cursor-based pagination mode
    if (cursor !== undefined) {
      const result = await findDeployAgents(db, { projectId, cursor, limit });
      return jsonSuccess(c, {
        items: result.items.map(toApiAgent),
        next_cursor: result.next_cursor,
        has_more: result.has_more,
      });
    }

    // Legacy offset/limit mode
    const agentsList = await findDeployAgents(db, { projectId, limit, offset });

    return jsonSuccess(c, { deploy_agents: agentsList.map(toApiAgent), limit, offset });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'LIST_FAILED', message, 500);
  }
});

/**
 * POST /v1/deploy-agents - Create deploy agent
 */
deployAgentRoutes.post('/v1/deploy-agents', async (c) => {
  let body: {
    id?: string;
    name?: string;
    endpoint?: string;
    type?: 'http' | 'websocket' | 'grpc';
    project_id?: string;
    auth?: {
      type: 'bearer' | 'api_key';
      token: string;
      header?: string;
    };
  } | null = null;

  try {
    body = await c.req.json();
  } catch {
    return jsonError(c, 'INVALID_JSON', 'Invalid JSON body', 400);
  }

  if (!body?.id) {
    return jsonError(c, 'INVALID_REQUEST', 'id is required', 400);
  }
  if (!body?.name) {
    return jsonError(c, 'INVALID_REQUEST', 'name is required', 400);
  }
  if (!body?.endpoint) {
    return jsonError(c, 'INVALID_REQUEST', 'endpoint is required', 400);
  }

  try {
    const db = await getDB();

    // Access control check (if project-scoped)
    if (body.project_id) {
      const accessResult = await assertProjectAccess(c, db, body.project_id);
      if (accessResult instanceof Response) return accessResult;
    }

    const agent = await insertDeployAgent(db, {
      id: body.id,
      name: body.name,
      endpoint: body.endpoint,
      type: body.type,
      projectId: body.project_id,
      auth: body.auth,
    });

    const apiAgent = {
      deploy_agent_id: agent.deployAgentId,
      project_id: agent.projectId,
      name: agent.name,
      endpoint: agent.endpoint,
      type: agent.type,
      auth: agent.authJson ? JSON.parse(agent.authJson) : null,
      status: agent.status,
      last_run_id: agent.lastRunId,
      last_run_at: agent.lastRunAt?.toISOString() ?? null,
      created_at: agent.createdAt.toISOString(),
      updated_at: agent.updatedAt.toISOString(),
    };

    return jsonSuccess(c, apiAgent, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'CREATE_FAILED', message, 500);
  }
});

/**
 * GET /v1/deploy-agents/:id - Get deploy agent
 */
deployAgentRoutes.get('/v1/deploy-agents/:id', async (c) => {
  const deployAgentId = c.req.param('id');

  try {
    const db = await getDB();
    const agent = await findDeployAgentById(db, deployAgentId);

    if (!agent) {
      return jsonError(c, 'NOT_FOUND', `Deploy agent ${deployAgentId} not found`, 404);
    }

    const apiAgent = {
      deploy_agent_id: agent.deployAgentId,
      project_id: agent.projectId,
      name: agent.name,
      endpoint: agent.endpoint,
      type: agent.type,
      auth: maskAuth(agent.authJson),
      status: agent.status,
      last_run_id: agent.lastRunId,
      last_run_at: agent.lastRunAt?.toISOString() ?? null,
      created_at: agent.createdAt.toISOString(),
      updated_at: agent.updatedAt.toISOString(),
    };

    return jsonSuccess(c, apiAgent);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'GET_FAILED', message, 500);
  }
});

/**
 * PUT /v1/deploy-agents/:id - Update deploy agent
 */
deployAgentRoutes.put('/v1/deploy-agents/:id', async (c) => {
  const deployAgentId = c.req.param('id');
  let body: {
    name?: string;
    endpoint?: string;
    type?: 'http' | 'websocket' | 'grpc';
    auth?: {
      type: 'bearer' | 'api_key';
      token: string;
      header?: string;
    } | null;
    status?: 'idle' | 'running' | 'error';
    last_run_id?: string;
    last_run_at?: string;
  } | null = null;

  try {
    body = await c.req.json();
  } catch {
    return jsonError(c, 'INVALID_JSON', 'Invalid JSON body', 400);
  }

  try {
    const db = await getDB();
    const agent = await updateDeployAgent(db, deployAgentId, {
      name: body?.name,
      endpoint: body?.endpoint,
      type: body?.type,
      auth: body?.auth,
      status: body?.status,
      lastRunId: body?.last_run_id,
      lastRunAt: body?.last_run_at ? new Date(body.last_run_at) : undefined,
    });

    if (!agent) {
      return jsonError(c, 'NOT_FOUND', `Deploy agent ${deployAgentId} not found`, 404);
    }

    const apiAgent = {
      deploy_agent_id: agent.deployAgentId,
      project_id: agent.projectId,
      name: agent.name,
      endpoint: agent.endpoint,
      type: agent.type,
      auth: maskAuth(agent.authJson),
      status: agent.status,
      last_run_id: agent.lastRunId,
      last_run_at: agent.lastRunAt?.toISOString() ?? null,
      created_at: agent.createdAt.toISOString(),
      updated_at: agent.updatedAt.toISOString(),
    };

    return jsonSuccess(c, apiAgent);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'UPDATE_FAILED', message, 500);
  }
});

/**
 * DELETE /v1/deploy-agents/:id - Delete deploy agent
 */
deployAgentRoutes.delete('/v1/deploy-agents/:id', async (c) => {
  const deployAgentId = c.req.param('id');

  try {
    const db = await getDB();
    const deleted = await deleteDeployAgent(db, deployAgentId);

    if (!deleted) {
      return jsonError(c, 'NOT_FOUND', `Deploy agent ${deployAgentId} not found`, 404);
    }

    return jsonSuccess(c, { deleted: true, deploy_agent_id: deployAgentId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'DELETE_FAILED', message, 500);
  }
});
