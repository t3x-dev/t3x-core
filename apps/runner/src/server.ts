import express from 'express';
import pino from 'pino';
import { observer } from './observer.js';
import { evalEngine } from './eval.js';
import {
  AgentInputSchema,
  AgentConfigSchema,
  EvalRequestSchema,
  TestStepSchema,
} from './types.js';

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
});

const app = express();
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 't3x-runner' });
});

// ============================================
// Agent Management
// ============================================

/**
 * POST /agents - Register an agent
 */
app.post('/agents', (req, res) => {
  try {
    const config = AgentConfigSchema.parse(req.body);
    observer.registerAgent(config);
    logger.info({ agent_id: config.id }, 'Agent registered');
    res.json({ success: true, agent_id: config.id });
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

/**
 * GET /agents/:id - Get agent config
 */
app.get('/agents/:id', (req, res) => {
  const agent = observer.getAgent(req.params.id);
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }
  res.json(agent);
});

// ============================================
// Run Management
// ============================================

/**
 * POST /run - Execute an agent run (proxy mode)
 *
 * Receives input, forwards to agent, captures I/O
 */
app.post('/run', async (req, res) => {
  try {
    const input = AgentInputSchema.parse(req.body);
    const agent = observer.getAgent(input.agent_id);

    if (!agent) {
      return res.status(404).json({ error: `Agent not found: ${input.agent_id}` });
    }

    // Start observing
    const runId = observer.startRun(input.agent_id, input);
    logger.info({ run_id: runId, agent_id: input.agent_id }, 'Run started');

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
      logger.info({ run_id: runId, latency_ms: latencyMs }, 'Run completed');

      res.json({
        run_id: runId,
        output,
        trace,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      observer.recordError(runId, errorMsg);
      const trace = observer.completeRun(runId, null, 'failed');

      logger.error({ run_id: runId, error: errorMsg }, 'Run failed');
      res.status(500).json({
        run_id: runId,
        error: errorMsg,
        trace,
      });
    }
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

/**
 * POST /run/:id/event - Add event to a running trace
 *
 * For SDK integration - agent reports events directly
 */
app.post('/run/:id/event', (req, res) => {
  try {
    const runId = req.params.id;
    const { type, data } = req.body;

    if (type === 'llm_call') {
      observer.recordLLMCall(
        runId,
        data.input,
        data.output,
        data.model,
        data.latency_ms
      );
    } else if (type === 'tool_call') {
      observer.recordToolCall(
        runId,
        data.tool_name,
        data.input,
        data.output,
        data.latency_ms
      );
    } else if (type === 'error') {
      observer.recordError(runId, data.error);
    }

    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

/**
 * GET /run/:id - Get run trace
 */
app.get('/run/:id', (req, res) => {
  const trace = observer.getTrace(req.params.id);
  if (!trace) {
    return res.status(404).json({ error: 'Run not found' });
  }
  res.json(trace);
});

/**
 * GET /runs - List runs
 */
app.get('/runs', (req, res) => {
  const agentId = req.query.agent_id as string | undefined;
  const traces = observer.listTraces(agentId);
  res.json({ runs: traces });
});

// ============================================
// Evaluation
// ============================================

/**
 * POST /eval - Run evaluation against a trace
 */
app.post('/eval', async (req, res) => {
  try {
    const request = EvalRequestSchema.parse(req.body);

    // If run_id provided but no trace, fetch it
    if (request.run_id && !request.trace) {
      const trace = observer.getTrace(request.run_id);
      if (!trace) {
        return res.status(404).json({ error: `Run not found: ${request.run_id}` });
      }
      request.trace = trace;
    }

    const result = await evalEngine.evaluate(request);
    logger.info({
      run_id: result.run_id,
      passed: result.passed,
      passed_steps: result.passed_steps,
      failed_steps: result.failed_steps,
    }, 'Eval completed');

    res.json(result);
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

/**
 * POST /eval/validate - Validate test steps
 */
app.post('/eval/validate', (req, res) => {
  try {
    const steps = req.body.test_steps;
    const validated = steps.map((step: unknown, i: number) => {
      try {
        TestStepSchema.parse(step);
        return { index: i, valid: true };
      } catch (error) {
        return { index: i, valid: false, error: String(error) };
      }
    });

    res.json({ steps: validated });
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

// ============================================
// T3X Integration
// ============================================

/**
 * POST /commit - Create t3x commit from eval results
 *
 * Sends eval trace to t3x-core for semantic analysis
 */
app.post('/commit', async (req, res) => {
  const t3xCoreUrl = process.env.T3X_CORE_URL || 'http://localhost:8000';

  try {
    const { run_id, eval_result, message } = req.body;

    const trace = observer.getTrace(run_id);
    if (!trace) {
      return res.status(404).json({ error: `Run not found: ${run_id}` });
    }

    // Convert trace to t3x conversation format
    const conversation = {
      id: run_id,
      messages: trace.events.map(event => ({
        id: event.id,
        role: event.type === 'agent_input' ? 'user' : 'assistant',
        content: JSON.stringify(event.data),
        timestamp: event.timestamp,
      })),
    };

    // Send to t3x-core for commit
    const response = await fetch(`${t3xCoreUrl}/api/v1/commits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation,
        message: message || `Eval run: ${run_id}`,
        metadata: {
          eval_result,
          trace_metrics: trace.metrics,
        },
      }),
    });

    const commit = await response.json();
    logger.info({ run_id, commit_id: commit.id }, 'T3X commit created');

    res.json({ success: true, commit });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ============================================
// Webhook for external integrations (n8n, etc.)
// ============================================

/**
 * POST /webhook/run - Webhook trigger for agent run
 */
app.post('/webhook/run', async (req, res) => {
  try {
    const { agent_id, input, test_steps, auto_eval } = req.body;

    // Run agent
    const agent = observer.getAgent(agent_id);
    if (!agent) {
      return res.status(404).json({ error: `Agent not found: ${agent_id}` });
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
        options: { generate_suggestions: true },
      });
    }

    res.json({
      run_id: runId,
      output,
      trace,
      eval_result: evalResult,
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ============================================
// Start Server
// ============================================

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'T3X Runner started');
  logger.info('Endpoints:');
  logger.info('  POST /agents      - Register agent');
  logger.info('  POST /run         - Execute agent run');
  logger.info('  POST /eval        - Run evaluation');
  logger.info('  POST /commit      - Create t3x commit');
  logger.info('  POST /webhook/run - Webhook trigger');
});

export { app };
