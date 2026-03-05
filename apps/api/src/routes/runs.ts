/**
 * Runs Routes
 *
 * Engine → Runner → n8n workflow orchestration.
 * This route receives run requests from WebUI, forwards to Runner,
 * and handles callbacks from Runner with results.
 */

import {
  createLeafHistory,
  findLeafById,
  findProjectById,
  getConfigurationStats,
  getRun,
  getRunByRunnerRunId,
  getRunFilterOptions,
  insertRun,
  listRuns,
  updateLeafRunnerAssertions,
  updateRun,
} from '@t3x/storage';
import { randomUUID } from 'crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { twoProportionZTest, twoSampleTTest } from '../lib/ab-test';
import { getDB } from '../lib/db';
import { pinoLogger } from '../middleware/logger';

// Runner URL (t3x-runner service)
const RUNNER_URL = process.env.RUNNER_URL || 'http://t3x-runner:8080';

// This Engine's callback URL for Runner to call back
const ENGINE_CALLBACK_URL =
  process.env.ENGINE_CALLBACK_URL || 'http://t3x-api:8000/api/v1/runs/ingest';

// Runner's callback URL for n8n to call back
const RUNNER_CALLBACK_URL =
  process.env.RUNNER_CALLBACK_URL || 'http://t3x-runner:8080/callbacks/n8n';

export const runsRoutes = new Hono();

// Request schema for creating a run
const CreateRunSchema = z.object({
  project_id: z.string().optional(),
  commit_ref: z.string().optional(),
  leaf_id: z.string().optional(), // Reference to an existing Leaf — resolve its output as prompt
  leaf: z
    .object({
      id: z.string(),
      type: z.enum(['deploy', 'deploy_agent', 'eval']),
      content: z.string().optional(), // prompt（给 n8n AI Agent）
      rules_ref: z.string().optional(), // 规则文件引用名（指向 Runner 的 resources/rules/ 目录）
    })
    .optional(),
  inputs: z.record(z.string(), z.unknown()).optional(),
  workflow: z
    .object({
      type: z.string(),
      webhook_id: z.string().optional(),
    })
    .optional(),
  // v2.1: Metadata for A/B test filtering
  metadata: z
    .object({
      model: z.string().optional(), // 模型名称，如 "gpt-4", "claude-3"
      prompt_version: z.string().optional(), // prompt 版本，如 "v1.0", "v2.0"
      test_case: z.string().optional(), // 测试用例标识
    })
    .optional(),
});

// Ingest schema for Runner callback
const IngestSchema = z.object({
  run_id: z.string(),
  runner_run_id: z.string(),
  status: z.enum(['completed', 'failed']),
  run_report: z.record(z.string(), z.unknown()).optional(),
  assertions: z.array(z.unknown()).optional(),
  eval_metrics: z.record(z.string(), z.unknown()).optional(),
  eval_summary: z.string().optional(),
  evidence_pack: z.record(z.string(), z.unknown()).optional(),
  // v2.0: Trace data
  trace_summary: z
    .object({
      trajectory: z.object({
        total_steps: z.number(),
        llm_calls: z.number(),
        tool_calls: z.number(),
        retrieval_calls: z.number(),
        failed_steps: z.number(),
      }),
      tokens: z.object({
        prompt_tokens: z.number(),
        completion_tokens: z.number(),
        total_tokens: z.number(),
      }),
      latency_ms: z.number(),
    })
    .optional(),
  full_trace: z.unknown().optional(),
  // v2.1: 从 n8n 回传的 metadata（包含实际使用的 model）
  metadata: z
    .object({
      model: z.string().optional(),
    })
    .optional(),
});

/**
 * POST /runs - Create and trigger a run
 *
 * Flow: WebUI → Engine → Runner → n8n
 */
