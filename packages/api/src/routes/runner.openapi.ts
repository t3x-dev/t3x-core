/**
 * Runner Routes (OpenAPI)
 *
 * Grey-box agent evaluation endpoints.
 * Uses @t3x-dev/runner for evaluation logic.
 *
 * Updated for Runner v0.2.0:
 * - Uses RunRecord + EvalRules instead of legacy TestStep format
 * - evalEngine.evaluate(runRecord, rules) instead of evalEngine.evaluate(request)
 */

/** biome-ignore-all lint/suspicious/noExplicitAny: runner route forwards dynamic runner payloads pending a stricter transport contract */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  EvalRulesSchema,
  ProjectScopedAgentConfigSchema,
  ProjectScopedAgentInputSchema,
  RuleSchema,
  RunRecordSchema,
} from '@t3x-dev/runner';
import type { Context } from 'hono';
import { getDB } from '../lib/db';
import { errorJson, formatZodErrors, successJson, zodErrorHook } from '../lib/errors';
import { assertProjectAccess } from '../lib/project-access';
import { runnerServiceToken } from '../lib/runner-service-auth';
import { pinoLogger } from '../middleware/logger';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

export const runnerRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });

const RUNNER_URL = process.env.RUNNER_URL || 'http://t3x-runner:8080';

function runnerProxyError(code: string, message: string, status: 502 | 503): Response {
  return Response.json({ success: false, error: { code, message } }, { status });
}

async function authorizeRunnerProject(c: Context, projectId: unknown): Promise<Response | null> {
  if (typeof projectId !== 'string' || !projectId) {
    return errorJson(c, 'INVALID_REQUEST', 'project_id is required', 400);
  }
  const access = await assertProjectAccess(c, await getDB(), projectId);
  return access instanceof Response ? access : null;
}

