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

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  deleteDeployAgent,
  findDeployAgentById,
  findDeployAgents,
  insertDeployAgent,
  updateDeployAgent,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertProjectAccess } from '../lib/project-access';
import {
  CursorPageResponseSchema,
  ErrorResponseSchema,
  SuccessResponseSchema,
} from '../schemas/common';

// ============================================================
// Schemas
// ============================================================

const DeployAgentResponse = z.object({
  deploy_agent_id: z.string(),
  project_id: z.string().nullable(),
  name: z.string(),
  endpoint: z.string(),
  type: z.string(),
  auth: z.unknown().nullable(),
  status: z.string(),
  last_run_id: z.string().nullable(),
  last_run_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const AuthSchema = z
  .object({
    type: z.enum(['bearer', 'api_key']),
    token: z.string(),
    header: z.string().optional(),
  })
  .nullable()
  .optional();

const CreateDeployAgentRequest = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  endpoint: z.string().min(1),
  type: z.enum(['http', 'websocket', 'grpc']).optional(),
  project_id: z.string().optional(),
  auth: AuthSchema,
});

const UpdateDeployAgentRequest = z.object({
  name: z.string().optional(),
  endpoint: z.string().optional(),
  type: z.enum(['http', 'websocket', 'grpc']).optional(),
  auth: AuthSchema,
  status: z.enum(['idle', 'running', 'error']).optional(),
  last_run_id: z.string().optional(),
  last_run_at: z.string().optional(),
});

const ListDeployAgentsQuery = z.object({
  project_id: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  cursor: z.string().optional(),
});

const IdParamSchema = z.object({
  id: z.string().min(1),
});

// ============================================================
// Helpers
// ============================================================

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

// ============================================================
// Route Definitions
// ============================================================

