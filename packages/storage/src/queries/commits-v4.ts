/**
 * Commits V4 Queries
 *
 * CRUD operations for commits_v4 table using Drizzle ORM.
 * V4 commits store pure knowledge (sentences only, no constraints).
 *
 * Key difference from V3:
 * - content contains only sentences (no constraints)
 * - constraints moved to Leaf (application layer)
 *
 * @see docs/specification/semantic-layer-architecture.md
 */

import { computeJCSHash } from '@t3x/core';
import type {
  CommitAuthorV4,
  CommitSourceRef,
  CommitV4,
  CreateCommitV4Input,
  SentenceV4,
} from '@t3x/core';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { type CommitV4Record, commitsV4 } from '../schema-v4';

// ============================================================
// Types
// ============================================================

export interface ListCommitsV4Options {
  projectId: string;
  branch?: string;
  limit?: number;
  offset?: number;
}

export interface CreateCommitV4Options {
  /**
   * If true, validate that all parent hashes exist before insert.
   * Throws ParentNotFoundError if any parent is missing.
   * Default: true (strict mode for normal operations)
   * Set to false for import/sync scenarios where parents may arrive later.
   */
  strictParents?: boolean;
}

/**
 * Error thrown when parent commits are not found in strict mode
 */
export class ParentNotFoundErrorV4 extends Error {
  constructor(
    public missingParents: string[],
    public allParents: string[]
  ) {
    super(
      `Parent commits not found: ${missingParents.join(', ')}. ` +
        `Use { strictParents: false } for import mode.`
    );
    this.name = 'ParentNotFoundErrorV4';
  }
}

// ============================================================
// Hash Computation
// ============================================================

/**
 * Compute CommitV4 hash from first-class fields only.
 *
 * First-class fields (participate in hash):
 * - schema: 't3x/commit/v4'
 * - parents: string[]
 * - author: CommitAuthor
 * - committed_at: ISO8601 string
 * - content: { sentences: Sentence[] }
 *
 * Second-class fields (NOT in hash):
 * - project_id, message, branch, source_refs, position_x, position_y, created_at
 */
export function computeCommitV4Hash(data: {
  schema: 't3x/commit/v4';
  parents: string[];
  author: CommitAuthorV4;
  committed_at: string;
  content: { sentences: SentenceV4[] };
}): string {
  return computeJCSHash({
    schema: data.schema,
    parents: data.parents,
    author: data.author,
    committed_at: data.committed_at,
    content: data.content,
  });
}

// ============================================================
// Query Functions
// ============================================================

/**
 * Create a new CommitV4
 *
 * @param db - Database instance
 * @param input - Commit data (without hash - will be computed)
 * @param options - Optional settings (strictParents defaults to true)
 * @throws ParentNotFoundErrorV4 if strictParents=true and any parent doesn't exist
 */
export async function createCommitV4(
  db: AnyDB,
  input: CreateCommitV4Input,
  options: CreateCommitV4Options = {}
): Promise<CommitV4> {
  const { strictParents = true } = options;
  const parents = input.parents ?? [];

  // Validate parents exist if strict mode
  if (strictParents && parents.length > 0) {
    const existingParents = await db
      .select({ hash: commitsV4.hash })
      .from(commitsV4)
      .where(inArray(commitsV4.hash, parents));

    const existingHashes = new Set(existingParents.map((p) => p.hash));
    const missingParents = parents.filter((h) => !existingHashes.has(h));

    if (missingParents.length > 0) {
      throw new ParentNotFoundErrorV4(missingParents, parents);
    }
  }

  const now = new Date().toISOString();

  // Compute hash from first-class fields only
  const hash = computeCommitV4Hash({
    schema: 't3x/commit/v4',
    parents,
    author: input.author,
    committed_at: now,
    content: { sentences: input.sentences },
  });

  const [row] = await db
    .insert(commitsV4)
    .values({
      hash,
      schema: 't3x/commit/v4',
      parents,
      author: input.author,
      committedAt: new Date(now),
      content: { sentences: input.sentences },
      projectId: input.project_id ?? null,
      message: input.message ?? null,
      branch: input.branch ?? null,
      sourceRefs: input.source_refs ?? null,
      positionX: input.position_x ?? null,
      positionY: input.position_y ?? null,
    })
    .returning();

  return rowToCommitV4(row);
}

/**
 * Find a CommitV4 by hash
 */
