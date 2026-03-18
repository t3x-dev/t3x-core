/**
 * Frame-Based Commits Queries
 *
 * CRUD operations for commits table using Drizzle ORM.
 * Commits store frame-based semantic content (frames + relations).
 *
 * @see packages/core/src/commit/types.ts
 */

import type { Author, Commit, Provenance, SemanticContent, Source } from '@t3x-dev/core';
import { COMMIT_SCHEMA, computeCommitHash } from '@t3x-dev/core';

export { computeCommitHash } from '@t3x-dev/core';

import { and, desc, eq, inArray } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { type CommitRecord, commits } from '../schema-commits';

// ============================================================
// Types
// ============================================================

export interface CreateCommitInput {
  parents?: string[];
  author: Author;
  content: SemanticContent;
  project_id: string;
  message?: string;
  branch?: string;
  sources?: Source[];
  provenance?: Provenance;
  position_x?: number;
  position_y?: number;
}

export interface ListCommitsOptions {
  projectId: string;
  branch?: string;
  limit?: number;
  offset?: number;
}

// ============================================================
// Query Functions
// ============================================================

/**
 * Create a new frame-based commit.
 *
 * Computes the hash from first-class fields, inserts into commits table,
 * and returns the full Commit object.
 */
export async function createCommit(db: AnyDB, input: CreateCommitInput): Promise<Commit> {
  const parents = input.parents ?? [];
  const now = new Date().toISOString();
  const branch = input.branch ?? 'main';

  // Compute hash from first-class fields
  const hash = computeCommitHash({
    schema: COMMIT_SCHEMA,
    parents,
    author: input.author,
    committed_at: now,
    content: input.content,
  });

  const [row] = await db
    .insert(commits)
    .values({
      hash,
      schema: COMMIT_SCHEMA,
      parents,
      author: input.author,
      committedAt: new Date(now),
      content: input.content,
      projectId: input.project_id,
      message: input.message ?? null,
      branch,
      sources: input.sources ?? null,
      provenance: input.provenance ?? null,
      positionX: input.position_x ?? null,
      positionY: input.position_y ?? null,
    })
    .returning();

  return rowToCommit(row);
}

/**
 * Get a single commit by hash.
 */
export async function getCommit(db: AnyDB, hash: string): Promise<Commit | null> {
  const [row] = await db.select().from(commits).where(eq(commits.hash, hash)).limit(1);

  return row ? rowToCommit(row) : null;
}

/**
 * List commits for a project, optionally filtered by branch.
 *
 * Returns commits ordered by committed_at descending.
 */
export async function listCommits(db: AnyDB, options: ListCommitsOptions): Promise<Commit[]> {
  const { projectId, branch, limit = 100, offset = 0 } = options;

  const conditions = [eq(commits.projectId, projectId)];
  if (branch) {
    conditions.push(eq(commits.branch, branch));
  }

  const rows = await db
    .select()
    .from(commits)
    .where(and(...conditions))
    .orderBy(desc(commits.committedAt), desc(commits.hash))
    .limit(limit)
    .offset(offset);

  return rows.map(rowToCommit);
}

/**
 * Get the latest commit on a branch (branch head).
 */
export async function getLatestCommit(
  db: AnyDB,
  projectId: string,
  branch: string
): Promise<Commit | null> {
  const [row] = await db
    .select()
    .from(commits)
    .where(and(eq(commits.projectId, projectId), eq(commits.branch, branch)))
    .orderBy(desc(commits.committedAt), desc(commits.hash))
    .limit(1);

  return row ? rowToCommit(row) : null;
}

/**
 * Get multiple commits by hashes (batch query).
 *
 * Returns commits in the same order as the input hashes array.
 * Missing hashes are skipped (no nulls in result).
 */
export async function getCommitsByHashes(db: AnyDB, hashes: string[]): Promise<Commit[]> {
  if (hashes.length === 0) return [];

  const rows = await db.select().from(commits).where(inArray(commits.hash, hashes));

  const commitMap = new Map<string, Commit>();
  for (const row of rows) {
    commitMap.set(row.hash, rowToCommit(row));
  }

  const result: Commit[] = [];
  for (const hash of hashes) {
    const commit = commitMap.get(hash);
    if (commit) result.push(commit);
  }

  return result;
}

/**
 * Delete a commit by hash.
 *
 * @returns true if deleted, false if not found
 */
export async function deleteCommit(db: AnyDB, hash: string): Promise<boolean> {
  const result = await db.delete(commits).where(eq(commits.hash, hash)).returning();

  return result.length > 0;
}

/**
 * Update commit canvas position.
 *
 * @returns Updated commit or null if not found
 */
export async function updateCommitPosition(
  db: AnyDB,
  hash: string,
  x: number,
  y: number
): Promise<Commit | null> {
  const [updated] = await db
    .update(commits)
    .set({ positionX: x, positionY: y })
    .where(eq(commits.hash, hash))
    .returning();

  return updated ? rowToCommit(updated) : null;
}

// ============================================================
// Helpers
// ============================================================

/**
 * Convert database row to Commit type.
 */
function rowToCommit(row: CommitRecord): Commit {
  return {
    hash: row.hash,
    schema: COMMIT_SCHEMA,
    parents: row.parents,
    author: row.author as Author,
    committed_at: row.committedAt.toISOString(),
    content: row.content as SemanticContent,
    project_id: row.projectId ?? '',
    message: row.message ?? null,
    branch: row.branch ?? 'main',
    sources: (row.sources as Source[] | null) ?? null,
    provenance: (row.provenance as Provenance | null) ?? null,
    position_x: row.positionX ?? undefined,
    position_y: row.positionY ?? undefined,
  };
}
