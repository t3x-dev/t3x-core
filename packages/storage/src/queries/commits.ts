/**
 * Frame-Based Commits Queries
 *
 * CRUD operations for commits table using Drizzle ORM.
 * Commits store frame-based state content (frames + relations).
 *
 * @see packages/core/src/commit/types.ts
 */

import type { Author, Commit, CommitSchemaTag, Provenance, SemanticContent } from '@t3x-dev/core';
import { COMMIT_SCHEMA } from '@t3x-dev/core';

export { computeCommitHash } from '@t3x-dev/core';

import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { type CommitRecord, commits } from '../schema-commits';
import { getSupersededHashes } from './commit-rewrites';

/**
 * Thrown when a Transition consumes one or more `yops_log_ids` whose
 * `superseded_at IS NOT NULL` at insert time.
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

// ============================================================
// Types
// ============================================================

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
 * Returns true when any commit records a conversation as an explicit source.
 */
export async function hasConversationCommitReferences(
  db: AnyDB,
  conversationId: string
): Promise<boolean> {
  const sourceRef = JSON.stringify([{ type: 'conversation', id: conversationId }]);
  const rows = await db
    .select({ hash: commits.hash })
    .from(commits)
    .where(sql`${commits.sources} @> ${sourceRef}::jsonb`)
    .limit(1);

  return rows.length > 0;
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
    .where(
      and(
        eq(commits.projectId, projectId),
        eq(commits.branch, branch),
        sql`NOT EXISTS (
          SELECT 1 FROM commits AS child
          WHERE child.project_id = ${projectId}
            AND child.branch = ${branch}
            AND child.parents ->> 0 = ${commits.hash}
        )`
      )
    )
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
