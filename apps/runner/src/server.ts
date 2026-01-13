import cors from 'cors';
import { randomUUID } from 'crypto';
import express, { type Express } from 'express';
import pino from 'pino';
import { llmAsserter, type GenerateAssertionsResult } from './asserter.js';
import { evalEngine as legacyEvalEngine } from './eval.js';
import {
  getRunByRunnerRunId,
  getEngineCallbackUrl,
  type ParsedRun,
} from './engine-client.js';
import { evalEngine, parseRulesFromLeaf } from './evaluator/index.js';
import { triggerN8nWorkflow } from './n8n.js';
import { observer } from './observer.js';
import { fetchWithRetry } from './utils/retry.js';
import type { EvalResult } from './schemas/eval-result.js';
import type { RunRecord } from './schemas/run-record.js';
import {
  n8nClient,
  mapN8nExecutionToRunRecord,
  buildTraceSummary,
  shouldStoreFullTrace,
  type TracePolicy,
} from './trace/index.js';
import {
  AgentConfigSchema,
  AgentInputSchema,
  EngineRunRequestSchema,
  EvalRequestSchema,
  N8nCallbackSchema,
  TestStepSchema,
} from './types.js';

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
});

const app: Express = express();

// CORS - whitelist origins (extend via CORS_ORIGINS env var if needed)
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim())
  : ['http://localhost:3000'];

app.use(cors({ origin: allowedOrigins }));

app.use(express.json({ limit: '10mb' }));

// Root route - service info
app.get('/', (_req, res) => {
  res.json({
    success: true,
    data: {
      service: 't3x-runner',
      version: '0.1.0',
      endpoints: {
        health: 'GET /health',
        agents: 'POST /agents',
        run: 'POST /run',
        eval: 'POST /eval',
        commit: 'POST /commit',
        webhook: 'POST /webhook/run',
      },
      docs: 'https://github.com/anthropics/t3x/tree/main/t3x-runner',
    },
  });
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', service: 't3x-runner' } });
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
    res.json({ success: true, data: { agent_id: config.id } });
  } catch (error) {
    res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: String(error) } });
  }
});

/**
 * GET /agents/:id - Get agent config
 */
app.get('/agents/:id', (req, res) => {
  const agent = observer.getAgent(req.params.id);
  if (!agent) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Agent not found' } });
  }
  res.json({ success: true, data: agent });
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
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `Agent not found: ${input.agent_id}` } });
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
        success: true,
        data: { run_id: runId, output, trace },
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      observer.recordError(runId, errorMsg);
      const trace = observer.completeRun(runId, null, 'failed');

      logger.error({ run_id: runId, error: errorMsg }, 'Run failed');
      res.status(500).json({
        success: false,
        error: { code: 'RUN_FAILED', message: errorMsg },
        data: { run_id: runId, trace },
      });
    }
  } catch (error) {
    res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: String(error) } });
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
      observer.recordLLMCall(runId, data.input, data.output, data.model, data.latency_ms);
    } else if (type === 'tool_call') {
      observer.recordToolCall(runId, data.tool_name, data.input, data.output, data.latency_ms);
    } else if (type === 'error') {
      observer.recordError(runId, data.error);
    }

    res.json({ success: true, data: {} });
  } catch (error) {
    res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: String(error) } });
  }
});

/**
 * GET /run/:id - Get run trace
 */
app.get('/run/:id', (req, res) => {
  const trace = observer.getTrace(req.params.id);
  if (!trace) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Run not found' } });
  }
  res.json({ success: true, data: trace });
});

/**
 * GET /runs - List runs
 */
app.get('/runs', (req, res) => {
  const agentId = req.query.agent_id as string | undefined;
  const traces = observer.listTraces(agentId);
  res.json({ success: true, data: { runs: traces } });
});

// ============================================
// Engine → Runner → n8n Flow
// ============================================

/**
 * POST /runs - Engine triggers a run (triggers n8n workflow)
 *
 * This endpoint is called by the Engine to start a run.
 * It triggers the n8n workflow and returns immediately.
 *
 * Note: Runner is stateless - we don't store pending run info.
 * When n8n calls back, we fetch run details from Engine API.
 */
