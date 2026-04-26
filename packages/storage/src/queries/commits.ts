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

  // Race-closing path: lock the candidate yops_log rows for the
  // duration of this commit so a concurrent
  // `supersedeActiveLLMSuggestions` UPDATE blocks until our INSERT
  // commits.
  //
  // Sequence inside the transaction:
  //   1. SELECT id FROM yops_log WHERE id = ANY($ids) FOR SHARE
  //      acquires shared row locks. UPDATEs (incl. supersede) on
  //      these rows wait until this transaction ends. Other readers
  //      (e.g. another commit attempt) can proceed.
  //   2. SELECT for already-superseded rows. If any, throw —
  //      caller raced before the lock was held.
  //   3. INSERT commit. After this, the rows are referenced by
  //      `commits.yops_log_ids`, so the next supersede UPDATE's
  //      NOT EXISTS subquery against commits will exclude them
  //      naturally.
  //
  // FOR SHARE (not FOR UPDATE) is the right grade: we don't mutate
  // the yops_log rows, we only need to prevent concurrent UPDATEs.
  const result = await (db as unknown as TxRunner).transaction(async (tx) => {
    // Acquire shared row locks on the candidate yops_log rows. A
    // concurrent `supersedeActiveLLMSuggestions` UPDATE on any of
    // these ids will block until this transaction ends. Other readers
    // (and other unrelated commit attempts) are unaffected. Drizzle's
    // `.for('share')` emits a standard `FOR SHARE` clause; the
    // SELECT itself doesn't need to consume the rows — executing it
    // is what acquires the locks.
    await (tx as AnyDB)
      .select({ id: yopsLog.id })
      .from(yopsLog)
      .where(inArray(yopsLog.id, yopsLogIds))
      .for('share');

    // After lock acquisition, validate. A concurrent supersede UPDATE
    // on these ids is now blocked until our transaction ends, so the
    // outcome of this SELECT is stable for the rest of the tx.
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
