import cors from 'cors';
import { randomUUID } from 'crypto';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { type GenerateAssertionsResult, llmAsserter } from './asserter.js';
import { getEngineCallbackUrl, getEngineUrl, getRunByRunnerRunId, type ParsedRun } from './engine-client.js';
import { evalEngine } from './evaluator/index.js';
import { logger } from './lib/logger.js';
import { triggerN8nWorkflow } from './n8n.js';
import { observer } from './observer.js';
import type { EvalResult } from './schemas/eval-result.js';
import {
  AgentConfigSchema,
  AgentInputSchema,
  EngineRunRequestSchema,
  N8nCallbackSchema,
} from './schemas/index.js';
import type { RunRecord } from './schemas/run-record.js';
import {
  buildTraceSummary,
  mapN8nExecutionToRunRecord,
  n8nClient,
  shouldStoreFullTrace,
  type TracePolicy,
} from './trace/index.js';
import { fetchWithRetry } from './utils/retry.js';

const app: Express = express();

// CORS - whitelist origins (extend via CORS_ORIGINS env var if needed)
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim())
  : ['http://localhost:3000'];

app.use(cors({ origin: allowedOrigins }));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request-ID middleware — correlate logs across a single request
app.use((req: Request, res: Response, next: NextFunction) => {
  const reqId = randomUUID().replace(/-/g, '').slice(0, 12);
  (req as Request & { id: string }).id = reqId;
  res.setHeader('X-Request-Id', reqId);
  next();
});

// Root route - service info
app.get('/', (_req, res) => {
  res.json({
    success: true,
    data: {
      service: 't3x-runner',
      version: '0.2.0',
      endpoints: {
        health: 'GET /health',
        debug_n8n: 'GET /debug/n8n-check',
        agents: 'POST /agents',
        run: 'POST /run',
        runs: 'POST /runs (Engine → n8n flow)',
        callbacks: 'POST /callbacks/n8n',
      },
      docs: 'https://github.com/anthropics/t3x/tree/main/t3x-runner',
    },
  });
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', service: 't3x-runner' } });
});

// Readiness check — verifies T3X API connectivity
app.get('/ready', async (_req, res) => {
  const apiUrl = getEngineUrl();
  try {
    const response = await fetch(`${apiUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      res.json({ success: true, data: { status: 'ready', api: 'reachable' } });
    } else {
      res.status(503).json({
        success: false,
        error: { code: 'NOT_READY', message: `T3X API returned ${response.status}` },
      });
    }
  } catch (err) {
    res.status(503).json({
      success: false,
      error: { code: 'NOT_READY', message: `T3X API unreachable: ${err instanceof Error ? err.message : String(err)}` },
    });
  }
});

// Debug: n8n API connectivity check
app.get('/debug/n8n-check', async (_req, res) => {
  const apiUrl = process.env.N8N_API_URL || process.env.N8N_BASE_URL || 'http://n8n:5678';
  const hasKey = !!process.env.N8N_API_KEY;

  const info: Record<string, unknown> = {
    n8n_api_url: apiUrl,
    has_api_key: hasKey,
  };

  if (!hasKey) {
    res.json({
      success: false,
      error: { code: 'NO_API_KEY', message: 'N8N_API_KEY env var is not set' },
      data: info,
    });
    return;
  }

  try {
    const baseUrl = apiUrl.replace(/\/api\/v1\/?$/, '');
    const url = `${baseUrl}/api/v1/executions?limit=1`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-N8N-API-KEY': process.env.N8N_API_KEY!,
      },
      signal: AbortSignal.timeout(5000),
    });

    info.status = response.status;
    info.ok = response.ok;

    if (!response.ok) {
      const body = await response.text();
      info.error_body = body.slice(0, 500);
      res.json({
        success: false,
        error: { code: 'API_ERROR', message: `n8n returned ${response.status}` },
        data: info,
      });
    } else {
      res.json({ success: true, data: info });
    }
  } catch (error) {
    info.error = String(error);
    res.json({
      success: false,
      error: { code: 'CONNECTION_FAILED', message: String(error) },
      data: info,
    });
  }
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
    res
      .status(400)
      .json({ success: false, error: { code: 'INVALID_REQUEST', message: String(error) } });
  }
});

/**
 * GET /agents/:id - Get agent config
 */
app.get('/agents/:id', (req, res) => {
  const agent = observer.getAgent(req.params.id);
  if (!agent) {
    return res
      .status(404)
      .json({ success: false, error: { code: 'NOT_FOUND', message: 'Agent not found' } });
  }
  res.json({ success: true, data: agent });
});

// ============================================
// Run Management (SDK Proxy Mode)
// ============================================

/**
 * POST /run - Execute an agent run (proxy mode)
 *
 * Receives input, forwards to agent, captures I/O.
 * Returns RunRecord format.
 */
app.post('/run', async (req, res) => {
  try {
    const input = AgentInputSchema.parse(req.body);
    const agent = observer.getAgent(input.agent_id);

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Agent not found: ${input.agent_id}` },
      });
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
      const record = observer.completeRun(runId, output, 'completed');
      logger.info({ run_id: runId, latency_ms: latencyMs }, 'Run completed');

      res.json({
        success: true,
        data: { run_id: runId, output, record },
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      observer.recordError(runId, errorMsg);
      const record = observer.completeRun(runId, null, 'failed');

      logger.error({ run_id: runId, error: errorMsg }, 'Run failed');
      res.status(500).json({
        success: false,
        error: { code: 'RUN_FAILED', message: errorMsg },
        data: { run_id: runId, record },
      });
    }
  } catch (error) {
    res
      .status(400)
      .json({ success: false, error: { code: 'INVALID_REQUEST', message: String(error) } });
  }
});

