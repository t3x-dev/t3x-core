/**
 * Runs Queries
 *
 * CRUD operations for Engine run records.
 */
import { and, desc, eq, lt, type SQL, sql } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { type Run, runs } from '../schema';

// ============================================================
// Types
// ============================================================

export type RunStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface CreateRunInput {
  run_id: string;
  project_id?: string | null;
  runner_run_id?: string | null;
  commit_ref?: string | null;
  leaf_json?: string | null;
  inputs_json?: string | null;
  workflow_json?: string | null;
  status?: RunStatus;
  result_json?: string | null;
  // v2.0: Trace storage fields
  trace_summary_json?: string | null;
  trace_policy?: string | null;
  full_trace_json?: string | null;
  // v2.1: Metadata for A/B test filtering
  metadata_json?: string | null;
}

export interface UpdateRunInput {
  runner_run_id?: string | null;
  status?: RunStatus;
  result_json?: string | null;
  // v2.0: Trace storage fields
  trace_summary_json?: string | null;
  full_trace_json?: string | null;
  // v2.1: Metadata for A/B test filtering
  metadata_json?: string | null;
}

export interface ListRunsOptions {
  projectId?: string;
  status?: RunStatus;
  // v2.1: Metadata filters for A/B test
  model?: string;
  prompt_version?: string;
  limit?: number;
  offset?: number;
}

// v2.2: Configuration stats for A/B test comparison
export interface ConfigurationStats {
  model: string; // 模型名称
  prompt_version: string; // prompt 版本
  run_count: number; // 运行次数（样本量）
  pass_count: number; // 通过次数
  pass_rate: number; // 通过率 (0-1)
  avg_score: number; // 平均得分
  avg_latency_ms: number; // 平均延迟
  avg_tokens: number; // 平均 token 数
  scores: number[]; // 原始得分数组（用于 t-test）
  latencies: number[]; // 原始延迟数组
}

// ============================================================
// Queries
// ============================================================

/**
 * Insert a new run
 */
export async function insertRun(db: AnyDB, input: CreateRunInput): Promise<Run> {
  const now = new Date().toISOString();

  const [run] = await db
    .insert(runs)
    .values({
      runId: input.run_id,
      projectId: input.project_id || null,
      runnerRunId: input.runner_run_id || null,
      commitRef: input.commit_ref || null,
      leafJson: input.leaf_json || null,
      inputsJson: input.inputs_json || null,
      workflowJson: input.workflow_json || null,
      status: input.status || 'queued',
      resultJson: input.result_json || null,
      // v2.0: Trace storage fields
      traceSummaryJson: input.trace_summary_json || null,
      tracePolicy: input.trace_policy || null,
      fullTraceJson: input.full_trace_json || null,
      // v2.1: Metadata for A/B test filtering
      metadataJson: input.metadata_json || null,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    })
    .returning();

  return run;
}

/**
 * Find run by ID
 */
export async function getRun(db: AnyDB, runId: string): Promise<Run | undefined> {
  const [run] = await db.select().from(runs).where(eq(runs.runId, runId)).limit(1);

  return run;
}

/**
 * List runs with optional filters
 *
 * v2.1: Added model and prompt_version filters for A/B test comparison
 */
export async function listRuns(db: AnyDB, options: ListRunsOptions = {}): Promise<Run[]> {
  const { projectId, status, model, prompt_version, limit = 50, offset = 0 } = options;

  const conditions: SQL[] = [];
  if (projectId) {
    conditions.push(eq(runs.projectId, projectId));
  }
  if (status) {
    conditions.push(eq(runs.status, status));
  }
  // v2.1: Metadata JSON filters
  if (model) {
    conditions.push(sql`${runs.metadataJson}::jsonb->>'model' = ${model}`);
  }
  if (prompt_version) {
    conditions.push(sql`${runs.metadataJson}::jsonb->>'prompt_version' = ${prompt_version}`);
  }

  const query = db.select().from(runs).orderBy(desc(runs.createdAt)).limit(limit).offset(offset);

  if (conditions.length > 0) {
    return query.where(and(...conditions));
  }

  return query;
}

