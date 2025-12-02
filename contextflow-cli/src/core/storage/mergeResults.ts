/**
 * Merge Results CRUD operations
 */

import { getDb } from '../db';
import type { MergeResultRecord } from './types';
import { generateMergeResultId, isoNow } from './utils';

export interface CreateMergeResultInput {
  project_id: string;
  base_commit_hash: string;
  source_commit_hash: string;
  target_commit_hash: string;
  status: 'clean' | 'conflicts';
  auto_merged: unknown[];
  conflicts: unknown[];
}

export function createMergeResult(input: CreateMergeResultInput): MergeResultRecord {
  const db = getDb();
  const merge_result_id = generateMergeResultId();
  const created_at = isoNow();

  const auto_merged_json = JSON.stringify(input.auto_merged);
  const conflicts_json = JSON.stringify(input.conflicts);

  db.prepare(
    `INSERT INTO merge_results
     (merge_result_id, project_id, base_commit_hash, source_commit_hash, target_commit_hash,
      status, auto_merged_json, conflicts_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    merge_result_id,
    input.project_id,
    input.base_commit_hash,
    input.source_commit_hash,
    input.target_commit_hash,
    input.status,
    auto_merged_json,
    conflicts_json,
    created_at
  );

  return {
    merge_result_id,
    project_id: input.project_id,
    base_commit_hash: input.base_commit_hash,
    source_commit_hash: input.source_commit_hash,
    target_commit_hash: input.target_commit_hash,
    status: input.status,
    auto_merged_json,
    conflicts_json,
    created_at,
  };
}

export function getMergeResult(merge_result_id: string): MergeResultRecord | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM merge_results WHERE merge_result_id = ?`)
    .get(merge_result_id) as MergeResultRecord | undefined;
  return row ?? null;
}

export function findMergeResult(
  base_commit_hash: string,
  source_commit_hash: string,
  target_commit_hash: string
): MergeResultRecord | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT * FROM merge_results
       WHERE base_commit_hash = ? AND source_commit_hash = ? AND target_commit_hash = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get(base_commit_hash, source_commit_hash, target_commit_hash) as MergeResultRecord | undefined;
  return row ?? null;
}

export function listMergeResults(
  project_id: string,
  limit = 100,
  offset = 0
): MergeResultRecord[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM merge_results
       WHERE project_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(project_id, limit, offset) as MergeResultRecord[];
}

export function deleteMergeResult(merge_result_id: string): boolean {
  const db = getDb();
  const result = db
    .prepare(`DELETE FROM merge_results WHERE merge_result_id = ?`)
    .run(merge_result_id);
  return result.changes > 0;
}