runsRoutes.post('/v1/runs', async (c) => {
  try {
    const body = await c.req.json();
    const input = CreateRunSchema.parse(body);

    // Generate run ID
    const run_id = `run_${randomUUID().slice(0, 8)}`;

    // Store run in database
    const db = await getDB();

    // Validate project_id exists if provided
    if (input.project_id) {
      const project = await findProjectById(db, input.project_id);
      if (!project) {
        return c.json(
          {
            success: false,
            error: { code: 'PROJECT_NOT_FOUND', message: `Project ${input.project_id} not found` },
          },
          400
        );
      }
    }

    // Resolve leaf_id → Leaf.output as prompt content
    let resolvedLeaf = input.leaf;
    const leafId: string | null = input.leaf_id || null;

    if (input.leaf_id) {
      const leaf = await findLeafById(db, input.leaf_id);
      if (!leaf) {
        return c.json(
          {
            success: false,
            error: { code: 'LEAF_NOT_FOUND', message: `Leaf ${input.leaf_id} not found` },
          },
          400
        );
      }
      if (!leaf.output) {
        return c.json(
          {
            success: false,
            error: {
              code: 'LEAF_NO_OUTPUT',
              message: `Leaf ${input.leaf_id} has no generated output yet`,
            },
          },
          400
        );
      }
      // Use leaf output as prompt content, merge with inline leaf config if provided
      resolvedLeaf = {
        id: input.leaf?.id || leaf.id,
        type: input.leaf?.type || 'deploy',
        content: leaf.output,
        rules_ref: input.leaf?.rules_ref,
        title: leaf.title,
      };
      pinoLogger.info(
        { leaf_id: input.leaf_id, output_length: leaf.output.length },
        'resolved leaf_id to output'
      );
    }

    await insertRun(db, {
      run_id,
      project_id: input.project_id || null,
      runner_run_id: null,
      commit_ref: input.commit_ref || null,
      leaf_id: leafId,
      leaf_json: resolvedLeaf ? JSON.stringify(resolvedLeaf) : null,
      inputs_json: input.inputs ? JSON.stringify(input.inputs) : null,
      workflow_json: input.workflow ? JSON.stringify(input.workflow) : null,
      status: 'queued',
      result_json: null,
      // v2.1: Metadata for A/B test filtering
      metadata_json: input.metadata ? JSON.stringify(input.metadata) : null,
    });

    pinoLogger.info({ run_id }, 'created run, forwarding to Runner');

    // Forward to Runner
    const runnerPayload = {
      run_id,
      commit_ref: input.commit_ref,
      leaf: resolvedLeaf,
      inputs: input.inputs,
      callback_url: RUNNER_CALLBACK_URL,
      engine_callback_url: ENGINE_CALLBACK_URL,
      workflow: input.workflow,
    };

    let runner_run_id: string | undefined;
    let warning: string | undefined;

    try {
      const runnerResponse = await fetch(`${RUNNER_URL}/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(runnerPayload),
        signal: AbortSignal.timeout(10000),
      });

      if (runnerResponse.ok) {
        const runnerData = (await runnerResponse.json()) as {
          success: boolean;
          data?: { runner_run_id: string };
        };
        runner_run_id = runnerData.data?.runner_run_id;

        // Update run with runner_run_id
        if (runner_run_id) {
          await updateRun(db, run_id, {
            runner_run_id,
            status: 'running',
          });
        }

        pinoLogger.info({ run_id, runner_run_id }, 'Runner accepted run');
      } else {
        const errorText = await runnerResponse.text();
        warning = `Runner returned ${runnerResponse.status}: ${errorText}`;
        pinoLogger.warn({ run_id, warning }, 'Runner returned error');
      }
    } catch (err) {
      warning = `Failed to reach Runner: ${err instanceof Error ? err.message : String(err)}`;
      pinoLogger.warn({ run_id, warning }, 'failed to reach Runner');
    }

    return c.json({
      success: true,
      data: {
        run_id,
        status: runner_run_id ? 'running' : 'queued',
        runner_run_id,
        warning,
      },
    });
  } catch (error) {
    pinoLogger.error({ err: error }, 'error creating run');
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: error instanceof Error ? error.message : String(error),
        },
      },
      400
    );
  }
});

/**
 * POST /runs/ingest - Receive results from Runner
 *
 * Flow: n8n → Runner → Engine (this endpoint)
 */
runsRoutes.post('/v1/runs/ingest', async (c) => {
  try {
    const body = await c.req.json();
    const data = IngestSchema.parse(body);

    pinoLogger.info({ run_id: data.run_id, status: data.status }, 'received ingest');

    // Update run in database
    const db = await getDB();

    // v2.1: 合并 metadata（保留原有字段，如 prompt_version）
    let mergedMetadataJson: string | null = null;
    if (data.metadata) {
      const existingRun = await getRun(db, data.run_id);
      // 数据库返回的是 metadataJson 字符串，需要解析
      const existingMetadataJson = existingRun?.metadataJson as string | null;
      const existingMetadata = existingMetadataJson ? JSON.parse(existingMetadataJson) : {};
      const mergedMetadata = { ...existingMetadata, ...data.metadata };
      mergedMetadataJson = JSON.stringify(mergedMetadata);
    }

    await updateRun(db, data.run_id, {
      status: data.status,
      result_json: JSON.stringify({
        run_report: data.run_report,
        assertions: data.assertions,
        eval_metrics: data.eval_metrics,
        eval_summary: data.eval_summary,
        evidence_pack: data.evidence_pack,
      }),
      // v2.0: Trace data storage
      trace_summary_json: data.trace_summary ? JSON.stringify(data.trace_summary) : null,
      full_trace_json: data.full_trace ? JSON.stringify(data.full_trace) : null,
      // v2.1: 合并后的 metadata（保留 prompt_version，添加 model）
      ...(mergedMetadataJson && { metadata_json: mergedMetadataJson }),
    });

    pinoLogger.info(
      {
        run_id: data.run_id,
        status: data.status,
        has_trace_summary: !!data.trace_summary,
        has_full_trace: !!data.full_trace,
        has_metadata: !!data.metadata,
      },
      'updated run'
    );

    // Phase 3: Write back assertions to Leaf + create history snapshot
    const run = await getRun(db, data.run_id);
    const leafId = run?.leafId as string | null;

    if (leafId && data.assertions && data.assertions.length > 0) {
      try {
        // Defensive mapping: ensure each assertion has the required fields
        const mappedAssertions = data.assertions.map((a: unknown, idx: number) => {
          const raw = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>;
          return {
            id: typeof raw.id === 'string' ? raw.id : '',
            constraint_id:
              typeof raw.constraint_id === 'string' ? raw.constraint_id : `unknown_${idx}`,
            passed: typeof raw.passed === 'boolean' ? raw.passed : false,
            details: typeof raw.details === 'string' ? raw.details : '',
            lesson: typeof raw.lesson === 'string' ? raw.lesson : undefined,
          };
        });

        await updateLeafRunnerAssertions(db, leafId, mappedAssertions);

        // Create leaf history snapshot
        const leaf = await findLeafById(db, leafId);
        if (leaf?.output) {
          await createLeafHistory(db, {
            leaf_id: leafId,
            output: leaf.output,
            config: leaf.config ?? {},
            model: ((leaf.config as Record<string, unknown>)?.model as string) ?? 'unknown',
            created_by: 'runner-ingest',
          });
        }

        pinoLogger.info(
          { leaf_id: leafId, assertion_count: mappedAssertions.length },
          'wrote back assertions to leaf'
        );
      } catch (err) {
        // Non-fatal: log warning but don't fail the ingest
        pinoLogger.warn({ err, leaf_id: leafId }, 'failed to write back assertions to leaf');
      }
    }

    return c.json({ success: true, data: { ok: true } });
  } catch (error) {
    pinoLogger.error({ err: error }, 'error ingesting run');
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: error instanceof Error ? error.message : String(error),
        },
      },
      400
    );
  }
});

/**
 * GET /runs - List runs
 *
 * v2.1: Added model and prompt_version filters for A/B test comparison
 */
runsRoutes.get('/v1/runs', async (c) => {
  try {
    const projectId = c.req.query('project_id');
    const status = c.req.query('status') as
      | 'queued'
      | 'running'
      | 'completed'
      | 'failed'
      | undefined;
    // v2.1: Metadata filters for A/B test
    const model = c.req.query('model');
    const prompt_version = c.req.query('prompt_version');
    const limit = parseInt(c.req.query('limit') || '50', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);

    const db = await getDB();
    const result = await listRuns(db, { projectId, status, model, prompt_version, limit, offset });

    return c.json({
      success: true,
      data: {
        runs: result,
        limit,
        offset,
      },
    });
  } catch (error) {
    pinoLogger.error({ err: error }, 'error listing runs');
    return c.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      },
      500
    );
  }
});

/**
 * GET /runs/by-runner-id/:runnerRunId - Get run by runner_run_id
 *
 * Used by Runner to look up run details when receiving n8n callback.
 * This enables Runner to be stateless (no in-memory pendingRuns map).
 */
runsRoutes.get('/v1/runs/by-runner-id/:runnerRunId', async (c) => {
  try {
    const runnerRunId = c.req.param('runnerRunId');
    const db = await getDB();
    const run = await getRunByRunnerRunId(db, runnerRunId);

    if (!run) {
      return c.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: `Run not found for runner_run_id: ${runnerRunId}` },
        },
        404
      );
    }

    return c.json({ success: true, data: run });
  } catch (error) {
    pinoLogger.error({ err: error }, 'error getting run by runner_run_id');
    return c.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      },
      500
    );
  }
});

/**
 * GET /runs/filters - Get available filter options
 *
 * v2.1: Returns distinct model and prompt_version values for filter dropdowns
 */
runsRoutes.get('/v1/runs/filters', async (c) => {
  try {
    const db = await getDB();
    const options = await getRunFilterOptions(db);

    return c.json({
      success: true,
      data: options,
    });
  } catch (error) {
    pinoLogger.error({ err: error }, 'error getting filter options');
    return c.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      },
      500
    );
  }
});

/**
 * GET /runs/configurations - Get aggregated stats for all configurations
 *
 * v2.2: Returns statistics grouped by model + prompt_version
 * for selecting which configurations to compare in A/B test.
 */
runsRoutes.get('/v1/runs/configurations', async (c) => {
  try {
    const projectId = c.req.query('project_id');
    const db = await getDB();
    const configurations = await getConfigurationStats(db, projectId || undefined);

    return c.json({
      success: true,
      data: { configurations },
    });
  } catch (error) {
    pinoLogger.error({ err: error }, 'error getting configurations');
    return c.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      },
      500
    );
  }
});

/**
 * GET /runs/:id - Get a specific run
 *
 * NOTE: This route MUST be after all specific /runs/xxx routes
 * because :id would match "filters", "configurations", etc.
 */
runsRoutes.get('/v1/runs/:id', async (c) => {
  try {
    const runId = c.req.param('id');
    const db = await getDB();
    const run = await getRun(db, runId);

    if (!run) {
      return c.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: `Run not found: ${runId}` },
        },
        404
      );
    }

    return c.json({ success: true, data: run });
  } catch (error) {
    pinoLogger.error({ err: error }, 'error getting run');
    return c.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      },
      500
    );
  }
});

/**
 * DELETE /runs/:id - Delete a specific run
 */
runsRoutes.delete('/v1/runs/:id', async (c) => {
  try {
    const runId = c.req.param('id');
    const db = await getDB();

    // Import deleteRun dynamically to avoid circular dependency issues
    const { deleteRun } = await import('@t3x/storage');
    const deleted = await deleteRun(db, runId);

    if (!deleted) {
      return c.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: `Run not found: ${runId}` },
        },
        404
      );
    }

    return c.json({ success: true, data: { deleted: true } });
  } catch (error) {
    pinoLogger.error({ err: error }, 'error deleting run');
    return c.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      },
      500
    );
  }
});

// v2.3: Request schema for updating run metadata (Report asset)
const UpdateRunSchema = z.object({
  title: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

/**
 * PATCH /runs/:id - Update run metadata (title, description, tags)
 *
 * v2.3: Report asset — allows naming and tagging runs as reports.
 */
runsRoutes.patch('/v1/runs/:id', async (c) => {
  try {
    const runId = c.req.param('id');
    const body = await c.req.json();

    // Validate request body
    const parsed = UpdateRunSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_FAILED',
            message: parsed.error.issues.map((i) => i.message).join(', '),
          },
        },
        400
      );
    }

    const input = parsed.data;

    // Require at least one field
    if (input.title === undefined && input.description === undefined && input.tags === undefined) {
      return c.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'At least one field (title, description, tags) must be provided',
          },
        },
        400
      );
    }

    const db = await getDB();

    // Check run exists
    const existing = await getRun(db, runId);
    if (!existing) {
      return c.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: `Run not found: ${runId}` },
        },
        404
      );
    }

    const updated = await updateRun(db, runId, {
      title: input.title,
      description: input.description,
      tags: input.tags,
    });

    return c.json({ success: true, data: updated });
  } catch (error) {
    pinoLogger.error({ err: error }, 'error updating run');
    return c.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      },
      500
    );
  }
});

// Request schema for A/B test comparison
const CompareRunsSchema = z.object({
  control: z.object({
    model: z.string(),
    prompt_version: z.string(),
  }),
  treatment: z.object({
    model: z.string(),
    prompt_version: z.string(),
  }),
  project_id: z.string().optional(),
});

/**
 * POST /runs/compare - Compare two configurations with A/B test statistics
 *
 * v2.2: Performs statistical comparison between control (A) and treatment (B).
 * Returns p-values and significance indicators for pass_rate and avg_score.
 */
runsRoutes.post('/v1/runs/compare', async (c) => {
  try {
    const body = await c.req.json();
    const input = CompareRunsSchema.parse(body);

    const db = await getDB();
    const allStats = await getConfigurationStats(db, input.project_id || undefined);

    // Find control and treatment configurations
    const control = allStats.find(
      (s) => s.model === input.control.model && s.prompt_version === input.control.prompt_version
    );
    const treatment = allStats.find(
      (s) =>
        s.model === input.treatment.model && s.prompt_version === input.treatment.prompt_version
    );

    if (!control) {
      return c.json(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Control configuration not found: ${input.control.model}/${input.control.prompt_version}`,
          },
        },
        404
      );
    }

    if (!treatment) {
      return c.json(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Treatment configuration not found: ${input.treatment.model}/${input.treatment.prompt_version}`,
          },
        },
        404
      );
    }

    // Perform statistical tests
    const passRateComparison = twoProportionZTest(
      control.pass_count,
      control.run_count,
      treatment.pass_count,
      treatment.run_count
    );

    const avgScoreComparison = twoSampleTTest(control.scores, treatment.scores);

    // Calculate simple deltas for latency and tokens (no statistical test needed)
    const latencyDelta = treatment.avg_latency_ms - control.avg_latency_ms;
    const latencyDeltaPercent =
      control.avg_latency_ms > 0 ? (latencyDelta / control.avg_latency_ms) * 100 : 0;

    const tokensDelta = treatment.avg_tokens - control.avg_tokens;
    const tokensDeltaPercent =
      control.avg_tokens > 0 ? (tokensDelta / control.avg_tokens) * 100 : 0;

    return c.json({
      success: true,
      data: {
        control: {
          model: control.model,
          prompt_version: control.prompt_version,
          run_count: control.run_count,
          pass_count: control.pass_count,
          pass_rate: control.pass_rate,
          avg_score: control.avg_score,
          avg_latency_ms: control.avg_latency_ms,
          avg_tokens: control.avg_tokens,
        },
        treatment: {
          model: treatment.model,
          prompt_version: treatment.prompt_version,
          run_count: treatment.run_count,
          pass_count: treatment.pass_count,
          pass_rate: treatment.pass_rate,
          avg_score: treatment.avg_score,
          avg_latency_ms: treatment.avg_latency_ms,
          avg_tokens: treatment.avg_tokens,
        },
        comparison: {
          pass_rate: passRateComparison,
          avg_score: avgScoreComparison,
          avg_latency: {
            controlMean: control.avg_latency_ms,
            treatmentMean: treatment.avg_latency_ms,
            delta: latencyDelta,
            deltaPercent: latencyDeltaPercent,
          },
          avg_tokens: {
            controlMean: control.avg_tokens,
            treatmentMean: treatment.avg_tokens,
            delta: tokensDelta,
            deltaPercent: tokensDeltaPercent,
          },
        },
      },
    });
  } catch (error) {
    pinoLogger.error({ err: error }, 'error comparing runs');
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: error instanceof Error ? error.message : String(error),
        },
      },
      400
    );
  }
});
