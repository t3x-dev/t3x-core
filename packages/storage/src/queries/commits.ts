/**
 * Frame-Based Commits Queries
 *
 * CRUD operations for commits table using Drizzle ORM.
 * Commits store frame-based semantic content (frames + relations).
 *
 * @see packages/core/src/commit/types.ts
 */

import type { Author, Commit, CommitSchemaTag, Provenance, SemanticContent } from '@t3x-dev/core';
import { COMMIT_SCHEMA, computeCommitHash } from '@t3x-dev/core';

export { computeCommitHash } from '@t3x-dev/core';

import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { type CommitRecord, commits } from '../schema-commits';
import { yopsLog } from '../schema-trees';
import { getSupersededHashes } from './commit-rewrites';
import { acquireProjectSupersedeLock } from './yops-log';

/**
 * Thrown by `createCommit` when the caller passes one or more
 * `yops_log_ids` whose `superseded_at IS NOT NULL` at insert time.
 * Indicates a re-extract landed between the caller's
 * `findUncommittedYOpsIds()` snapshot and the commit's insert,
 * marking entries that the caller still believed were active. The
 * caller should re-fetch the active draft id set and retry.
 */
export class SupersededYOpsLogIdsError extends Error {
  constructor(public readonly supersededIds: string[]) {
    super(
      `Cannot commit superseded yops_log entries (re-extract landed during commit): ${supersededIds.join(', ')}`
    );
    this.name = 'SupersededYOpsLogIdsError';
  }
}

// biome-ignore lint/suspicious/noExplicitAny: Drizzle's tx vs db types
// vary by adapter; the runtime contract (transaction(fn)) is uniform.
type TxRunner = { transaction: (fn: (tx: any) => Promise<unknown>) => Promise<unknown> };

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
  provenance?: Provenance;
  yops_log_ids?: string[];
  sources?: Array<{ type: 'conversation' | 'import' | 'leaf'; id: string; title?: string }>;
}

export interface ListCommitsOptions {
  projectId: string;
  branch?: string;
  limit?: number;
  offset?: number;
  includeSuperseded?: boolean;
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
  const yopsLogIds = input.yops_log_ids ?? [];

  // Compute hash up front (deterministic; no DB needed).
  const hash = computeCommitHash({
    schema: COMMIT_SCHEMA,
    parents,
    author: input.author,
    committed_at: now,
    content: input.content,
  });