export async function findCommitV4ByHash(
  db: AnyDB,
  hash: string
): Promise<CommitV4 | null> {
  const [row] = await db
    .select()
    .from(commitsV4)
    .where(eq(commitsV4.hash, hash))
    .limit(1);

  return row ? rowToCommitV4(row) : null;
}

/**
 * Find all CommitsV4 for a project
 *
 * Returns commits ordered by committedAt descending.
 */
export async function findCommitsV4ByProject(
  db: AnyDB,
  projectId: string,
  options: Omit<ListCommitsV4Options, 'projectId'> = {}
): Promise<CommitV4[]> {
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  const rows = await db
    .select()
    .from(commitsV4)
    .where(eq(commitsV4.projectId, projectId))
    .orderBy(desc(commitsV4.committedAt), commitsV4.hash)
    .limit(limit)
    .offset(offset);

  return rows.map(rowToCommitV4);
}

/**
 * Find CommitsV4 by project and branch
 *
 * Returns commits ordered by committedAt descending.
 */
export async function findCommitsV4ByBranch(
  db: AnyDB,
  projectId: string,
  branch: string,
  options: Omit<ListCommitsV4Options, 'projectId' | 'branch'> = {}
): Promise<CommitV4[]> {
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  const rows = await db
    .select()
    .from(commitsV4)
    .where(and(eq(commitsV4.projectId, projectId), eq(commitsV4.branch, branch)))
    .orderBy(desc(commitsV4.committedAt), commitsV4.hash)
    .limit(limit)
    .offset(offset);

  return rows.map(rowToCommitV4);
}

/**
 * Update CommitV4 canvas position
 *
 * @returns Updated commit or null if not found
 */
export async function updateCommitV4Position(
  db: AnyDB,
  hash: string,
  x: number,
  y: number
): Promise<CommitV4 | null> {
  const [updated] = await db
    .update(commitsV4)
    .set({
      positionX: x,
      positionY: y,
    })
    .where(eq(commitsV4.hash, hash))
    .returning();

  return updated ? rowToCommitV4(updated) : null;
}

/**
 * Delete a CommitV4 by hash
 *
 * @returns true if deleted, false if not found
 */
export async function deleteCommitV4(db: AnyDB, hash: string): Promise<boolean> {
  const result = await db
    .delete(commitsV4)
    .where(eq(commitsV4.hash, hash))
    .returning();

  return result.length > 0;
}

/**
 * Get multiple CommitsV4 by hashes
 *
 * Batch query utility to avoid N+1 when fetching multiple commits.
 * Returns commits in the same order as the input hashes array.
 * Missing hashes are skipped (no nulls in result).
 */
export async function getCommitsV4ByHashes(
  db: AnyDB,
  hashes: string[]
): Promise<CommitV4[]> {
  if (hashes.length === 0) return [];

  const rows = await db
    .select()
    .from(commitsV4)
    .where(inArray(commitsV4.hash, hashes));

  // Create a map for O(1) lookup
  const commitMap = new Map<string, CommitV4>();
  for (const row of rows) {
    commitMap.set(row.hash, rowToCommitV4(row));
  }

  // Return in the original order of input hashes
  const result: CommitV4[] = [];
  for (const hash of hashes) {
    const commit = commitMap.get(hash);
    if (commit) result.push(commit);
  }

  return result;
}

/**
 * Get CommitV4 parents
 *
 * Uses single query with WHERE IN to avoid N+1 problem.
 * Returns parents in the same order as the parents array.
 */
export async function getCommitV4Parents(
  db: AnyDB,
  hash: string
): Promise<CommitV4[]> {
  const commit = await findCommitV4ByHash(db, hash);
  if (!commit || commit.parents.length === 0) return [];

  return getCommitsV4ByHashes(db, commit.parents);
}

// ============================================================
// Helpers
// ============================================================

/**
 * Convert database row to CommitV4 type
 */
function rowToCommitV4(row: CommitV4Record): CommitV4 {
  return {
    hash: row.hash,
    schema: 't3x/commit/v4',
    parents: row.parents,
    author: row.author as CommitAuthorV4,
    committed_at: row.committedAt.toISOString(),
    content: row.content as { sentences: SentenceV4[] },
    project_id: row.projectId ?? undefined,
    message: row.message ?? undefined,
    branch: row.branch ?? undefined,
    source_refs: row.sourceRefs as CommitSourceRef[] | undefined,
    position_x: row.positionX ?? undefined,
    position_y: row.positionY ?? undefined,
    created_at: row.createdAt.toISOString(),
  };
}