/**
 * Update run
 */
export async function updateRun(
  db: AnyDB,
  runId: string,
  input: UpdateRunInput
): Promise<Run | undefined> {
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (input.runner_run_id !== undefined) {
    updateData.runnerRunId = input.runner_run_id;
  }
  if (input.status !== undefined) {
    updateData.status = input.status;
  }
  if (input.result_json !== undefined) {
    updateData.resultJson = input.result_json;
  }
  // v2.0: Trace storage fields
  if (input.trace_summary_json !== undefined) {
    updateData.traceSummaryJson = input.trace_summary_json;
  }
  if (input.full_trace_json !== undefined) {
    updateData.fullTraceJson = input.full_trace_json;
  }
  // v2.1: Metadata for A/B test filtering
  if (input.metadata_json !== undefined) {
    updateData.metadataJson = input.metadata_json;
  }

  const [run] = await db.update(runs).set(updateData).where(eq(runs.runId, runId)).returning();

  return run;
}

/**
 * Find run by runner_run_id
 *
 * Used by Runner to look up run details when receiving n8n callback.
 */
export async function getRunByRunnerRunId(
  db: AnyDB,
  runnerRunId: string
): Promise<Run | undefined> {
  const [run] = await db.select().from(runs).where(eq(runs.runnerRunId, runnerRunId)).limit(1);

  return run;
}

/**
 * Delete run
 */
export async function deleteRun(db: AnyDB, runId: string): Promise<boolean> {
  const result = await db.delete(runs).where(eq(runs.runId, runId)).returning();

  return result.length > 0;
}

/**
 * Find runs that have been in 'running' status for too long
 *
 * Used by Engine to detect and mark timed-out runs.
 *
 * @param db - Database instance
 * @param timeoutMs - Timeout threshold in milliseconds (default: 5 minutes)
 * @returns List of timed-out runs
 */
export async function getTimedOutRuns(
  db: AnyDB,
  timeoutMs: number = 5 * 60 * 1000
): Promise<Run[]> {
  const cutoffTime = new Date(Date.now() - timeoutMs);

  return db
    .select()
    .from(runs)
    .where(and(eq(runs.status, 'running'), lt(runs.updatedAt, cutoffTime)));
}

/**
 * Mark a run as timed out
 *
 * @param db - Database instance
 * @param runId - Run ID to mark as timeout
 * @returns Updated run or undefined
 */
export async function markRunAsTimeout(db: AnyDB, runId: string): Promise<Run | undefined> {
  const [run] = await db
    .update(runs)
    .set({
      status: 'failed',
      resultJson: JSON.stringify({
        error: {
          code: 'TIMEOUT',
          message: 'Run timed out waiting for n8n callback',
        },
      }),
      updatedAt: new Date(),
    })
    .where(eq(runs.runId, runId))
    .returning();

  return run;
}

/**
 * Get unique filter options for runs
 *
 * v2.1: Returns distinct model and prompt_version values from metadata
 * for populating filter dropdowns in the UI.
 *
 * @param db - Database instance
 * @returns Object containing arrays of unique models and prompt_versions
 */
export async function getRunFilterOptions(
  db: AnyDB
): Promise<{ models: string[]; prompt_versions: string[] }> {
  // Get distinct models
  const modelResults = await db
    .selectDistinct({
      model: sql<string>`${runs.metadataJson}::jsonb->>'model'`,
    })
    .from(runs)
    .where(sql`${runs.metadataJson}::jsonb->>'model' IS NOT NULL`);

  // Get distinct prompt_versions
  const promptResults = await db
    .selectDistinct({
      prompt_version: sql<string>`${runs.metadataJson}::jsonb->>'prompt_version'`,
    })
    .from(runs)
    .where(sql`${runs.metadataJson}::jsonb->>'prompt_version' IS NOT NULL`);

  return {
    models: modelResults.map((r) => r.model).filter(Boolean),
    prompt_versions: promptResults.map((r) => r.prompt_version).filter(Boolean),
  };
}