/**
 * POST /run/:id/step - Add step to a running run
 *
 * For SDK integration - agent reports steps directly
 */
app.post('/run/:id/step', (req, res) => {
  try {
    const runId = req.params.id;
    const { type, data } = req.body;

    if (type === 'llm_call') {
      observer.recordLLMCall(
        runId,
        data.input,
        data.output,
        data.model,
        data.latency_ms,
        data.tokens
      );
    } else if (type === 'tool_call') {
      observer.recordToolCall(runId, data.tool_name, data.input, data.output, data.latency_ms);
    } else if (type === 'error') {
      observer.recordError(runId, data.error, data.step_id);
    }

    res.json({ success: true, data: {} });
  } catch (error) {
    res
      .status(400)
      .json({ success: false, error: { code: 'INVALID_REQUEST', message: String(error) } });
  }
});

/**
 * POST /run/:id/event - Add event to a running trace (legacy alias)
 * @deprecated Use POST /run/:id/step instead
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
    res
      .status(400)
      .json({ success: false, error: { code: 'INVALID_REQUEST', message: String(error) } });
  }
});

/**
 * GET /run/:id - Get run record
 */
app.get('/run/:id', (req, res) => {
  const record = observer.getRun(req.params.id);
  if (!record) {
    return res
      .status(404)
      .json({ success: false, error: { code: 'NOT_FOUND', message: 'Run not found' } });
  }
  res.json({ success: true, data: record });
});

/**
 * GET /runs - List runs
 */
