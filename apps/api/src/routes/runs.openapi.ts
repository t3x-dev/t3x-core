/**
 * Runs Routes with OpenAPI
 *
 * Engine → Runner → n8n workflow orchestration.
 *
 * Endpoints:
 * - POST   /v1/runs               - Create and trigger a run
 * - POST   /v1/runs/ingest        - Receive results from Runner
 * - GET    /v1/runs               - List runs
 * - GET    /v1/runs/by-runner-id/:runnerRunId - Get run by runner_run_id
 * - GET    /v1/runs/filters       - Get available filter options
 * - GET    /v1/runs/configurations - Get aggregated configuration stats
 * - GET    /v1/runs/:id           - Get a specific run
 * - DELETE /v1/runs/:id           - Delete a specific run
 * - PATCH  /v1/runs/:id           - Update run metadata (report asset)
 * - POST   /v1/runs/compare       - A/B test comparison
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
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
} from '@t3x-dev/storage';
import { randomUUID } from 'crypto';
import { twoProportionZTest, twoSampleTTest } from '../lib/ab-test';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { webhookDispatcher } from '../lib/webhook-dispatcher';
import { pinoLogger } from '../middleware/logger';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';
import {
  CompareRunsRequest,
  CompareRunsResponse,
  ConfigurationStatsResponse,
  ConfigurationsQuery,
  CreateRunRequest,
  IngestRunRequest,
  ListRunsQuery,
  RunCreatedResponse,
  RunFiltersResponse,
  RunListResponse,
  UpdateRunRequest,
} from '../schemas/run-contracts';

// Runner URL (t3x-runner service)
const RUNNER_URL = process.env.RUNNER_URL || 'http://t3x-runner:8080';

// This Engine's callback URL for Runner to call back
const ENGINE_CALLBACK_URL =
  process.env.ENGINE_CALLBACK_URL || 'http://t3x-api:8000/api/v1/runs/ingest';

// Runner's callback URL for n8n to call back
const RUNNER_CALLBACK_URL =
  process.env.RUNNER_CALLBACK_URL || 'http://t3x-runner:8080/callbacks/n8n';

export const runsRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// POST /v1/runs — Create and trigger a run
// ============================================================

const createRunRoute = createRoute({
  method: 'post',
  path: '/v1/runs',
  tags: ['Runner'],
  summary: 'Create and trigger a run',
  description:
    'Creates a new evaluation run and forwards it to the Runner service (Engine → Runner → n8n).',
  request: {
    body: {
      content: { 'application/json': { schema: CreateRunRequest } },
    },
  },
  responses: {
    200: {
      description: 'Run created',
      content: { 'application/json': { schema: SuccessResponseSchema(RunCreatedResponse) } },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

runsRoutes.openapi(createRunRoute, async (c) => {
  try {
    const input = c.req.valid('json');
    const run_id = `run_${randomUUID().slice(0, 8)}`;
    const db = await getDB();

    if (input.project_id) {
      const project = await findProjectById(db, input.project_id);
      if (!project) {
        return c.json(
          {
            success: false as const,
            error: { code: 'PROJECT_NOT_FOUND', message: `Project ${input.project_id} not found` },
          },
          400
        );
      }
    }

    let resolvedLeaf = input.leaf;
    const leafId: string | null = input.leaf_id || null;

    if (input.leaf_id) {
      const leaf = await findLeafById(db, input.leaf_id);
      if (!leaf) {
        return c.json(
          {
            success: false as const,
            error: { code: 'LEAF_NOT_FOUND', message: `Leaf ${input.leaf_id} not found` },
          },
          400
        );
      }
      if (!leaf.output) {
        return c.json(
          {
            success: false as const,
            error: {
              code: 'NO_OUTPUT',
              message: `Leaf ${input.leaf_id} has no generated output yet`,
            },
          },
          400
        );
      }
      resolvedLeaf = {
        id: input.leaf?.id || leaf.id,
        type: input.leaf?.type || 'deploy',
        content: leaf.output,
        rules_ref: input.leaf?.rules_ref,
      };
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
      metadata_json: input.metadata ? JSON.stringify(input.metadata) : null,
    });

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

        if (runner_run_id) {
          await updateRun(db, run_id, { runner_run_id, status: 'running' });
        }
      } else {
        const errorText = await runnerResponse.text();
        warning = `Runner returned ${runnerResponse.status}: ${errorText}`;
      }
    } catch (err) {
      warning = `Failed to reach Runner: ${err instanceof Error ? err.message : String(err)}`;
    }

    return c.json({
      success: true as const,
      data: {
        run_id,
        status: runner_run_id ? 'running' : 'queued',
        runner_run_id,
        warning,
      },
    });
  } catch (error) {
    return c.json(
      {
        success: false as const,
        error: {
          code: 'INVALID_REQUEST',
          message: error instanceof Error ? error.message : String(error),
        },
      },
      400
    );
  }
});

// ============================================================
// POST /v1/runs/ingest — Receive results from Runner
// ============================================================

const ingestRunRoute = createRoute({
  method: 'post',
  path: '/v1/runs/ingest',
  tags: ['Runner'],
  summary: 'Ingest run results from Runner',
  description: 'Receives callback results from the Runner service after an n8n workflow completes.',
  request: {
    body: {
      content: { 'application/json': { schema: IngestRunRequest } },
    },
  },
  responses: {
    200: {
      description: 'Results ingested',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.object({ ok: z.boolean() })),
        },
      },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

runsRoutes.openapi(ingestRunRoute, async (c) => {
  // Authenticate runner callback: check shared secret if RUNNER_SECRET is configured.
  // If RUNNER_SECRET is not set, allow the request for backward compatibility (local dev) but warn.
  const runnerSecret = process.env.RUNNER_SECRET;
  if (runnerSecret) {
    const authHeader = c.req.header('Authorization');
    const customHeader = c.req.header('X-Runner-Secret');
    const providedSecret =
      customHeader ?? (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined);
    if (providedSecret !== runnerSecret) {
      return c.json(
        {
          success: false as const,
          error: { code: 'UNAUTHORIZED', message: 'Invalid or missing runner secret' },
        },
        401
      );
    }
  } else {
    // No secret configured — log a warning but allow for local dev
    pinoLogger.warn('RUNNER_SECRET is not set. /v1/runs/ingest endpoint is unauthenticated.');
  }

  try {
    const data = c.req.valid('json');
    const db = await getDB();

    let mergedMetadataJson: string | null = null;
    if (data.metadata) {
      const existingRun = await getRun(db, data.run_id);
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
      trace_summary_json: data.trace_summary ? JSON.stringify(data.trace_summary) : null,
      full_trace_json: data.full_trace ? JSON.stringify(data.full_trace) : null,
      ...(mergedMetadataJson && { metadata_json: mergedMetadataJson }),
    });

    // Fire webhook event (fire-and-forget)
    const eventType = data.status === 'completed' ? 'run.completed' : 'run.failed';
    webhookDispatcher.dispatch(eventType, {
      run_id: data.run_id,
      runner_run_id: data.runner_run_id,
      status: data.status,
    });

    // Write back assertions to Leaf + create history snapshot
    const run = await getRun(db, data.run_id);
    const leafId = run?.leafId as string | null;

    if (leafId && data.assertions && data.assertions.length > 0) {
      try {
        const mappedAssertions = data.assertions.map((a: unknown, idx: number) => {
          const raw = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>;
          return {
            id: typeof raw.id === 'string' ? raw.id : `assert_${String(idx).padStart(3, '0')}`,
            constraint_id:
              typeof raw.constraint_id === 'string' && raw.constraint_id !== ''
                ? raw.constraint_id
                : `eval_${idx}`,
            passed: typeof raw.passed === 'boolean' ? raw.passed : raw.type === 'pass', // fallback: old format 'type' field
            details:
              typeof raw.details === 'string' && raw.details !== ''
                ? raw.details
                : typeof raw.message === 'string'
                  ? raw.message
                  : '', // fallback: old 'message'
            lesson:
              typeof raw.lesson === 'string'
                ? raw.lesson
                : typeof raw.patch_suggestion === 'string'
                  ? raw.patch_suggestion
                  : undefined,
          };
        });

        await updateLeafRunnerAssertions(db, leafId, mappedAssertions);

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
      } catch (writeBackErr) {
        // Non-fatal: log but don't fail the ingest
        pinoLogger.warn(
          { err: writeBackErr, run_id: data.run_id, leaf_id: leafId },
          'Failed to write back assertions to leaf'
        );
      }
    }

    return c.json({ success: true as const, data: { ok: true } });
  } catch (error) {
    return c.json(
      {
        success: false as const,
        error: {
          code: 'INVALID_REQUEST',
          message: error instanceof Error ? error.message : String(error),
        },
      },
      400
    );
  }
});

// ============================================================
// GET /v1/runs — List runs
// ============================================================

const listRunsRoute = createRoute({
  method: 'get',
  path: '/v1/runs',
  tags: ['Runner'],
  summary: 'List runs',
  description: 'List evaluation runs with optional filters for A/B test comparison.',
  request: {
    query: ListRunsQuery,
  },
  responses: {
    200: {
      description: 'List of runs',
      content: { 'application/json': { schema: SuccessResponseSchema(RunListResponse) } },
    },
    500: {
      description: 'Internal error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

runsRoutes.openapi(listRunsRoute, async (c) => {
  try {
    const { project_id, status, model, prompt_version, limit, offset } = c.req.valid('query');
    const db = await getDB();
    const result = await listRuns(db, {
      projectId: project_id,
      status: status as 'queued' | 'running' | 'completed' | 'failed' | undefined,
      model,
      prompt_version,
      limit,
      offset,
    });

    return c.json({
      success: true as const,
      data: { runs: result, limit, offset },
    });
  } catch (error) {
    return errorResponse(
      c,
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : String(error)
    );
  }
});

// ============================================================
// GET /v1/runs/by-runner-id/:runnerRunId
// ============================================================

const getRunByRunnerIdRoute = createRoute({
  method: 'get',
  path: '/v1/runs/by-runner-id/{runnerRunId}',
  tags: ['Runner'],
  summary: 'Get run by runner_run_id',
  description: 'Used by Runner to look up run details when receiving n8n callback.',
  request: {
    params: z.object({
      runnerRunId: z.string().min(1),
    }),
  },
  responses: {
    200: {
      description: 'Run found',
      content: { 'application/json': { schema: SuccessResponseSchema(z.unknown()) } },
    },
    404: {
      description: 'Run not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

runsRoutes.openapi(getRunByRunnerIdRoute, async (c) => {
  try {
    const { runnerRunId } = c.req.valid('param');
    const db = await getDB();
    const run = await getRunByRunnerRunId(db, runnerRunId);

    if (!run) {
      return errorResponse(c, 'NOT_FOUND', `Run not found for runner_run_id: ${runnerRunId}`);
    }

    return c.json({ success: true as const, data: run });
  } catch (error) {
    return errorResponse(
      c,
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : String(error)
    );
  }
});

// ============================================================
// GET /v1/runs/filters — Available filter options
// ============================================================

const getRunFiltersRoute = createRoute({
  method: 'get',
  path: '/v1/runs/filters',
  tags: ['Runner'],
  summary: 'Get run filter options',
  description: 'Returns distinct model and prompt_version values for filter dropdowns.',
  responses: {
    200: {
      description: 'Filter options',
      content: { 'application/json': { schema: SuccessResponseSchema(RunFiltersResponse) } },
    },
    500: {
      description: 'Internal error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

runsRoutes.openapi(getRunFiltersRoute, async (c) => {
  try {
    const db = await getDB();
    const options = await getRunFilterOptions(db);
    return c.json({ success: true as const, data: options });
  } catch (error) {
    return errorResponse(
      c,
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : String(error)
    );
  }
});

// ============================================================
// GET /v1/runs/configurations — Aggregated stats
// ============================================================

const getConfigurationsRoute = createRoute({
  method: 'get',
  path: '/v1/runs/configurations',
  tags: ['Runner'],
  summary: 'Get configuration stats',
  description:
    'Returns aggregated statistics grouped by model + prompt_version for A/B test configuration selection.',
  request: {
    query: ConfigurationsQuery,
  },
  responses: {
    200: {
      description: 'Configuration stats',
      content: {
        'application/json': { schema: SuccessResponseSchema(ConfigurationStatsResponse) },
      },
    },
    500: {
      description: 'Internal error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

runsRoutes.openapi(getConfigurationsRoute, async (c) => {
  try {
    const { project_id } = c.req.valid('query');
    const db = await getDB();
    const configurations = await getConfigurationStats(db, project_id || undefined);
    return c.json({ success: true as const, data: { configurations } });
  } catch (error) {
    return errorResponse(
      c,
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : String(error)
    );
  }
});

// ============================================================
// GET /v1/runs/:id — Get specific run
// ============================================================

const getRunRoute = createRoute({
  method: 'get',
  path: '/v1/runs/{id}',
  tags: ['Runner'],
  summary: 'Get a specific run',
  description: 'Returns full details of a specific evaluation run by ID.',
  request: {
    params: z.object({ id: z.string().min(1) }),
  },
  responses: {
    200: {
      description: 'Run details',
      content: { 'application/json': { schema: SuccessResponseSchema(z.unknown()) } },
    },
    404: {
      description: 'Run not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

runsRoutes.openapi(getRunRoute, async (c) => {
  try {
    const { id } = c.req.valid('param');
    const db = await getDB();
    const run = await getRun(db, id);

    if (!run) {
      return errorResponse(c, 'NOT_FOUND', `Run not found: ${id}`);
    }

    return c.json({ success: true as const, data: run });
  } catch (error) {
    return errorResponse(
      c,
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : String(error)
    );
  }
});

// ============================================================
// DELETE /v1/runs/:id — Delete a run
// ============================================================

const deleteRunRoute = createRoute({
  method: 'delete',
  path: '/v1/runs/{id}',
  tags: ['Runner'],
  summary: 'Delete a run',
  description: 'Permanently deletes an evaluation run.',
  request: {
    params: z.object({ id: z.string().min(1) }),
  },
  responses: {
    200: {
      description: 'Run deleted',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.object({ deleted: z.boolean() })),
        },
      },
    },
    404: {
      description: 'Run not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

runsRoutes.openapi(deleteRunRoute, async (c) => {
  try {
    const { id } = c.req.valid('param');
    const db = await getDB();
    const { deleteRun } = await import('@t3x-dev/storage');
    const deleted = await deleteRun(db, id);

    if (!deleted) {
      return errorResponse(c, 'NOT_FOUND', `Run not found: ${id}`);
    }

    return c.json({ success: true as const, data: { deleted: true } });
  } catch (error) {
    return errorResponse(
      c,
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : String(error)
    );
  }
});

// ============================================================
// PATCH /v1/runs/:id — Update run metadata (report asset)
// ============================================================

const updateRunRoute = createRoute({
  method: 'patch',
  path: '/v1/runs/{id}',
  tags: ['Runner'],
  summary: 'Update run metadata',
  description: 'Update run title, description, and tags. Used for marking runs as report assets.',
  request: {
    params: z.object({ id: z.string().min(1) }),
    body: {
      content: { 'application/json': { schema: UpdateRunRequest } },
    },
  },
  responses: {
    200: {
      description: 'Run updated',
      content: { 'application/json': { schema: SuccessResponseSchema(z.unknown()) } },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Run not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

runsRoutes.openapi(updateRunRoute, async (c) => {
  try {
    const { id } = c.req.valid('param');
    const input = c.req.valid('json');

    if (input.title === undefined && input.description === undefined && input.tags === undefined) {
      return c.json(
        {
          success: false as const,
          error: {
            code: 'INVALID_REQUEST',
            message: 'At least one field (title, description, tags) must be provided',
          },
        },
        400
      );
    }

    const db = await getDB();
    const existing = await getRun(db, id);
    if (!existing) {
      return errorResponse(c, 'NOT_FOUND', `Run not found: ${id}`);
    }

    const updated = await updateRun(db, id, {
      title: input.title,
      description: input.description,
      tags: input.tags,
    });

    return c.json({ success: true as const, data: updated });
  } catch (error) {
    return errorResponse(
      c,
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : String(error)
    );
  }
});

// ============================================================
// POST /v1/runs/compare — A/B test comparison
// ============================================================

const compareRunsRoute = createRoute({
  method: 'post',
  path: '/v1/runs/compare',
  tags: ['Runner'],
  summary: 'Compare two configurations (A/B test)',
  description:
    'Performs statistical comparison between control and treatment configurations using Z-test and T-test.',
  request: {
    body: {
      content: { 'application/json': { schema: CompareRunsRequest } },
    },
  },
  responses: {
    200: {
      description: 'Comparison results',
      content: { 'application/json': { schema: SuccessResponseSchema(CompareRunsResponse) } },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Configuration not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

runsRoutes.openapi(compareRunsRoute, async (c) => {
  try {
    const input = c.req.valid('json');
    const db = await getDB();
    const allStats = await getConfigurationStats(db, input.project_id || undefined);

    const control = allStats.find(
      (s) => s.model === input.control.model && s.prompt_version === input.control.prompt_version
    );
    const treatment = allStats.find(
      (s) =>
        s.model === input.treatment.model && s.prompt_version === input.treatment.prompt_version
    );

    if (!control) {
      return errorResponse(
        c,
        'NOT_FOUND',
        `Control configuration not found: ${input.control.model}/${input.control.prompt_version}`
      );
    }

    if (!treatment) {
      return errorResponse(
        c,
        'NOT_FOUND',
        `Treatment configuration not found: ${input.treatment.model}/${input.treatment.prompt_version}`
      );
    }

    const passRateComparison = twoProportionZTest(
      control.pass_count,
      control.run_count,
      treatment.pass_count,
      treatment.run_count
    );

    const avgScoreComparison = twoSampleTTest(control.scores, treatment.scores);

    const latencyDelta = treatment.avg_latency_ms - control.avg_latency_ms;
    const latencyDeltaPercent =
      control.avg_latency_ms > 0 ? (latencyDelta / control.avg_latency_ms) * 100 : 0;

    const tokensDelta = treatment.avg_tokens - control.avg_tokens;
    const tokensDeltaPercent =
      control.avg_tokens > 0 ? (tokensDelta / control.avg_tokens) * 100 : 0;

    return c.json({
      success: true as const,
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
    return c.json(
      {
        success: false as const,
        error: {
          code: 'INVALID_REQUEST',
          message: error instanceof Error ? error.message : String(error),
        },
      },
      400
    );
  }
});