  const insertCommit = async (txOrDb: AnyDB): Promise<CommitRecord> => {
    const [row] = await txOrDb
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
        provenance: input.provenance ?? null,
        yopsLogIds,
        sources: input.sources ?? null,
      })
      .returning();
    return row;
  };

  // Fast path: nothing to lock. Skip the transaction entirely.
  if (yopsLogIds.length === 0) {
    const row = await insertCommit(db);
    return rowToCommit(row);
  }

  // Race-closing path: per-project advisory transaction lock shared
  // with `supersedeActiveLLMSuggestions`. Acquired inside the
  // transaction (so it auto-releases at COMMIT/ROLLBACK), it
  // serialises the entire critical section between extract-side
  // supersede and commit-side validation+insert.
  //
  // Why advisory (and not row-level FOR SHARE): under PG READ
  // COMMITTED, a waiting UPDATE re-evaluates the WHERE predicate
  // only against the locked row — its subqueries over OTHER tables
  // (here, `commits`) keep using the original statement snapshot.
  // So a `FOR SHARE` on yops_log rows would not have caused the
  // supersede's `NOT EXISTS (... commits ...)` to see our newly-
  // inserted commit row, and the row could be marked superseded
  // even after we committed referencing it. Advisory lock takes that
  // ambiguity off the table by serialising the two paths outright.
  //
  // Sequence inside the transaction:
  //   1. pg_advisory_xact_lock(ssvb, hashtext(projectId)) —
  //      blocks any concurrent supersede on this project.
  //   2. SELECT for already-superseded ids. If any, throw —
  //      caller raced *before* we acquired the lock; their snapshot
  //      is stale, they should retry.
  //   3. INSERT commit. After this, the rows are referenced by
  //      `commits.yops_log_ids`. The next supersede (which has been
  //      waiting on the advisory lock) wakes up, sees the new commits
  //      row in its NOT EXISTS subquery, and excludes them.
  const result = await (db as unknown as TxRunner).transaction(async (tx) => {
    await acquireProjectSupersedeLock(tx as AnyDB, input.project_id);

    const superseded = await (tx as AnyDB)
      .select({ id: yopsLog.id })
      .from(yopsLog)
      .where(and(inArray(yopsLog.id, yopsLogIds), isNotNull(yopsLog.supersededAt)));
    if (superseded.length > 0) {
      throw new SupersededYOpsLogIdsError(superseded.map((row) => row.id));
    }

    return insertCommit(tx as AnyDB);
  });

  return rowToCommit(result as CommitRecord);
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
  const { projectId, branch, limit = 100, offset = 0, includeSuperseded = false } = options;

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

  let result = rows.map(rowToCommit);

  if (!includeSuperseded) {
    const superseded = await getSupersededHashes(db, projectId);
    if (superseded.size > 0) {
      result = result.filter((c) => !superseded.has(c.hash));
    }
  }

  return result;
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
 * Collect all yops_log_ids from an ordered list of commits.
 * Returns IDs in order (oldest commit's ops first).
 * Throws if any commit is missing or has empty yops_log_ids.
 */
export async function collectYOpsForCommitRange(
  db: AnyDB,
  commitHashes: string[]
): Promise<string[]> {
  if (commitHashes.length === 0) return [];

  const commitMap = new Map<string, Commit>();
  const rows = await db.select().from(commits).where(inArray(commits.hash, commitHashes));
  for (const row of rows) {
    commitMap.set(row.hash, rowToCommit(row));
  }

  const allIds: string[] = [];
  for (const hash of commitHashes) {
    const commit = commitMap.get(hash);
    if (!commit) {
      throw new Error(`Commit not found: ${hash}`);
    }
    if (commit.yops_log_ids.length === 0) {
      throw new Error(
        `Commit ${hash} has empty yops_log_ids — cannot squash pre-solidification commits`
      );
    }
    allIds.push(...commit.yops_log_ids);
  }

  return allIds;
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

/**
 * Update commit message (display name).
 */
export async function updateCommitMessage(
  db: AnyDB,
  hash: string,
  message: string
): Promise<Commit | null> {
  const [updated] = await db
    .update(commits)
    .set({ message })
    .where(eq(commits.hash, hash))
    .returning();

  return updated ? rowToCommit(updated) : null;
}

// ============================================================
// Helpers
// ============================================================

/**
 * Convert database row to Commit type.
 *
 * Handles legacy content format: older commits store `{ frames, relations }`
 * while SemanticContent expects `{ trees, relations }`.
 */
function rowToCommit(row: CommitRecord): Commit {
  const rawContent = row.content as unknown as Record<string, unknown>;
  let content: SemanticContent;

  if (rawContent && Array.isArray(rawContent.trees)) {
    content = rawContent as unknown as SemanticContent;
  } else if (rawContent && Array.isArray((rawContent as { frames?: unknown[] }).frames)) {
    const legacyFrames = (
      rawContent as { frames: Array<{ id: string; type: string; slots: Record<string, unknown> }> }
    ).frames;
    content = {
      trees: legacyFrames.map((f) => ({
        key: f.id,
        type: f.type,
        slots: f.slots as Record<string, import('@t3x-dev/core').SlotValue>,
        children: [],
      })),
      relations: (Array.isArray(rawContent.relations)
        ? rawContent.relations
        : []) as SemanticContent['relations'],
    };
  } else {
    content = { trees: [], relations: [] };
  }

  // Preserve the schema string as written. `schema` is a first-class (hashed)
  // field — rewriting it in-memory would make recomputed hashes diverge from
  // stored ones for any row written under a previous schema value. New rows
  // default to COMMIT_SCHEMA at the DB layer.
  // Audit 2026-04-15, B-8.
  return {
    hash: row.hash,
    schema: (row.schema ?? COMMIT_SCHEMA) as CommitSchemaTag,
    parents: row.parents,
    author: row.author as Author,
    committed_at: row.committedAt.toISOString(),
    content,
    project_id: row.projectId ?? '',
    message: row.message ?? null,
    branch: row.branch ?? 'main',
    provenance: (row.provenance as Provenance | null) ?? null,
    yops_log_ids: (row.yopsLogIds as string[]) ?? [],
    sources:
      (row.sources as Array<{
        type: 'conversation' | 'import' | 'leaf';
        id: string;
        title?: string;
      }>) ?? null,
    // Canvas position (second-class, display-only)
    position_x: row.positionX ?? null,
    position_y: row.positionY ?? null,
  } as Commit & { position_x: number | null; position_y: number | null };
}