async function forwardRunner(
  _c: Context,
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<Response> {
  const token = runnerServiceToken();
  if (!token) {
    return runnerProxyError(
      'SERVICE_AUTH_NOT_CONFIGURED',
      'RUNNER_SERVICE_TOKEN is not configured',
      503
    );
  }

  try {
    const response = await fetch(RUNNER_URL + path, {
      method: init?.method ?? 'GET',
      headers: {
        Authorization: 'Bearer ' + token,
        ...(init?.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      signal: AbortSignal.timeout(120000),
    });
    return new Response(await response.text(), {
      status: response.status,
      headers: { 'Content-Type': response.headers.get('Content-Type') ?? 'application/json' },
    });
  } catch (error) {
    pinoLogger.error({ err: error, path }, 'Runner proxy request failed');
    return runnerProxyError('RUNNER_UNAVAILABLE', 'Runner service is unavailable', 502);
  }
}

// ============================================
// Local Schemas
// ============================================

// Request schema for /runner/eval
const EvalRequestSchema = z.object({
  project_id: z.string(),
  // Option 1: Provide run_id to fetch from observer
  run_id: z.string().optional(),
  // Option 2: Provide run_record directly
  run_record: RunRecordSchema.optional(),
  // Rules: inline rules or reference to rules file
  rules: EvalRulesSchema.optional(),
  rules_ref: z.string().optional(),
});

const RunEventSchema = z.object({
  type: z.enum(['llm_call', 'tool_call', 'error']),
  data: z.record(z.string(), z.unknown()),
});

const WebhookRunRequestSchema = ProjectScopedAgentInputSchema.extend({
  auto_eval: z.boolean().optional(),
  rules: EvalRulesSchema.optional(),
  rules_ref: z.string().optional(),
});

const ValidateRulesRequestSchema = z.object({
  rules: z.array(z.unknown()).optional(),
  test_steps: z.array(z.unknown()).optional(),
});

const hasZodIssues = (
  error: unknown
): error is { issues: Array<{ path: (string | number)[]; message: string }> } =>
  typeof error === 'object' &&
  error !== null &&
  'issues' in error &&
  Array.isArray((error as { issues?: unknown }).issues);

const errorMessage = (error: unknown): string => {
  if (hasZodIssues(error)) {
    return formatZodErrors(error.issues);
  }
  return error instanceof Error ? error.message : String(error);
};

// ============================================
// Route Definitions
// ============================================

const runnerHealthRoute = createRoute({
  method: 'get',
  path: '/runner/health',
  tags: ['Runner'],
  summary: 'Check Runner service health through the API boundary',
  responses: {
    200: {
      description: 'Runner health',
      content: { 'application/json': { schema: SuccessResponseSchema(z.any()) } },
    },
  },
});

const registerAgentRoute = createRoute({
  method: 'post',
  path: '/runner/agents',
  tags: ['Runner'],
  summary: 'Register an agent',
  request: {
    body: {
      content: { 'application/json': { schema: ProjectScopedAgentConfigSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'Agent registered successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.object({ agent_id: z.string() })),
        },
      },
    },
    400: {
      description: 'Invalid agent config',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

const getAgentRoute = createRoute({
  method: 'get',
  path: '/runner/agents/{id}',
  tags: ['Runner'],
  summary: 'Get agent config',
  request: {
    params: z.object({ id: z.string() }),
    query: z.object({ project_id: z.string() }),
  },
  responses: {
    200: {
      description: 'Agent config',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.any()),
        },
      },
    },
    404: {
      description: 'Agent not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

const executeRunRoute = createRoute({
  method: 'post',
  path: '/runner/run',
  tags: ['Runner'],
  summary: 'Execute an agent run (proxy mode)',
  description: 'Receives input, forwards to agent, captures I/O',
  request: {
    body: {
      content: { 'application/json': { schema: ProjectScopedAgentInputSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'Run completed',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.any()),
        },
      },
    },
    400: {
      description: 'Invalid input',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    404: {
      description: 'Agent not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    500: {
      description: 'Run failed',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

const addRunEventRoute = createRoute({
  method: 'post',
  path: '/runner/run/{id}/event',
  tags: ['Runner'],
  summary: 'Add event to a running trace',
  description: 'For SDK integration — agent reports events directly',
  request: {
    params: z.object({ id: z.string() }),
    query: z.object({ project_id: z.string() }),
    body: {
      content: { 'application/json': { schema: RunEventSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'Event recorded',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.object({ recorded: z.boolean() })),
        },
      },
    },
    400: {
      description: 'Invalid event',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

const getRunRoute = createRoute({
  method: 'get',
  path: '/runner/run/{id}',
  tags: ['Runner'],
  summary: 'Get run record',
  request: {
    params: z.object({ id: z.string() }),
    query: z.object({ project_id: z.string() }),
  },
  responses: {
    200: {
      description: 'Run record',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.any()),
        },
      },
    },
    404: {
      description: 'Run not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

const listRunsRoute = createRoute({
  method: 'get',
  path: '/runner/runs',
  tags: ['Runner'],
  summary: 'List runs',
  request: {
    query: z.object({
      project_id: z.string(),
      system: z.enum(['n8n', 'langchain', 'custom']).optional(),
    }),
  },
  responses: {
    200: {
      description: 'List of runs',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.object({ runs: z.array(z.any()) })),
        },
      },
    },
  },
});

const evalRoute = createRoute({
  method: 'post',
  path: '/runner/eval',
  tags: ['Runner'],
  summary: 'Run evaluation against a RunRecord',
  description: 'v2.0: Uses RunRecord + EvalRules instead of legacy TestStep format',
  request: {
    body: {
      content: { 'application/json': { schema: EvalRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'Evaluation result',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.any()),
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
    404: {
      description: 'Run not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

const validateRulesRoute = createRoute({
  method: 'post',
  path: '/runner/eval/validate',
  tags: ['Runner'],
  summary: 'Validate evaluation rules',
  description: 'v2.0: Validates Rule objects instead of legacy TestStep format',
  request: {
    body: {
      content: { 'application/json': { schema: ValidateRulesRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'Validation results',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.any()),
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
  },
});

const webhookRunRoute = createRoute({
  method: 'post',
  path: '/runner/webhook/run',
  tags: ['Runner'],
  summary: 'Webhook trigger for agent run with auto-eval',
  description: 'v2.0: Uses EvalRules instead of legacy TestStep format',
  request: {
    body: {
      content: { 'application/json': { schema: WebhookRunRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'Run completed with optional eval',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.any()),
        },
      },
    },
    500: {
      description: 'Run failed',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// ============================================
// Route Handlers
// ============================================

runnerRoutes.openapi(runnerHealthRoute, (c: any): any => forwardRunner(c, '/health'));

/**
 * POST /runner/agents - Register an agent
 */
runnerRoutes.openapi(registerAgentRoute, async (c: any): Promise<any> => {
  try {
    const body = await c.req.json();
    const config = ProjectScopedAgentConfigSchema.parse(body);
    const accessError = await authorizeRunnerProject(c, config.project_id);
    if (accessError) return accessError;
    return forwardRunner(c, '/agents', { method: 'POST', body: config });
  } catch (error) {
    return errorJson(c, 'INVALID_REQUEST', errorMessage(error), 400);
  }
});

/**
 * GET /runner/agents/:id - Get agent config
 */
runnerRoutes.openapi(getAgentRoute, (c: any): any => {
  return (async () => {
    const projectId = c.req.valid('query').project_id;
    const accessError = await authorizeRunnerProject(c, projectId);
    if (accessError) return accessError;
    return forwardRunner(
      c,
      '/agents/' +
        encodeURIComponent(c.req.param('id')) +
        '?project_id=' +
        encodeURIComponent(projectId)
    );
  })();
});

/**
 * POST /runner/run - Execute an agent run (proxy mode)
 */
runnerRoutes.openapi(executeRunRoute, async (c: any): Promise<any> => {
  try {
    const body = await c.req.json();
    const input = ProjectScopedAgentInputSchema.parse(body);
    const accessError = await authorizeRunnerProject(c, input.project_id);
    if (accessError) return accessError;
    return forwardRunner(c, '/run', { method: 'POST', body: input });
  } catch (error) {
    return errorJson(c, 'INVALID_REQUEST', errorMessage(error), 400);
  }
});

/**
 * POST /runner/run/:id/event - Add event to a running trace
 */
runnerRoutes.openapi(addRunEventRoute, async (c: any): Promise<any> => {
  try {
    const projectId = c.req.valid('query').project_id;
    const accessError = await authorizeRunnerProject(c, projectId);
    if (accessError) return accessError;
    return forwardRunner(c, '/run/' + encodeURIComponent(c.req.param('id')) + '/event', {
      method: 'POST',
      body: { ...(await c.req.json()), project_id: projectId },
    });
  } catch (error) {
    return errorJson(c, 'INVALID_REQUEST', errorMessage(error), 400);
  }
});

/**
 * GET /runner/run/:id - Get run record
 */
runnerRoutes.openapi(getRunRoute, (c: any): any => {
  return (async () => {
    const projectId = c.req.valid('query').project_id;
    const accessError = await authorizeRunnerProject(c, projectId);
    if (accessError) return accessError;
    return forwardRunner(
      c,
      '/run/' +
        encodeURIComponent(c.req.param('id')) +
        '?project_id=' +
        encodeURIComponent(projectId)
    );
  })();
});

/**
 * GET /runner/runs - List runs
 */
runnerRoutes.openapi(listRunsRoute, (c: any): any => {
  return (async () => {
    const query = c.req.valid('query');
    const accessError = await authorizeRunnerProject(c, query.project_id);
    if (accessError) return accessError;
    const params = new URLSearchParams({ project_id: query.project_id });
    if (query.system) params.set('system', query.system);
    return forwardRunner(c, '/runs?' + params.toString());
  })();
});

/**
 * POST /runner/eval - Run evaluation against a RunRecord
 *
 * v2.0: Uses RunRecord + EvalRules instead of legacy TestStep format
 */
runnerRoutes.openapi(evalRoute, async (c: any): Promise<any> => {
  try {
    const body = await c.req.json();
    const request = EvalRequestSchema.parse(body);
    if (!request.run_record && !request.run_id) {
      return errorJson(c, 'INVALID_REQUEST', 'Either run_id or run_record is required', 400);
    }
    if (request.run_record && request.run_record.project_id !== request.project_id) {
      return errorJson(c, 'INVALID_REQUEST', 'run_record does not belong to project_id', 400);
    }
    const accessError = await authorizeRunnerProject(c, request.project_id);
    if (accessError) return accessError;
    return forwardRunner(c, '/eval', { method: 'POST', body: request });
  } catch (error) {
    return errorJson(c, 'INVALID_REQUEST', errorMessage(error), 400);
  }
});

/**
 * POST /runner/eval/validate - Validate evaluation rules
 *
 * v2.0: Validates Rule objects instead of legacy TestStep format
 */
runnerRoutes.openapi(validateRulesRoute, async (c: any): Promise<any> => {
  try {
    const body = await c.req.json();
    const rules = body.rules || body.test_steps; // Support both new and legacy field names

    if (!Array.isArray(rules)) {
      return errorJson(c, 'INVALID_REQUEST', 'rules must be an array', 400);
    }

    const validated = rules.map((rule: unknown, i: number) => {
      try {
        RuleSchema.parse(rule);
        return { index: i, valid: true };
      } catch (error) {
        return { index: i, valid: false, error: errorMessage(error) };
      }
    });

    return successJson(c, { rules: validated });
  } catch (error) {
    return errorJson(c, 'INVALID_REQUEST', errorMessage(error), 400);
  }
});

/**
 * POST /runner/webhook/run - Webhook trigger for agent run with auto-eval
 *
 * v2.0: Uses EvalRules instead of legacy TestStep format
 */
runnerRoutes.openapi(webhookRunRoute, async (c: any): Promise<any> => {
  try {
    const input = WebhookRunRequestSchema.parse(await c.req.json());
    const accessError = await authorizeRunnerProject(c, input.project_id);
    if (accessError) return accessError;
    return forwardRunner(c, '/webhook/run', { method: 'POST', body: input });
  } catch (error) {
    return errorJson(c, 'INVALID_REQUEST', errorMessage(error), 400);
  }
});
