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
  AgentConfigSchema,
  AgentInputSchema,
  DEFAULT_RULES,
  type EvalRules,
  EvalRulesSchema,
  evalEngine,
  observer,
  parseRulesFromLeaf,
  RuleSchema,
  type RunRecord,
  RunRecordSchema,
} from '@t3x-dev/runner';
import { errorJson, formatZodErrors, successJson, zodErrorHook } from '../lib/errors';
import { pinoLogger } from '../middleware/logger';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

export const runnerRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });

// ============================================
// Local Schemas
// ============================================

// Request schema for /runner/eval
const EvalRequestSchema = z.object({
  // Option 1: Provide run_id to fetch from observer
  run_id: z.string().optional(),
  // Option 2: Provide run_record directly
  run_record: RunRecordSchema.optional(),
  // Rules: inline rules or reference to rules file
  rules: EvalRulesSchema.optional(),
  rules_ref: z.string().optional(),
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

const registerAgentRoute = createRoute({
  method: 'post',
  path: '/runner/agents',
  tags: ['Runner'],
  summary: 'Register an agent',
  request: {
    body: {
      content: { 'application/json': { schema: z.any() } },
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
      content: { 'application/json': { schema: z.any() } },
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
    body: {
      content: { 'application/json': { schema: z.any() } },
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
      content: { 'application/json': { schema: z.any() } },
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
      content: { 'application/json': { schema: z.any() } },
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
      content: { 'application/json': { schema: z.any() } },
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

/**
 * POST /runner/agents - Register an agent
 */
runnerRoutes.openapi(registerAgentRoute, async (c: any): Promise<any> => {
  try {
    const body = await c.req.json();
    const config = AgentConfigSchema.parse(body);
    observer.registerAgent(config);
    pinoLogger.info({ agent_id: config.id }, 'agent registered');
    return successJson(c, { agent_id: config.id });
  } catch (error) {
    return errorJson(c, 'INVALID_REQUEST', errorMessage(error), 400);
  }
});

/**
 * GET /runner/agents/:id - Get agent config
 */
runnerRoutes.openapi(getAgentRoute, (c: any): any => {
  const agent = observer.getAgent(c.req.param('id'));
  if (!agent) {
    return errorJson(c, 'NOT_FOUND', 'Agent not found', 404);
  }
  return successJson(c, agent);
});

/**
 * POST /runner/run - Execute an agent run (proxy mode)
 */
runnerRoutes.openapi(executeRunRoute, async (c: any): Promise<any> => {
  try {
    const body = await c.req.json();
    const input = AgentInputSchema.parse(body);
    const agent = observer.getAgent(input.agent_id);

    if (!agent) {
      return errorJson(c, 'NOT_FOUND', `Agent not found: ${input.agent_id}`, 404);
    }

    // Start observing
    const runId = observer.startRun(input.agent_id, input);
    pinoLogger.info({ run_id: runId, agent_id: input.agent_id }, 'run started');

    try {
      // Forward to agent
      const startTime = Date.now();
      const response = await fetch(agent.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(agent.auth?.type === 'bearer' && agent.auth.token
            ? { Authorization: `Bearer ${agent.auth.token}` }
            : {}),
          ...(agent.auth?.type === 'api_key' && agent.auth.token && agent.auth.header
            ? { [agent.auth.header]: agent.auth.token }
            : {}),
        },
        body: JSON.stringify(input.input),
        signal: AbortSignal.timeout(input.config?.timeout_ms ?? 30000),
      });

      const output = await response.json();
      const latencyMs = Date.now() - startTime;

      // Complete the run
      const record = observer.completeRun(runId, output, 'completed');
      pinoLogger.info({ run_id: runId, latency_ms: latencyMs }, 'run completed');

      return successJson(c, {
        run_id: runId,
        output,
        record,
      });
    } catch (error) {
      const errorMsg = errorMessage(error);
      observer.recordError(runId, errorMsg);
      const record = observer.completeRun(runId, null, 'failed');

      pinoLogger.error({ run_id: runId, err: errorMsg }, 'run failed');
      return errorJson(c, 'INTERNAL_ERROR', errorMsg, 500, { run_id: runId, record });
    }
  } catch (error) {
    return errorJson(c, 'INVALID_REQUEST', errorMessage(error), 400);
  }
});

/**
 * POST /runner/run/:id/event - Add event to a running trace
 */
runnerRoutes.openapi(addRunEventRoute, async (c: any): Promise<any> => {
  try {
    const runId = c.req.param('id');
    const { type, data } = await c.req.json();

    if (type === 'llm_call') {
      observer.recordLLMCall(runId, data.input, data.output, data.model, data.latency_ms);
    } else if (type === 'tool_call') {
      observer.recordToolCall(runId, data.tool_name, data.input, data.output, data.latency_ms);
    } else if (type === 'error') {
      observer.recordError(runId, data.error);
    }

    return successJson(c, { recorded: true });
  } catch (error) {
    return errorJson(c, 'INVALID_REQUEST', errorMessage(error), 400);
  }
});

/**
 * GET /runner/run/:id - Get run record
 */
runnerRoutes.openapi(getRunRoute, (c: any): any => {
  const record = observer.getRun(c.req.param('id'));
  if (!record) {
    return errorJson(c, 'NOT_FOUND', 'Run not found', 404);
  }
  return successJson(c, record);
});

/**
 * GET /runner/runs - List runs
 */
runnerRoutes.openapi(listRunsRoute, (c: any): any => {
  const runs = observer.listRuns();
  return successJson(c, { runs });
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

    // Get RunRecord: from request or fetch by run_id
    let runRecord: RunRecord | undefined = request.run_record;

    if (!runRecord && request.run_id) {
      runRecord = observer.getRun(request.run_id);
      if (!runRecord) {
        return errorJson(c, 'NOT_FOUND', `Run not found: ${request.run_id}`, 404);
      }
    }

    if (!runRecord) {
      return errorJson(c, 'INVALID_REQUEST', 'Either run_id or run_record is required', 400);
    }

    // Get rules: from request or use default
    let rules: EvalRules;
    if (request.rules) {
      rules = request.rules;
    } else if (request.rules_ref) {
      rules = parseRulesFromLeaf({ rules_ref: request.rules_ref });
    } else {
      rules = DEFAULT_RULES;
    }

    // Run evaluation
    const result = evalEngine.evaluate(runRecord, rules);
    pinoLogger.info(
      { run_id: result.run_id, passed: result.passed, score: result.score },
      'eval completed'
    );

    return successJson(c, result);
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
    const { agent_id, input, rules, rules_ref, auto_eval } = await c.req.json();

    // Run agent
    const agent = observer.getAgent(agent_id);
    if (!agent) {
      return errorJson(c, 'NOT_FOUND', `Agent not found: ${agent_id}`, 404);
    }

    const runId = observer.startRun(agent_id, { agent_id, input });

    const response = await fetch(agent.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    const output = await response.json();
    const runRecord = observer.completeRun(runId, output, 'completed');

    // Auto-eval if enabled
    let evalResult = null;
    if (auto_eval) {
      // Get rules: from request or use default
      let evalRules: EvalRules;
      if (rules) {
        evalRules = EvalRulesSchema.parse(rules);
      } else if (rules_ref) {
        evalRules = parseRulesFromLeaf({ rules_ref });
      } else {
        evalRules = DEFAULT_RULES;
      }

      evalResult = evalEngine.evaluate(runRecord, evalRules);
    }

    return successJson(c, {
      run_id: runId,
      output,
      record: runRecord,
      eval_result: evalResult,
    });
  } catch (error) {
    return errorJson(c, 'INTERNAL_ERROR', errorMessage(error), 500);
  }
});