app.post('/runs', async (req, res) => {
  try {
    const data = EngineRunRequestSchema.parse(req.body);
    const runner_run_id = `runner_run_${randomUUID().slice(0, 8)}`;

    // Note: No longer storing in pendingRuns Map
    // Run info is stored in Engine's PostgreSQL and fetched on callback

    logger.info({ run_id: data.run_id, runner_run_id }, 'Run started, triggering n8n');

    // Trigger n8n workflow (async, fire-and-forget)
    if (data.workflow?.webhook_id) {
      triggerN8nWorkflow(data, runner_run_id).catch((err) => {
        logger.error({ run_id: data.run_id, error: String(err) }, 'n8n trigger failed');
      });
    }

    res.json({ success: true, data: { runner_run_id, status: 'running' } });
  } catch (error) {
    res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: String(error) } });
  }
});

/**
 * POST /callbacks/n8n - n8n workflow calls back with results
 *
 * This endpoint is called by n8n DURING workflow execution (before Respond node).
 *
 * Two-phase processing to avoid deadlock:
 * - Phase 1 (immediate): Use callback data, respond to n8n quickly
 * - Phase 2 (async): After delay, fetch full execution data from n8n API
 *
 * Flow:
 * 1. Respond to n8n immediately (within 5 seconds)
 * 2. Schedule async task to process after n8n workflow completes
 * 3. Async task: fetch trace, run eval, generate assertions, call Engine
 */
app.post('/callbacks/n8n', async (req, res) => {
  try {
    const data = N8nCallbackSchema.parse(req.body);

    logger.info({ run_id: data.run_id, runner_run_id: data.runner_run_id }, 'n8n callback received');

    // ═══════════════════════════════════════════════════
    // IMMEDIATE RESPONSE - Unblock n8n workflow
    // ═══════════════════════════════════════════════════
    res.json({ success: true, data: { ok: true, message: 'Callback received, processing async' } });

    // ═══════════════════════════════════════════════════
    // ASYNC PROCESSING - After n8n workflow completes
    // ═══════════════════════════════════════════════════
    // Delay to ensure n8n workflow has finished (Respond node executed)
    const ASYNC_DELAY_MS = 3000; // 3 seconds

    setTimeout(async () => {
      try {
        await processN8nCallback(data);
      } catch (error) {
        logger.error(
          { run_id: data.run_id, runner_run_id: data.runner_run_id, error: String(error) },
          'Async callback processing failed'
        );
      }
    }, ASYNC_DELAY_MS);

  } catch (error) {
    res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: String(error) } });
  }
});

/**
 * Process n8n callback data asynchronously
 * Called after a delay to ensure n8n workflow has completed
 */
