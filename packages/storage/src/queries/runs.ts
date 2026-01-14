/**
 * Runs Queries
 *
 * CRUD operations for Engine run records.
 */
import { eq, desc, and, lt, sql, type SQL } from 'drizzle-orm';
import { runs, type Run } from '../schema';
import type { AnyDB } from '../adapters';

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

// ============================================================
// Queries
// ============================================================

/**
 * Insert a new run
 */
export async function insertRun(
  db: AnyDB,
  input: CreateRunInput
): Promise<Run> {
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
export async function getRun(
  db: AnyDB,
  runId: string
): Promise<Run | undefined> {
  const [run] = await db
    .select()
    .from(runs)
    .where(eq(runs.runId, runId))
    .limit(1);

  return run;
}

/**
 * List runs with optional filters
 *
 * v2.1: Added model and prompt_version filters for A/B test comparison
 */
export async function listRuns(
  db: AnyDB,
  options: ListRunsOptions = {}
): Promise<Run[]> {
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

  const query = db
    .select()
    .from(runs)
    .orderBy(desc(runs.createdAt))
    .limit(limit)
    .offset(offset);

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

  const [run] = await db
    .update(runs)
    .set(updateData)
    .where(eq(runs.runId, runId))
    .returning();

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
  const [run] = await db
    .select()
    .from(runs)
    .where(eq(runs.runnerRunId, runnerRunId))
    .limit(1);

  return run;
}

/**
 * Delete run
 */
export async function deleteRun(
  db: AnyDB,
  runId: string
): Promise<boolean> {
  const result = await db
    .delete(runs)
    .where(eq(runs.runId, runId))
    .returning();

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
    .where(
      and(
        eq(runs.status, 'running'),
        lt(runs.updatedAt, cutoffTime)
      )
    );
}

/**
 * Mark a run as timed out
 *
 * @param db - Database instance
 * @param runId - Run ID to mark as timeout
 * @returns Updated run or undefined
 */
export async function markRunAsTimeout(
  db: AnyDB,
  runId: string
): Promise<Run | undefined> {
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
