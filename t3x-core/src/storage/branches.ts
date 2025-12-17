/**
 * Branches CRUD operations
 */

import { getDb } from '../db';
import type {
  BranchRecord,
  CreateBranchInput,
  ListBranchesOptions,
} from './types';
import { generateBranchId, isoNow } from './utils';

export async function createBranch(input: CreateBranchInput): Promise<BranchRecord> {
  const db = getDb();
  const branch_id = generateBranchId();
  const now = isoNow();

  // Check if this is the first branch for the project
  const existingBranches = await db
    .prepare(`SELECT CAST(COUNT(*) AS INTEGER) as c FROM branches WHERE project_id = ?`)
    .get(input.project_id) as { c: number };

  const is_current = existingBranches.c === 0 ? 1 : 0;

  // If parent branch specified, get its head commit
  let head_commit_hash: string | null = null;
  if (input.parent_branch) {
    const parentBranch = await db
      .prepare(`SELECT head_commit_hash FROM branches WHERE project_id = ? AND name = ?`)
      .get(input.project_id, input.parent_branch) as { head_commit_hash: string | null } | undefined;
    head_commit_hash = parentBranch?.head_commit_hash ?? null;
  }

  await db.prepare(
    `INSERT INTO branches
     (branch_id, project_id, name, parent_branch, head_commit_hash, description, is_current, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    branch_id,
    input.project_id,
    input.name,
    input.parent_branch ?? null,
    head_commit_hash,
    input.description ?? null,
    is_current,
    now,
    now
  );

  return {
    branch_id,
    project_id: input.project_id,
    name: input.name,
    parent_branch: input.parent_branch ?? null,
    head_commit_hash,
    description: input.description ?? null,
    is_current,
    created_at: now,
    updated_at: now,
  };
}

export async function getBranch(project_id: string, name: string): Promise<BranchRecord | null> {
  const db = getDb();
  const row = await db
    .prepare(`SELECT * FROM branches WHERE project_id = ? AND name = ?`)
    .get(project_id, name) as BranchRecord | undefined;
  return row ?? null;
}

export async function getBranchById(branch_id: string): Promise<BranchRecord | null> {
  const db = getDb();
  const row = await db
    .prepare(`SELECT * FROM branches WHERE branch_id = ?`)
    .get(branch_id) as BranchRecord | undefined;
  return row ?? null;
}

export async function listBranches(options: ListBranchesOptions): Promise<BranchRecord[]> {
  const db = getDb();
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  return await db
    .prepare(
      `SELECT * FROM branches
       WHERE project_id = ?
       ORDER BY is_current DESC, updated_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(options.project_id, limit, offset) as BranchRecord[];
}

export async function getCurrentBranch(project_id: string): Promise<BranchRecord | null> {
  const db = getDb();
  const row = await db
    .prepare(`SELECT * FROM branches WHERE project_id = ? AND is_current = 1`)
    .get(project_id) as BranchRecord | undefined;
  return row ?? null;
}

export async function switchBranch(project_id: string, branch_name: string): Promise<BranchRecord | null> {
  const db = getDb();

  const branch = await getBranch(project_id, branch_name);
  if (!branch) return null;

  const now = isoNow();

  // Unset current on all branches
  await db.prepare(
    `UPDATE branches SET is_current = 0, updated_at = ? WHERE project_id = ?`
  ).run(now, project_id);

  // Set current on target branch
  await db.prepare(
    `UPDATE branches SET is_current = 1, updated_at = ? WHERE project_id = ? AND name = ?`
  ).run(now, project_id, branch_name);

  return await getBranch(project_id, branch_name);
}

export async function updateBranchHead(
  project_id: string,
  branch_name: string,
  commit_hash: string
): Promise<BranchRecord | null> {
  const db = getDb();
  const now = isoNow();

  await db.prepare(
    `UPDATE branches SET head_commit_hash = ?, updated_at = ? WHERE project_id = ? AND name = ?`
  ).run(commit_hash, now, project_id, branch_name);

  return await getBranch(project_id, branch_name);
}

export async function deleteBranch(project_id: string, branch_name: string): Promise<boolean> {
  const db = getDb();

  // Don't delete current branch
  const branch = await getBranch(project_id, branch_name);
  if (!branch || branch.is_current) return false;

  const result = await db
    .prepare(`DELETE FROM branches WHERE project_id = ? AND name = ?`)
    .run(project_id, branch_name);

  return result.changes > 0;
}

export async function ensureMainBranch(project_id: string): Promise<BranchRecord> {
  const existing = await getBranch(project_id, 'main');
  if (existing) return existing;

  return await createBranch({
    project_id,
    name: 'main',
  });
}