// GET /v1/deploy-agents - List deploy agents
const listDeployAgentsRoute = createRoute({
  method: 'get',
  path: '/v1/deploy-agents',
  tags: ['Deploy Agents'],
  summary: 'List deploy agents',
  description:
    'Lists deploy agents. Supports cursor-based pagination (pass `cursor` param) or legacy offset/limit mode.',
  request: {
    query: ListDeployAgentsQuery,
  },
  responses: {
    200: {
      description: 'List of deploy agents',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.union([
              CursorPageResponseSchema(DeployAgentResponse),
              z.object({
                deploy_agents: z.array(DeployAgentResponse),
                limit: z.number(),
                offset: z.number(),
              }),
            ])
          ),
        },
      },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// POST /v1/deploy-agents - Create deploy agent
const createDeployAgentRoute = createRoute({
  method: 'post',
  path: '/v1/deploy-agents',
  tags: ['Deploy Agents'],
  summary: 'Create deploy agent',
  description: 'Registers a new deploy agent.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateDeployAgentRequest,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Deploy agent created',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(DeployAgentResponse),
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
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// GET /v1/deploy-agents/:id - Get deploy agent
const getDeployAgentRoute = createRoute({
  method: 'get',
  path: '/v1/deploy-agents/{id}',
  tags: ['Deploy Agents'],
  summary: 'Get deploy agent',
  description: 'Retrieves a deploy agent by ID.',
  request: {
    params: IdParamSchema,
  },
  responses: {
    200: {
      description: 'Deploy agent found',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(DeployAgentResponse),
        },
      },
    },
    404: {
      description: 'Deploy agent not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// PUT /v1/deploy-agents/:id - Update deploy agent
const updateDeployAgentRoute = createRoute({
  method: 'put',
  path: '/v1/deploy-agents/{id}',
  tags: ['Deploy Agents'],
  summary: 'Update deploy agent',
  description: 'Updates a deploy agent by ID.',
  request: {
    params: IdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: UpdateDeployAgentRequest,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Deploy agent updated',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(DeployAgentResponse),
        },
      },
    },
    404: {
      description: 'Deploy agent not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// DELETE /v1/deploy-agents/:id - Delete deploy agent
const deleteDeployAgentRoute = createRoute({
  method: 'delete',
  path: '/v1/deploy-agents/{id}',
  tags: ['Deploy Agents'],
  summary: 'Delete deploy agent',
  description: 'Deletes a deploy agent by ID.',
  request: {
    params: IdParamSchema,
  },
  responses: {
    200: {
      description: 'Deploy agent deleted',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.object({
              deleted: z.literal(true),
              deploy_agent_id: z.string(),
            })
          ),
        },
      },
    },
    404: {
      description: 'Deploy agent not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// ============================================================
// Router
// ============================================================

export const deployAgentRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });

// ============================================================
// Route Handlers
// ============================================================

/**
 * GET /v1/deploy-agents - List deploy agents
 *
 * Supports cursor-based pagination: pass `cursor` query parameter
 * (empty string for first page) to receive `{ items, next_cursor, has_more }` response.
 * Omit `cursor` for legacy offset/limit mode.
 */
deployAgentRoutes.openapi(listDeployAgentsRoute, async (c) => {
  const { project_id: projectId, limit, offset, cursor } = c.req.valid('query');

  try {
    const db = await getDB();

    // Access control check (if project-scoped)
    if (projectId) {
      const accessResult = await assertProjectAccess(c, db, projectId);
      if (accessResult instanceof Response) return accessResult as never;
    }

    // Cursor-based pagination mode
    if (cursor !== undefined) {
      const result = await findDeployAgents(db, { projectId, cursor, limit });
      return c.json(
        {
          success: true as const,
          data: {
            items: result.items.map(toApiAgent),
            next_cursor: result.next_cursor,
            has_more: result.has_more,
          },
        },
        200
      );
    }

    // Legacy offset/limit mode
    const agentsList = await findDeployAgents(db, { projectId, limit, offset });
    return c.json(
      {
        success: true as const,
        data: { deploy_agents: agentsList.map(toApiAgent), limit, offset },
      },
      200
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'LIST_FAILED', message);
  }
});

/**
 * POST /v1/deploy-agents - Create deploy agent
 */
deployAgentRoutes.openapi(createDeployAgentRoute, async (c) => {
  const body = c.req.valid('json');

  try {
    const db = await getDB();

    // Access control check (if project-scoped)
    if (body.project_id) {
      const accessResult = await assertProjectAccess(c, db, body.project_id);
      if (accessResult instanceof Response) return accessResult as never;
    }

    const agent = await insertDeployAgent(db, {
      id: body.id,
      name: body.name,
      endpoint: body.endpoint,
      type: body.type,
      projectId: body.project_id,
      auth: body.auth ?? undefined,
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

    return c.json({ success: true as const, data: apiAgent }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'CREATE_FAILED', message);
  }
});

/**
 * GET /v1/deploy-agents/:id - Get deploy agent
 */
deployAgentRoutes.openapi(getDeployAgentRoute, async (c) => {
  const { id: deployAgentId } = c.req.valid('param');

  try {
    const db = await getDB();
    const agent = await findDeployAgentById(db, deployAgentId);

    if (!agent) {
      return errorResponse(c, 'NOT_FOUND', `Deploy agent ${deployAgentId} not found`);
    }

    return c.json({ success: true as const, data: toApiAgent(agent) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'GET_FAILED', message);
  }
});

/**
 * PUT /v1/deploy-agents/:id - Update deploy agent
 */
deployAgentRoutes.openapi(updateDeployAgentRoute, async (c) => {
  const { id: deployAgentId } = c.req.valid('param');
  const body = c.req.valid('json');

  try {
    const db = await getDB();
    const agent = await updateDeployAgent(db, deployAgentId, {
      name: body.name,
      endpoint: body.endpoint,
      type: body.type,
      auth: body.auth ?? undefined,
      status: body.status,
      lastRunId: body.last_run_id,
      lastRunAt: body.last_run_at ? new Date(body.last_run_at) : undefined,
    });

    if (!agent) {
      return errorResponse(c, 'NOT_FOUND', `Deploy agent ${deployAgentId} not found`);
    }

    return c.json({ success: true as const, data: toApiAgent(agent) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'UPDATE_FAILED', message);
  }
});

/**
 * DELETE /v1/deploy-agents/:id - Delete deploy agent
 */
deployAgentRoutes.openapi(deleteDeployAgentRoute, async (c) => {
  const { id: deployAgentId } = c.req.valid('param');

  try {
    const db = await getDB();
    const deleted = await deleteDeployAgent(db, deployAgentId);

    if (!deleted) {
      return errorResponse(c, 'NOT_FOUND', `Deploy agent ${deployAgentId} not found`);
    }

    return c.json(
      { success: true as const, data: { deleted: true as const, deploy_agent_id: deployAgentId } },
      200
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'DELETE_FAILED', message);
  }
});