/**
 * Get configuration stats grouped by model + prompt_version
 *
 * v2.2: Aggregates run data for A/B test comparison.
 * Returns statistics for each unique (model, prompt_version) combination.
 *
 * @param db - Database instance
 * @param projectId - Optional project ID filter
 * @returns Array of configuration stats
 */
export async function getConfigurationStats(
  db: AnyDB,
  projectId?: string
): Promise<ConfigurationStats[]> {
  // Get all finished runs (completed or failed) with metadata
  // Note: 'failed' status means eval failed (score < threshold), not execution error
  const conditions: SQL[] = [
    sql`${runs.status} IN ('completed', 'failed')`,
    sql`${runs.metadataJson} IS NOT NULL`,
    sql`${runs.metadataJson}::jsonb->>'model' IS NOT NULL`,
    sql`${runs.metadataJson}::jsonb->>'prompt_version' IS NOT NULL`,
  ];

  if (projectId) {
    conditions.push(eq(runs.projectId, projectId));
  }

  const allRuns = await db
    .select()
    .from(runs)
    .where(and(...conditions));

  // Group runs by model + prompt_version
  const groups = new Map<
    string,
    {
      model: string;
      prompt_version: string;
      runs: typeof allRuns;
    }
  >();

  for (const run of allRuns) {
    const metadata = JSON.parse(run.metadataJson || '{}');
    const model = metadata.model || 'unknown';
    const prompt_version = metadata.prompt_version || 'unknown';
    const key = `${model}::${prompt_version}`;

    if (!groups.has(key)) {
      groups.set(key, { model, prompt_version, runs: [] });
    }
    groups.get(key)!.runs.push(run);
  }

  // Calculate stats for each group
  const stats: ConfigurationStats[] = [];

  for (const group of groups.values()) {
    const { model, prompt_version, runs: groupRuns } = group;

    // Parse result data from each run
    const scores: number[] = [];
    const latencies: number[] = [];
    const tokens: number[] = [];
    let passCount = 0;

    for (const run of groupRuns) {
      // Parse result JSON for score and passed status
      if (run.resultJson) {
        try {
          const result = JSON.parse(run.resultJson);
          // v2.2 fix: Get score from run_report.eval_result.score (actual data structure)
          const evalResult = result.run_report?.eval_result;
          const score =
            evalResult?.score ??
            result.eval_metrics?.overall_score ??
            result.run_report?.overall_score ??
            result.overall_score;
          if (typeof score === 'number') {
            scores.push(score);
          }
          // Use eval_result.passed if available, otherwise fallback to score >= 0.6
          const passed = evalResult?.passed ?? (typeof score === 'number' && score >= 0.6);
          if (passed) passCount++;
        } catch {
          // Ignore parse errors
        }
      }

      // Parse trace summary for latency and tokens
      if (run.traceSummaryJson) {
        try {
          const trace = JSON.parse(run.traceSummaryJson);
          if (typeof trace.latency_ms === 'number') {
            latencies.push(trace.latency_ms);
          }
          if (typeof trace.tokens?.total_tokens === 'number') {
            tokens.push(trace.tokens.total_tokens);
          }
        } catch {
          // Ignore parse errors
        }
      }
    }

    const runCount = groupRuns.length;
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const avgLatency =
      latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
    const avgTokens = tokens.length > 0 ? tokens.reduce((a, b) => a + b, 0) / tokens.length : 0;

    stats.push({
      model,
      prompt_version,
      run_count: runCount,
      pass_count: passCount,
      pass_rate: runCount > 0 ? passCount / runCount : 0,
      avg_score: avgScore,
      avg_latency_ms: avgLatency,
      avg_tokens: avgTokens,
      scores,
      latencies,
    });
  }

  return stats;
}
