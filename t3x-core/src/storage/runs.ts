/**
 * Runs CRUD operations
 *
 * Engine run management for the T3X → Runner → n8n → Runner → T3X flow.
 */

import { randomUUID } from 'crypto';
import { getDb } from '../db';
import { isoNow } from './utils';

// === Types ===

export type RunStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface RunRecord {
  run_id: string;
  project_id: string | null;
  runner_run_id: string | null;
  commit_ref: string | null;
  leaf_json: string | null;
  inputs_json: string | null;
  workflow_json: string | null;
  status: RunStatus;
  result_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeafInput {
  id: string;
  type: 'deploy' | 'eval';
  content?: string;
}

export interface WorkflowInput {
  type: string;
  webhook_id?: string;
}

export interface CreateRunInput {
  project_id?: string;
  commit_ref?: string;
  leaf?: LeafInput;
  inputs?: Record<string, unknown>;
  workflow?: WorkflowInput;
}

export interface UpdateRunInput {
  runner_run_id?: string;
  status?: RunStatus;
  result?: {
    run_report?: Record<string, unknown>;
    assertions?: unknown[];
    evidence_pack?: Record<string, unknown>;
  };
}

export interface ListRunsOptions {
  project_id?: string;
  status?: RunStatus;
  limit?: number;
  offset?: number;
}

// === ID Generation ===

export function generateRunId(): string {
  return `run_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

// === CRUD Functions ===

export async function createRun(input: CreateRunInput): Promise<RunRecord> {
  const db = getDb();
  const run_id = generateRunId();
  const now = isoNow();

  const leaf_json = input.leaf ? JSON.stringify(input.leaf) : null;
  const inputs_json = input.inputs ? JSON.stringify(input.inputs) : null;
  const workflow_json = input.workflow ? JSON.stringify(input.workflow) : null;

  await db.prepare(
    `INSERT INTO runs (run_id, project_id, commit_ref, leaf_json, inputs_json, workflow_json, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    run_id,
    input.project_id ?? null,
    input.commit_ref ?? null,
    leaf_json,
    inputs_json,
    workflow_json,
    'queued',
    now,
    now
  );

  return {
    run_id,
    project_id: input.project_id ?? null,
    runner_run_id: null,
    commit_ref: input.commit_ref ?? null,
    leaf_json,
    inputs_json,
    workflow_json,
    status: 'queued',
    result_json: null,
    created_at: now,
    updated_at: now,
  };
}

export async function getRun(run_id: string): Promise<RunRecord | null> {
  const db = getDb();
  const row = await db
    .prepare(`SELECT * FROM runs WHERE run_id = ?`)
    .get(run_id) as RunRecord | undefined;
  return row ?? null;
}

export async function listRuns(options: ListRunsOptions = {}): Promise<RunRecord[]> {
  const db = getDb();
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  let sql = `SELECT * FROM runs`;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.project_id) {
    conditions.push(`project_id = ?`);
    params.push(options.project_id);
  }

  if (options.status) {
    conditions.push(`status = ?`);
    params.push(options.status);
  }

  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }

  sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  return await db.prepare(sql).all(...params) as RunRecord[];
}

export async function updateRun(
  run_id: string,
  updates: UpdateRunInput
): Promise<RunRecord | null> {
  const db = getDb();
  const existing = await getRun(run_id);
  if (!existing) return null;

  const now = isoNow();
  const setClauses: string[] = [`updated_at = ?`];
  const params: unknown[] = [now];

  if (updates.runner_run_id !== undefined) {
    setClauses.push(`runner_run_id = ?`);
    params.push(updates.runner_run_id);
  }

  if (updates.status !== undefined) {
    setClauses.push(`status = ?`);
    params.push(updates.status);
  }

  if (updates.result !== undefined) {
    setClauses.push(`result_json = ?`);
    params.push(JSON.stringify(updates.result));
  }

  params.push(run_id);

  await db.prepare(
    `UPDATE runs SET ${setClauses.join(', ')} WHERE run_id = ?`
  ).run(...params);

  return await getRun(run_id);
}

export async function deleteRun(run_id: string): Promise<boolean> {
  const db = getDb();
  const result = await db
    .prepare(`DELETE FROM runs WHERE run_id = ?`)
    .run(run_id);
  return result.changes > 0;
}
