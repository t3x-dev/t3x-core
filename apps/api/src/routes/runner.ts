/**
 * Runner Routes
 *
 * Grey-box agent evaluation endpoints.
 * Uses @t3x/runner for evaluation logic.
 */

import {
  AgentConfigSchema,
  AgentInputSchema,
  EvalRequestSchema,
  evalEngine,
  observer,
  TestStepSchema,
} from '@t3x/runner';
import { Hono } from 'hono';

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
      const trace = observer.completeRun(runId, output, 'completed');
      console.log(`[runner] Run completed: ${runId} in ${latencyMs}ms`);

      return c.json({
        success: true,
        data: {
          run_id: runId,
          output,
          trace,
        },
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      observer.recordError(runId, errorMsg);
      const trace = observer.completeRun(runId, null, 'failed');

      console.error(`[runner] Run failed: ${runId}`, errorMsg);
      return c.json(
        {
          success: false,
          error: errorMsg,
          data: { run_id: runId, trace },
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
 * GET /runner/run/:id - Get run trace
 */
runnerRoutes.get('/runner/run/:id', (c) => {
  const trace = observer.getTrace(c.req.param('id'));
  if (!trace) {
    return c.json({ success: false, error: 'Run not found' }, 404);
  }
  return c.json({ success: true, data: trace });
});

/**
 * GET /runner/runs - List runs
 */
runnerRoutes.get('/runner/runs', (c) => {
  const agentId = c.req.query('agent_id');
  const traces = observer.listTraces(agentId);
  return c.json({ success: true, data: { runs: traces } });
});

// ============================================
// Evaluation
// ============================================

/**
 * POST /runner/eval - Run evaluation against a trace
 */
runnerRoutes.post('/runner/eval', async (c) => {
  try {
    const body = await c.req.json();
    const request = EvalRequestSchema.parse(body);

    // If run_id provided but no trace, fetch it
    if (request.run_id && !request.trace) {
      const trace = observer.getTrace(request.run_id);
      if (!trace) {
        return c.json({ success: false, error: `Run not found: ${request.run_id}` }, 404);
      }
      request.trace = trace;
    }

    const result = await evalEngine.evaluate(request);
    console.log(
      `[runner] Eval completed: ${result.run_id}, passed=${result.passed}, ${result.passed_steps}/${result.total_steps} steps`
    );

    return c.json({ success: true, data: result });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 400);
  }
});

/**
 * POST /runner/eval/validate - Validate test steps
 */
runnerRoutes.post('/runner/eval/validate', async (c) => {
  try {
    const body = await c.req.json();
    const steps = body.test_steps;
    const validated = steps.map((step: unknown, i: number) => {
      try {
        TestStepSchema.parse(step);
        return { index: i, valid: true };
      } catch (error) {
        return { index: i, valid: false, error: String(error) };
      }
    });

    return c.json({ success: true, data: { steps: validated } });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 400);
  }
});

// ============================================
// Webhook for external integrations (n8n, etc.)
// ============================================

/**
 * POST /runner/webhook/run - Webhook trigger for agent run
 */
runnerRoutes.post('/runner/webhook/run', async (c) => {
  try {
    const { agent_id, input, test_steps, auto_eval } = await c.req.json();

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
    const trace = observer.completeRun(runId, output, 'completed');

    // Auto-eval if test steps provided
    let evalResult = null;
    if (auto_eval && test_steps?.length > 0) {
      evalResult = await evalEngine.evaluate({
        trace,
        test_steps,
        options: { stop_on_first_failure: false, generate_suggestions: true },
      });
    }

    return c.json({
      success: true,
      data: {
        run_id: runId,
        output,
        trace,
        eval_result: evalResult,
      },
    });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

