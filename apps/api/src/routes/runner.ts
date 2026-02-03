/**
 * Runner Routes
 *
 * Grey-box agent evaluation endpoints.
 * Uses @t3x/runner for evaluation logic.
 *
 * Updated for Runner v0.2.0:
 * - Uses RunRecord + EvalRules instead of legacy TestStep format
 * - evalEngine.evaluate(runRecord, rules) instead of evalEngine.evaluate(request)
 */

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
} from '@t3x/runner';
import { Hono } from 'hono';
import { z } from 'zod';

export const runnerRoutes = new Hono();

// ============================================
// Agent Management
// ============================================

/**
 * POST /runner/agents - Register an agent
 */
runnerRoutes.post('/runner/agents', async (c) => {
  try {
    const body = await c.req.json();
    const config = AgentConfigSchema.parse(body);
    observer.registerAgent(config);
    console.log(`[runner] Agent registered: ${config.id}`);
    return c.json({ success: true, agent_id: config.id });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 400);
  }
});

/**
 * GET /runner/agents/:id - Get agent config
 */
runnerRoutes.get('/runner/agents/:id', (c) => {
  const agent = observer.getAgent(c.req.param('id'));
  if (!agent) {
    return c.json({ success: false, error: 'Agent not found' }, 404);
  }
  return c.json({ success: true, data: agent });
});

// ============================================
// Run Management
// ============================================

/**
 * POST /runner/run - Execute an agent run (proxy mode)
 *
 * Receives input, forwards to agent, captures I/O
 */
runnerRoutes.post('/runner/run', async (c) => {
  try {
    const body = await c.req.json();
    const input = AgentInputSchema.parse(body);
    const agent = observer.getAgent(input.agent_id);

    if (!agent) {
      return c.json({ success: false, error: `Agent not found: ${input.agent_id}` }, 404);
    }

    // Start observing
    const runId = observer.startRun(input.agent_id, input);
    console.log(`[runner] Run started: ${runId} for agent ${input.agent_id}`);

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
      console.log(`[runner] Run completed: ${runId} in ${latencyMs}ms`);

      return c.json({
        success: true,
        data: {
          run_id: runId,
          output,
          record,
        },
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      observer.recordError(runId, errorMsg);
      const record = observer.completeRun(runId, null, 'failed');

      console.error(`[runner] Run failed: ${runId}`, errorMsg);
      return c.json(
        {
          success: false,
          error: errorMsg,
          data: { run_id: runId, record },
        },
        500
      );
    }
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 400);
  }
});

/**
 * POST /runner/run/:id/event - Add event to a running trace
 *
 * For SDK integration - agent reports events directly
 */
runnerRoutes.post('/runner/run/:id/event', async (c) => {
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

    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 400);
  }
});

/**
 * GET /runner/run/:id - Get run record
 */
runnerRoutes.get('/runner/run/:id', (c) => {
  const record = observer.getRun(c.req.param('id'));
  if (!record) {
    return c.json({ success: false, error: 'Run not found' }, 404);
  }
  return c.json({ success: true, data: record });
});

/**
 * GET /runner/runs - List runs
 */
runnerRoutes.get('/runner/runs', (c) => {
  const runs = observer.listRuns();
  return c.json({ success: true, data: { runs } });
});

// ============================================
// Evaluation (v2.0 - RunRecord + EvalRules)
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

/**
 * POST /runner/eval - Run evaluation against a RunRecord
 *
 * v2.0: Uses RunRecord + EvalRules instead of legacy TestStep format
 */
runnerRoutes.post('/runner/eval', async (c) => {
  try {
    const body = await c.req.json();
    const request = EvalRequestSchema.parse(body);

    // Get RunRecord: from request or fetch by run_id
    let runRecord: RunRecord | undefined = request.run_record;

    if (!runRecord && request.run_id) {
      runRecord = observer.getRun(request.run_id);
      if (!runRecord) {
        return c.json({ success: false, error: `Run not found: ${request.run_id}` }, 404);
      }
    }

    if (!runRecord) {
      return c.json({ success: false, error: 'Either run_id or run_record is required' }, 400);
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
    console.log(
      `[runner] Eval completed: ${result.run_id}, passed=${result.passed}, score=${result.score.toFixed(2)}`
    );

    return c.json({ success: true, data: result });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 400);
  }
});

/**
 * POST /runner/eval/validate - Validate evaluation rules
 *
 * v2.0: Validates Rule objects instead of legacy TestStep format
 */
runnerRoutes.post('/runner/eval/validate', async (c) => {
  try {
    const body = await c.req.json();
    const rules = body.rules || body.test_steps; // Support both new and legacy field names

    if (!Array.isArray(rules)) {
      return c.json({ success: false, error: 'rules must be an array' }, 400);
    }

    const validated = rules.map((rule: unknown, i: number) => {
      try {
        RuleSchema.parse(rule);
        return { index: i, valid: true };
      } catch (error) {
        return { index: i, valid: false, error: String(error) };
      }
    });

    return c.json({ success: true, data: { rules: validated } });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 400);
  }
});

// ============================================
// Webhook for external integrations (n8n, etc.)
// ============================================

/**
 * POST /runner/webhook/run - Webhook trigger for agent run with auto-eval
 *
 * v2.0: Uses EvalRules instead of legacy TestStep format
 */
runnerRoutes.post('/runner/webhook/run', async (c) => {
  try {
    const { agent_id, input, rules, rules_ref, auto_eval } = await c.req.json();

    // Run agent
    const agent = observer.getAgent(agent_id);
    if (!agent) {
      return c.json({ success: false, error: `Agent not found: ${agent_id}` }, 404);
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

    return c.json({
      success: true,
      data: {
        run_id: runId,
        output,
        record: runRecord,
        eval_result: evalResult,
      },
    });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});
