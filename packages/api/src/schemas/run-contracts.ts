/**
 * Run Contract Schemas (Zod)
 *
 * Request/response schemas for runs (Engine → Runner → n8n) endpoints.
 */

import { z } from '@hono/zod-openapi';

// ============================================================
// Request Schemas
// ============================================================

export const CreateRunRequest = z
  .object({
    project_id: z.string().optional().openapi({ description: 'Project ID to scope the run' }),
    commit_ref: z.string().optional().openapi({ description: 'Commit hash reference' }),
    leaf_id: z
      .string()
      .optional()
      .openapi({ description: 'Reference to an existing Leaf — resolves its output as prompt' }),
    leaf: z
      .object({
        id: z.string(),
        type: z.enum(['deploy', 'deploy_agent', 'eval']),
        content: z.string().optional(),
        rules_ref: z.string().optional(),
      })
      .optional()
      .openapi({ description: 'Inline leaf configuration' }),
    inputs: z
      .record(z.string(), z.unknown())
      .optional()
      .openapi({ description: 'Additional inputs for the run' }),
    workflow: z
      .object({
        type: z.string(),
        webhook_id: z.string().optional(),
      })
      .optional()
      .openapi({ description: 'Workflow configuration (n8n)' }),
    metadata: z
      .object({
        model: z.string().optional(),
        prompt_version: z.string().optional(),
        test_case: z.string().optional(),
      })
      .optional()
      .openapi({ description: 'Metadata for A/B test filtering' }),
  })
  .openapi('CreateRunRequest');

export const IngestRunRequest = z
  .object({
    run_id: z.string().openapi({ description: 'The run ID to update' }),
    runner_run_id: z.string().openapi({ description: 'Runner-assigned run ID' }),
    status: z.enum(['completed', 'failed']).openapi({ description: 'Final run status' }),
    run_report: z.record(z.string(), z.unknown()).optional(),
    assertions: z.array(z.unknown()).optional(),
    eval_metrics: z.record(z.string(), z.unknown()).optional(),
    eval_summary: z.string().optional(),
    evidence_pack: z.record(z.string(), z.unknown()).optional(),
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
      .optional()
      .openapi({ description: 'Trace summary from Runner' }),
    full_trace: z.unknown().optional(),
    metadata: z
      .object({
        model: z.string().optional(),
      })
      .optional()
      .openapi({ description: 'Metadata from n8n callback (actual model used)' }),
  })
  .openapi('IngestRunRequest');

export const UpdateRunRequest = z
  .object({
    title: z.string().max(200).optional().openapi({ description: 'Run title (report asset)' }),
    description: z
      .string()
      .max(2000)
      .optional()
      .openapi({ description: 'Run description (report asset)' }),
    tags: z
      .array(z.string().max(50))
      .max(20)
      .optional()
      .openapi({ description: 'Run tags (report asset)' }),
  })
  .openapi('UpdateRunRequest');

export const CompareRunsRequest = z
  .object({
    control: z.object({
      model: z.string(),
      prompt_version: z.string(),
    }),
    treatment: z.object({
      model: z.string(),
      prompt_version: z.string(),
    }),
    project_id: z.string().optional(),
  })
  .openapi('CompareRunsRequest');

// ============================================================
// Response Schemas
// ============================================================

export const RunCreatedResponse = z
  .object({
    run_id: z.string(),
    status: z.string(),
    runner_run_id: z.string().optional(),
    warning: z.string().optional(),
  })
  .openapi('RunCreatedResponse');

export const RunResponse = z
  .object({
    runId: z.string(),
    projectId: z.string().nullable(),
    runnerRunId: z.string().nullable(),
    commitRef: z.string().nullable(),
    leafId: z.string().nullable(),
    leafJson: z.string().nullable(),
    inputsJson: z.string().nullable(),
    workflowJson: z.string().nullable(),
    status: z.string(),
    resultJson: z.string().nullable(),
    traceSummaryJson: z.string().nullable(),
    fullTraceJson: z.string().nullable(),
    metadataJson: z.string().nullable(),
    title: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    tags: z.unknown().nullable().optional(),
    createdAt: z.unknown(),
    updatedAt: z.unknown(),
  })
  .openapi('RunResponse');

export const RunListResponse = z
  .object({
    runs: z.array(z.unknown()),
    limit: z.number(),
    offset: z.number(),
  })
  .openapi('RunListResponse');

export const RunFiltersResponse = z
  .object({
    models: z.array(z.string()),
    prompt_versions: z.array(z.string()),
  })
  .openapi('RunFiltersResponse');

export const ConfigurationStatsResponse = z
  .object({
    configurations: z.array(z.unknown()),
  })
  .openapi('ConfigurationStatsResponse');

export const CompareRunsResponse = z
  .object({
    control: z.unknown(),
    treatment: z.unknown(),
    comparison: z.unknown(),
  })
  .openapi('CompareRunsResponse');

// ============================================================
// Query Parameter Schemas
// ============================================================

export const ListRunsQuery = z.object({
  project_id: z.string().optional(),
  status: z.enum(['queued', 'running', 'completed', 'failed']).optional(),
  model: z.string().optional(),
  prompt_version: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const ConfigurationsQuery = z.object({
  project_id: z.string().optional(),
});
