import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { type YSchemaValidationRunRecord, yschemaValidationRuns } from '../schema';

export type YSchemaValidationRunStatus = 'pending' | 'running' | 'passed' | 'failed' | 'stale';

export interface CreateYSchemaValidationRunInput {
  project_id: string;
  commit_hash: string;
  schema_name: string;
  schema_version: string;
  schema_hash: string;
  validator_version: string;
  status: YSchemaValidationRunStatus;
  valid: boolean;
  ready: boolean;
  error_count: number;
  gap_count: number;
  fix_count: number;
  result_json: Record<string, unknown>;
  started_at?: Date | null;
  finished_at?: Date | null;
}

export interface YSchemaValidationRunOutput {
  id: string;
  project_id: string;
  commit_hash: string;
  schema_name: string;
  schema_version: string;
  schema_hash: string;
  validator_version: string;
  status: YSchemaValidationRunStatus;
  valid: boolean;
  ready: boolean;
  error_count: number;
  gap_count: number;
  fix_count: number;
  result_json: Record<string, unknown>;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export async function createYSchemaValidationRun(
  db: AnyDB,
  input: CreateYSchemaValidationRunInput
): Promise<YSchemaValidationRunOutput> {
  const now = new Date();
  const [row] = await db
    .insert(yschemaValidationRuns)
    .values({
      id: `ysvr_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
      projectId: input.project_id,
      commitHash: input.commit_hash,
      schemaName: input.schema_name,
      schemaVersion: input.schema_version,
      schemaHash: input.schema_hash,
      validatorVersion: input.validator_version,
      status: input.status,
      valid: input.valid,
      ready: input.ready,
      errorCount: input.error_count,
      gapCount: input.gap_count,
      fixCount: input.fix_count,
      resultJson: input.result_json,
      startedAt: input.started_at ?? now,
      finishedAt: input.finished_at ?? now,
    })
    .returning();

  return rowToOutput(row);
}

export async function findYSchemaValidationRunById(
  db: AnyDB,
  id: string
): Promise<YSchemaValidationRunOutput | null> {
  const [row] = await db
    .select()
    .from(yschemaValidationRuns)
    .where(eq(yschemaValidationRuns.id, id))
    .limit(1);
  return row ? rowToOutput(row) : null;
}

export async function findLatestYSchemaValidationRun(
  db: AnyDB,
  input: {
    project_id: string;
    commit_hash?: string;
    schema_name?: string;
  }
): Promise<YSchemaValidationRunOutput | null> {
  const conditions = [eq(yschemaValidationRuns.projectId, input.project_id)];
  if (input.commit_hash) {
    conditions.push(eq(yschemaValidationRuns.commitHash, input.commit_hash));
  }
  if (input.schema_name) {
    conditions.push(eq(yschemaValidationRuns.schemaName, input.schema_name));
  }

  const [row] = await db
    .select()
    .from(yschemaValidationRuns)
    .where(and(...conditions))
    .orderBy(desc(yschemaValidationRuns.createdAt), desc(yschemaValidationRuns.id))
    .limit(1);

  return row ? rowToOutput(row) : null;
}

function rowToOutput(row: YSchemaValidationRunRecord): YSchemaValidationRunOutput {
  return {
    id: row.id,
    project_id: row.projectId,
    commit_hash: row.commitHash,
    schema_name: row.schemaName,
    schema_version: row.schemaVersion,
    schema_hash: row.schemaHash,
    validator_version: row.validatorVersion,
    status: row.status as YSchemaValidationRunStatus,
    valid: row.valid,
    ready: row.ready,
    error_count: row.errorCount,
    gap_count: row.gapCount,
    fix_count: row.fixCount,
    result_json: row.resultJson,
    created_at: row.createdAt.toISOString(),
    started_at: row.startedAt?.toISOString() ?? null,
    finished_at: row.finishedAt?.toISOString() ?? null,
  };
}