async function processN8nCallback(data: {
  runner_run_id: string;
  run_id: string;
  execution_id?: string;
  output?: Record<string, unknown>;
  meta?: { latency_ms?: number; tokens?: number };
  error?: string | null;
}) {
  logger.info({ run_id: data.run_id, runner_run_id: data.runner_run_id }, 'Starting async callback processing');

  // ═══════════════════════════════════════════════════
  // Step 0: Fetch run details from Engine API (stateless)
  // ═══════════════════════════════════════════════════
  const runInfo = await getRunByRunnerRunId(data.runner_run_id);

  if (!runInfo) {
    logger.warn({ runner_run_id: data.runner_run_id }, 'Run not found in Engine');
    return;
  }

  logger.info({ run_id: runInfo.run_id, runner_run_id: data.runner_run_id }, 'Run info fetched from Engine');

  // ═══════════════════════════════════════════════════
  // Step 1: Collect trace from n8n (with retry for completion)
  // ═══════════════════════════════════════════════════
  let runRecord: RunRecord;

  if (data.execution_id) {
    // Full trace from n8n Execution API (with retry to ensure finished)
    try {
      logger.info({ execution_id: data.execution_id }, 'Fetching n8n execution trace...');
      const execution = await n8nClient.getExecutionWithRetry(data.execution_id, 5, 1000);
      runRecord = mapN8nExecutionToRunRecord(execution, {
        runId: runInfo.run_id,
      });
      logger.info({
        run_id: runInfo.run_id,
        steps: runRecord.steps.length,
        status: runRecord.status,
        finished: execution.finished,
      }, 'n8n trace collected');
    } catch (traceError) {
      logger.warn({ error: String(traceError) }, 'Failed to collect n8n trace, using fallback');
      // Fallback: build minimal RunRecord from callback data
      runRecord = buildRunRecordFromCallback(data, runInfo);
    }
  } else {
    // No execution_id: build minimal RunRecord from callback data
    runRecord = buildRunRecordFromCallback(data, runInfo);
  }

  // ═══════════════════════════════════════════════════
  // Step 2: Deterministic evaluation
  // ═══════════════════════════════════════════════════
  logger.info({ run_id: runInfo.run_id, rules_ref: runInfo.leaf?.rules_ref }, 'Running deterministic evaluation...');
  const evalResult: EvalResult = evalEngine.evaluateWithLeaf(
    runRecord,
    runInfo.leaf ?? undefined  // null -> undefined，根据 rules_ref 加载规则文件
  );

  logger.info({
    run_id: runInfo.run_id,
    passed: evalResult.passed,
    score: evalResult.score.toFixed(2),
    violations: evalResult.violations.length,
  }, 'Evaluation complete');

  // ═══════════════════════════════════════════════════
  // Step 3: LLM assertions (for prompt tuning insights)
  // ═══════════════════════════════════════════════════
  let assertionResult: GenerateAssertionsResult;
  try {
    logger.info({ run_id: runInfo.run_id }, 'Generating LLM assertions...');

    assertionResult = await llmAsserter.generateAssertions({
      evalResult,
      runRecord,
      context: {
        leaf: runInfo.leaf ?? undefined,
        inputs: runInfo.inputs,
      },
    });

    // Log based on assertion status
    if (assertionResult.status === 'success') {
      logger.info({
        run_id: runInfo.run_id,
        assertions_count: assertionResult.output?.assertions.length,
        suggestions_count: assertionResult.output?.suggestions.length,
      }, 'LLM assertions generated');
    } else if (assertionResult.status === 'skipped') {
      logger.info({ run_id: runInfo.run_id }, 'LLM assertions skipped: all checks passed');
    } else if (assertionResult.status === 'unavailable') {
      logger.warn({ run_id: runInfo.run_id }, 'LLM assertions unavailable: no API key');
    } else if (assertionResult.status === 'error') {
      logger.error({
        run_id: runInfo.run_id,
        error: assertionResult.error,
      }, 'LLM assertion generation failed');
    }
  } catch (assertError) {
    logger.error({ run_id: runInfo.run_id, error: String(assertError) }, 'Unexpected assertion error');
    assertionResult = {
      status: 'error',
      reason: 'Unexpected error during assertion generation',
      error: String(assertError),
    };
  }

  // ═══════════════════════════════════════════════════
  // Step 4: Call back to Engine
  // ═══════════════════════════════════════════════════
  const status = evalResult.passed ? 'completed' : 'failed';

  // Build trace summary (v2.0) - always included
  const traceSummary = buildTraceSummary(runRecord);

  // Determine trace storage policy from env (default: on_failure)
  const tracePolicy = (process.env.TRACE_POLICY || 'on_failure') as TracePolicy;
  const hasViolations = evalResult.violations && evalResult.violations.length > 0;
  const storeFullTrace = shouldStoreFullTrace(tracePolicy, status, hasViolations);

  logger.debug({
    run_id: runInfo.run_id,
    trace_policy: tracePolicy,
    store_full_trace: storeFullTrace,
    trajectory: traceSummary.trajectory,
  }, 'Trace storage decision');

  const ingestPayload = {
    run_id: runInfo.run_id,
    runner_run_id: data.runner_run_id,
    status,
    run_report: {
      trace: runRecord,
      eval_result: evalResult,
    },
    // Assertions (if generated successfully)
    assertions: assertionResult.output?.assertions || [],
    assertion_status: assertionResult.status,
    assertion_error: assertionResult.error,
    // Suggestions for prompt tuning
    evidence_pack: {
      suggestions: assertionResult.output?.suggestions || [],
      assertion_summary: assertionResult.output?.summary,
      n8n_output: data.output, // Keep original output for reference
      n8n_meta: data.meta,
    },
    // v2.0: Trace data for storage
    trace_summary: traceSummary,
    full_trace: storeFullTrace ? runRecord : undefined,
  };

  // Get callback URL from environment (stateless)
  const engineCallbackUrl = getEngineCallbackUrl();

  try {
    const engineResponse = await fetchWithRetry(
      engineCallbackUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ingestPayload),
        signal: AbortSignal.timeout(10000),
      },
      { maxRetries: 3, operationName: 'Engine ingest' }
    );

    if (!engineResponse.ok) {
      const errorText = await engineResponse.text();
      logger.error(
        { run_id: runInfo.run_id, status: engineResponse.status, error: errorText },
        'Engine ingest failed'
      );
    } else {
      logger.info({ run_id: runInfo.run_id }, 'Engine ingest successful');
    }
  } catch (engineError) {
    logger.error(
      { run_id: runInfo.run_id, error: String(engineError) },
      'Failed to call Engine ingest after retries'
    );
  }

  logger.info({ run_id: runInfo.run_id }, 'Async callback processing complete');
}