app.get('/runs', (req, res) => {
  const system = req.query.system as 'n8n' | 'langchain' | 'custom' | undefined;
  const runs = observer.listRuns(system);
  res.json({ success: true, data: { runs } });
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
    res
      .status(400)
      .json({ success: false, error: { code: 'INVALID_REQUEST', message: String(error) } });
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

    logger.info(
      {
        run_id: data.run_id,
        runner_run_id: data.runner_run_id,
        execution_id: data.execution_id ?? '(missing)',
      },
      'n8n callback received'
    );

    // ═══════════════════════════════════════════════════
    // IMMEDIATE RESPONSE - Unblock n8n workflow
    // ═══════════════════════════════════════════════════
    res.json({ success: true, data: { ok: true, message: 'Callback received, processing async' } });

    // ═══════════════════════════════════════════════════
    // ASYNC PROCESSING - After n8n workflow completes
    // ═══════════════════════════════════════════════════
    // Delay to ensure n8n workflow has finished (Respond node executed)
    const ASYNC_DELAY_MS = 1500; // 1.5 seconds (n8n Respond node fires before workflow ends)

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
    res
      .status(400)
      .json({ success: false, error: { code: 'INVALID_REQUEST', message: String(error) } });
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
  meta?: { latency_ms?: number; tokens?: number; model?: string };
  error?: string | null;
}) {
  logger.info(
    { run_id: data.run_id, runner_run_id: data.runner_run_id },
    'Starting async callback processing'
  );

  // ═══════════════════════════════════════════════════
  // Step 0: Fetch run details from Engine API (stateless)
  // ═══════════════════════════════════════════════════
  const runInfo = await getRunByRunnerRunId(data.runner_run_id);

  if (!runInfo) {
    logger.warn({ runner_run_id: data.runner_run_id }, 'Run not found in Engine');
    return;
  }

  logger.info(
    { run_id: runInfo.run_id, runner_run_id: data.runner_run_id },
    'Run info fetched from Engine'
  );

  // ═══════════════════════════════════════════════════
  // Step 1: Collect trace from n8n (with retry for completion)
  // ═══════════════════════════════════════════════════
  let runRecord: RunRecord;

  // Normalize execution_id: treat empty/whitespace-only as missing
  const executionId = data.execution_id?.trim() || undefined;

  if (executionId) {
    // Full trace from n8n Execution API (with retry to ensure finished)
    try {
      logger.info({ execution_id: executionId }, 'Fetching n8n execution trace...');
      const execution = await n8nClient.getExecutionWithRetry(executionId, 5, 1000);

      // DEBUG: Log full n8n execution data to investigate tool call structure
      const runData = execution.data?.resultData?.runData;
      if (runData) {
        logger.debug({ run_id: runInfo.run_id }, 'n8n execution runData keys');
        for (const [nodeName, nodeRuns] of Object.entries(runData)) {
          for (const [runIndex, nodeRun] of nodeRuns.entries()) {
            const nodeRunAny = nodeRun as unknown as Record<string, unknown>;
            const dataKeys = nodeRunAny.data ? Object.keys(nodeRunAny.data as object) : [];
            logger.debug(
              {
                node: nodeName,
                run_index: runIndex,
                data_keys: dataKeys,
                has_ai_tool: dataKeys.includes('ai_tool'),
                has_ai_languageModel: dataKeys.includes('ai_languageModel'),
              },
              'Node run data structure'
            );

            // Log ai_tool data if present (for debugging tool detection)
            const nodeData = nodeRunAny.data as Record<string, unknown> | undefined;
            if (nodeData?.ai_tool) {
              logger.debug(
                {
                  node: nodeName,
                  ai_tool_data: JSON.stringify(nodeData.ai_tool).slice(0, 500),
                },
                'ai_tool data found'
              );
            }
          }
        }
      }

      runRecord = mapN8nExecutionToRunRecord(execution, {
        runId: runInfo.run_id,
      });
      logger.info(
        {
          run_id: runInfo.run_id,
          steps: runRecord.steps.length,
          status: runRecord.status,
          finished: execution.finished,
        },
        'n8n trace collected'
      );
    } catch (traceError) {
      logger.warn(
        { execution_id: executionId, error: String(traceError) },
        'Failed to collect n8n trace, using fallback'
      );
      // Fallback: build minimal RunRecord from callback data
      runRecord = buildRunRecordFromCallback(data, runInfo);
    }
  } else {
    // No execution_id: build minimal RunRecord from callback data
    logger.warn(
      { run_id: data.run_id, runner_run_id: data.runner_run_id },
      'No execution_id in n8n callback — falling back to minimal trace. ' +
        'Ensure n8n HTTP Request node sends execution_id={{ $execution.id }}'
    );
    runRecord = buildRunRecordFromCallback(data, runInfo);
  }

  // ═══════════════════════════════════════════════════
  // Step 2: Deterministic evaluation
  // ═══════════════════════════════════════════════════
  logger.info(
    { run_id: runInfo.run_id, rules_ref: runInfo.leaf?.rules_ref },
    'Running deterministic evaluation...'
  );

  const evalResult: EvalResult = evalEngine.evaluateWithLeaf(
    runRecord,
    runInfo.leaf ?? undefined // null -> undefined, load rules based on rules_ref
  );

  logger.info(
    {
      run_id: runInfo.run_id,
      passed: evalResult.passed,
      score: evalResult.score.toFixed(2),
      violations: evalResult.violations.length,
    },
    'Evaluation complete'
  );

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
      logger.info(
        {
          run_id: runInfo.run_id,
          assertions_count: assertionResult.output?.assertions.length,
          suggestions_count: assertionResult.output?.suggestions.length,
        },
        'LLM assertions generated'
      );
    } else if (assertionResult.status === 'skipped') {
      logger.info({ run_id: runInfo.run_id }, 'LLM assertions skipped: all checks passed');
    } else if (assertionResult.status === 'unavailable') {
      logger.warn({ run_id: runInfo.run_id }, 'LLM assertions unavailable: no API key');
    } else if (assertionResult.status === 'error') {
      logger.error(
        {
          run_id: runInfo.run_id,
          error: assertionResult.error,
        },
        'LLM assertion generation failed'
      );
    }
  } catch (assertError) {
    logger.error(
      { run_id: runInfo.run_id, error: String(assertError) },
      'Unexpected assertion error'
    );
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

  logger.debug(
    {
      run_id: runInfo.run_id,
      trace_policy: tracePolicy,
      store_full_trace: storeFullTrace,
      trajectory: traceSummary.trajectory,
    },
    'Trace storage decision'
  );

  // v2.2: Extract actual model from trace (takes priority over n8n callback hardcoded value)
  const llmStep = runRecord.steps.find((s) => s.llm?.model && s.llm.model !== 'unknown');
  const actualModel = llmStep?.llm?.model || data.meta?.model;

  logger.debug(
    {
      run_id: runInfo.run_id,
      model_from_trace: llmStep?.llm?.model,
      model_from_callback: data.meta?.model,
      actual_model: actualModel,
    },
    'Model extraction'
  );

  const ingestPayload = {
    run_id: runInfo.run_id,
    runner_run_id: data.runner_run_id,
    status,
    // v2.2: Extract actual model from trace (instead of n8n callback hardcoded value)
    metadata: actualModel ? { model: actualModel } : undefined,
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
  data: {
    run_id: string;
    output?: Record<string, unknown>;
    meta?: { latency_ms?: number };
    error?: string | null;
  },
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
// Webhook Run (Reserved for Future Use)
// ============================================

/**
 * POST /webhook/run - Run agent with auto-eval (webhook mode)
 *
 * RESERVED: This endpoint is planned for future implementation.
 * It will provide a combined run + eval flow for webhook integrations.
 *
 * Planned functionality:
 * - Receive agent_id, input, and test_steps in one request
 * - Execute agent run via observer (SDK proxy mode)
 * - Automatically run evaluation after completion
 * - Return combined results: { run_id, output, trace, eval_result }
 *
 * See RUNNER_PLAN.md for implementation roadmap.
 */
app.post('/webhook/run', (_req, res) => {
  res.status(501).json({
    success: false,
    error: {
      code: 'NOT_IMPLEMENTED',
      message:
        'POST /webhook/run is reserved for future implementation. See RUNNER_PLAN.md for roadmap.',
    },
  });
});

// ============================================
// Evaluation (Direct API)
// ============================================

/**
 * POST /eval - Run evaluation on a RunRecord
 *
 * Direct evaluation endpoint for testing purposes.
 * Production flow goes through /callbacks/n8n.
 */
app.post('/eval', async (req, res) => {
  try {
    const { run_record, rules_ref, rules } = req.body;

    if (!run_record) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'run_record is required' },
      });
    }

    // Build leaf-like object for evaluation
    const leaf = rules_ref ? { rules_ref } : rules ? { rules_ref: undefined } : undefined;

    const evalResult = evalEngine.evaluateWithLeaf(run_record, leaf);

    logger.info(
      {
        run_id: run_record.run_id,
        passed: evalResult.passed,
        score: evalResult.score.toFixed(2),
      },
      'Direct eval completed'
    );

    res.json({ success: true, data: evalResult });
  } catch (error) {
    res
      .status(400)
      .json({ success: false, error: { code: 'INVALID_REQUEST', message: String(error) } });
  }
});

// ============================================
// Global Error Handler
// ============================================

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  const reqId = (req as Request & { id?: string }).id;
  logger.error({ err, req_id: reqId, method: req.method, path: req.path }, 'unhandled error');
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  });
});

// ============================================
// Start Server
// ============================================

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'T3X Runner started');
  logger.info('Endpoints:');
  logger.info('  GET  /health        - Health check');
  logger.info('  GET  /ready         - Readiness check');
  logger.info('  POST /agents        - Register agent');
  logger.info('  POST /run           - Execute agent run (SDK proxy)');
  logger.info('  POST /run/:id/step  - Add step to running run');
  logger.info('  POST /runs          - Engine triggers n8n workflow');
  logger.info('  POST /callbacks/n8n - n8n callback');
  logger.info('  POST /eval          - Direct evaluation');
});

export { app };
