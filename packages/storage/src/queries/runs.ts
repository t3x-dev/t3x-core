/**
 * Runs Queries
 *
 * CRUD operations for Engine run records.
 */
import { eq, desc, and, type SQL } from 'drizzle-orm';
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
}

export interface UpdateRunInput {
  runner_run_id?: string | null;
  status?: RunStatus;
  result_json?: string | null;
}

export interface ListRunsOptions {
  projectId?: string;
  status?: RunStatus;
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
 */
export async function listRuns(
  db: AnyDB,
  options: ListRunsOptions = {}
): Promise<Run[]> {
  const { projectId, status, limit = 50, offset = 0 } = options;

  const conditions: SQL[] = [];
  if (projectId) {
    conditions.push(eq(runs.projectId, projectId));
  }
  if (status) {
    conditions.push(eq(runs.status, status));
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

  const [run] = await db
    .update(runs)
    .set(updateData)
    .where(eq(runs.runId, runId))
    .returning();

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