/**
 * Build minimal RunRecord from callback data (fallback when no execution_id)
 */
function buildRunRecordFromCallback(
  data: { run_id: string; output?: Record<string, unknown>; meta?: { latency_ms?: number }; error?: string | null },
  runInfo: ParsedRun
): RunRecord {
  const now = new Date().toISOString();
  return {
    run_id: runInfo.run_id,
    status: data.error ? 'failed' : 'completed',
    inputs: runInfo.inputs || {},
    output: data.output || {},
    steps: [
      {
        step_id: 'n8n_workflow',
        step_index: 0,
        name: 'n8n Workflow',
        type: 'workflow',
        span_kind: 'workflow',
        status: data.error ? 'error' : 'ok',
        latency_ms: data.meta?.latency_ms || 0,
        input: runInfo.inputs || {},
        output: data.output || {},
        error: data.error || undefined,
      },
    ],
    timing: {
      started_at: now, // We don't have started_at from Engine, use current time
      ended_at: now,
      total_ms: data.meta?.latency_ms || 0,
    },
    error: data.error
      ? {
          code: 'N8N_ERROR',
          message: data.error,
          step_id: 'n8n_workflow',
        }
      : undefined,
    source: {
      system: 'n8n',
    },
  };
}

// ============================================
// Evaluation
// ============================================

/**
 * POST /eval - Run evaluation against a trace (legacy API)
 *
 * @deprecated Use the new evaluator via /callbacks/n8n flow
 */
app.post('/eval', async (req, res) => {
  try {
    const request = EvalRequestSchema.parse(req.body);

    // If run_id provided but no trace, fetch it
    if (request.run_id && !request.trace) {
      const trace = observer.getTrace(request.run_id);
      if (!trace) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `Run not found: ${request.run_id}` } });
      }
      request.trace = trace;
    }

    // Use legacy eval engine for backward compatibility
    const result = await legacyEvalEngine.evaluate(request);
    logger.info({
      run_id: result.run_id,
      passed: result.passed,
      passed_steps: result.passed_steps,
      failed_steps: result.failed_steps,
    }, 'Legacy eval completed');

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: String(error) } });
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

    res.json({ success: true, data: { steps: validated } });
  } catch (error) {
    res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: String(error) } });
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
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `Run not found: ${run_id}` } });
    }

    // Convert trace to t3x conversation format
    const conversation = {
      id: run_id,
      messages: trace.events.map((event) => ({
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

    const commit: unknown = await response.json();
    const commitId =
      typeof commit === 'object' && commit !== null && 'id' in commit
        ? (commit as { id?: unknown }).id
        : undefined;
    logger.info({ run_id, commit_id: commitId }, 'T3X commit created');

    res.json({ success: true, data: { commit } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: String(error) } });
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
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `Agent not found: ${agent_id}` } });
    }

    const runId = observer.startRun(agent_id, { agent_id, input });

    const response = await fetch(agent.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    const output = await response.json();
    const trace = observer.completeRun(runId, output, 'completed');

    // Auto-eval if test steps provided (using legacy engine)
    let evalResult = null;
    if (auto_eval && test_steps?.length > 0) {
      evalResult = await legacyEvalEngine.evaluate({
        trace,
        test_steps,
        options: { stop_on_first_failure: false, generate_suggestions: true },
      });
    }

    res.json({
      success: true,
      data: { run_id: runId, output, trace, eval_result: evalResult },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: String(error) } });
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
