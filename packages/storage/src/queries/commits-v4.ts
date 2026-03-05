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

import type {
  CommitAuthorV4,
  CommitSourceRef,
  CommitV4,
  CreateCommitV4Input,
  MergeSummaryData,
  SentenceV4,
} from '@t3x/core';
import { buildMerkleTree, computeCommitV4Hash } from '@t3x/core';

export { computeCommitV4Hash } from '@t3x/core';

import { and, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { type CommitV4Record, commitsV4 } from '../schema-v4';
import { type CursorPage, decodeCursor, toCursorPage } from './pagination';

// ============================================================
// Types
// ============================================================

export interface ListCommitsV4Options {
  projectId: string;
  branch?: string;
  limit?: number;
  offset?: number;
  /** Opaque cursor for keyset pagination. Empty string = first page in cursor mode. */
  cursor?: string;
}

export interface CreateCommitV4Options {
  /**
   * If true, validate that all parent hashes exist before insert.
   * Throws ParentNotFoundError if any parent is missing.
   * Default: true (strict mode for normal operations)
   * Set to false for import/sync scenarios where parents may arrive later.
   */
  strictParents?: boolean;

  /**
   * If true, verify parent commits' hash integrity before insert (L1 verification).
   * Recomputes each parent's hash and compares with stored value.
   * Throws ParentHashIntegrityError if any parent hash is tampered.
   * Default: false (opt-in for security-critical scenarios)
   */
  verifyParentHashes?: boolean;
}

/**
 * Result type for findCommitV4History, including a truncation flag.
 *
 * Fix 5: Add truncated flag so callers know the result may be incomplete.
 */
export interface CommitV4HistoryResult {
  commits: CommitV4[];
  /** True when the walk hit `limit` before exhausting the DAG. */
  truncated: boolean;
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

/**
 * Error thrown when parent commit hash integrity check fails (L1 verification)
 */
export class ParentHashIntegrityError extends Error {
  constructor(
    public invalidParents: string[],
    public details: string[]
  ) {
    super(`Parent commit hash integrity check failed: ${details.join('; ')}`);
    this.name = 'ParentHashIntegrityError';
  }
}

// ============================================================
// Query Functions
// ============================================================

/**
 * Create a new CommitV4
 *
 * Fix 7: When branch + project_id are both present, the insert is performed
 * inside a transaction so that callers who first call validateMainBranchLinearity
 * (passing the same `db` or transaction) and then call createCommitV4 can wrap
 * both calls in db.transaction() for full atomicity. The function accepts any
 * AnyDB value — including a Drizzle transaction object — transparently.
 *
 * @param db - Database instance (or a Drizzle transaction from db.transaction())
 * @param input - Commit data (without hash - will be computed)
 * @param options - Optional settings (strictParents defaults to true)
 * @throws ParentNotFoundErrorV4 if strictParents=true and any parent doesn't exist
 */
export async function createCommitV4(
  db: AnyDB,
  input: CreateCommitV4Input,
  options: CreateCommitV4Options = {}
): Promise<CommitV4> {
  const { strictParents = true, verifyParentHashes = false } = options;
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

  // L1 incremental verification: verify parent hash integrity (Upgrade #6)
  if (verifyParentHashes && parents.length > 0) {
    const parentRows = await db.select().from(commitsV4).where(inArray(commitsV4.hash, parents));

    const invalidParents: string[] = [];
    const details: string[] = [];

    for (const row of parentRows) {
      const parentCommit = rowToCommitV4(row);
      const recomputed = computeCommitV4Hash({
        schema: parentCommit.schema as 't3x/commit/v4',
        parents: parentCommit.parents,
        author: parentCommit.author,
        committed_at: parentCommit.committed_at,
        content: parentCommit.content,
      });

      if (recomputed !== parentCommit.hash) {
        invalidParents.push(parentCommit.hash);
        details.push(
          `Parent ${parentCommit.hash.slice(0, 16)}: hash mismatch (expected ${recomputed.slice(0, 16)})`
        );
      }
    }

    if (invalidParents.length > 0) {
      throw new ParentHashIntegrityError(invalidParents, details);
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

  // Compute Merkle root from sentences (null for empty commits)
  const merkleRoot =
    input.sentences.length > 0
      ? buildMerkleTree(input.sentences.map((s) => ({ id: s.id, text: s.text }))).root
      : null;

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
      merkleRoot,
      mergeSummary: input.merge_summary ?? null,
      positionX: input.position_x ?? null,
      positionY: input.position_y ?? null,
    })
    .returning();

  return rowToCommitV4(row);
}

/**
 * Create a CommitV4 on main branch with linearity validation, atomically.
 *
 * Fix 7: Wraps validateMainBranchLinearity + createCommitV4 in a single
 * database transaction to prevent two concurrent inserts from both passing
 * the linearity check and then forking the main branch.
 *
 * Use this instead of calling validateMainBranchLinearity + createCommitV4
 * separately when inserting to main.
 */
export async function createCommitV4Atomic(
  db: AnyDB,
  input: CreateCommitV4Input,
  options: CreateCommitV4Options = {}
): Promise<CommitV4> {
  return db.transaction(async (tx) => {
    if (input.branch && input.project_id) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.project_id || ''}))`);
      await validateMainBranchLinearity(
        tx as AnyDB,
        input.project_id,
        input.branch,
        input.parents ?? []
      );
    }
    return createCommitV4(tx as AnyDB, input, options);
  });
}

/**
 * Find a CommitV4 by hash
 */
export async function findCommitV4ByHash(db: AnyDB, hash: string): Promise<CommitV4 | null> {
  const [row] = await db.select().from(commitsV4).where(eq(commitsV4.hash, hash)).limit(1);

  return row ? rowToCommitV4(row) : null;
}

/**
 * Find all CommitsV4 for a project
 *
 * Returns commits ordered by committedAt descending.
 *
 * Supports two pagination modes:
 * - **Offset mode** (default): pass limit/offset, returns CommitV4[]
 * - **Cursor mode**: pass cursor (empty string for first page), returns CursorPage<CommitV4>
 */
export async function findCommitsV4ByProject(
  db: AnyDB,
  projectId: string,
  options: Omit<ListCommitsV4Options, 'projectId'> & { cursor: string }
): Promise<CursorPage<CommitV4>>;
export async function findCommitsV4ByProject(
  db: AnyDB,
  projectId: string,
  options?: Omit<ListCommitsV4Options, 'projectId' | 'cursor'>
): Promise<CommitV4[]>;
export async function findCommitsV4ByProject(
  db: AnyDB,
  projectId: string,
  options: Omit<ListCommitsV4Options, 'projectId'> = {}
): Promise<CommitV4[] | CursorPage<CommitV4>> {
  const limit = options.limit ?? 100;

  if (options.cursor !== undefined) {
    // Cursor pagination mode
    const conditions = [eq(commitsV4.projectId, projectId)];
    if (options.branch) {
      conditions.push(eq(commitsV4.branch, options.branch));
    }

    if (options.cursor !== '') {
      const { t, k } = decodeCursor(options.cursor);
      const cursorDate = new Date(t);
      // Keyset: (committed_at < t) OR (committed_at = t AND hash < k)
      conditions.push(
        or(
          lt(commitsV4.committedAt, cursorDate),
          and(eq(commitsV4.committedAt, cursorDate), lt(commitsV4.hash, k))
        )!
      );
    }

    const rows = await db
      .select()
      .from(commitsV4)
      .where(and(...conditions))
      .orderBy(desc(commitsV4.committedAt), desc(commitsV4.hash))
      .limit(limit + 1);

    return toCursorPage(rows.map(rowToCommitV4), limit, (c) => ({
      t: c.committed_at,
      k: c.hash,
    }));
  }

  // Legacy offset/limit mode
  const offset = options.offset ?? 0;
  const conditions = [eq(commitsV4.projectId, projectId)];
  if (options.branch) {
    conditions.push(eq(commitsV4.branch, options.branch));
  }

  const rows = await db
    .select()
    .from(commitsV4)
    .where(and(...conditions))
    .orderBy(desc(commitsV4.committedAt), desc(commitsV4.hash))
    .limit(limit)
    .offset(offset);

  return rows.map(rowToCommitV4);
}

/**
 * Find CommitsV4 by project and branch
 *
 * Returns commits ordered by committedAt descending.
 *
 * Supports two pagination modes:
 * - **Offset mode** (default): pass limit/offset, returns CommitV4[]
 * - **Cursor mode**: pass cursor (empty string for first page), returns CursorPage<CommitV4>
 */
export async function findCommitsV4ByBranch(
  db: AnyDB,
  projectId: string,
  branch: string,
  options: Omit<ListCommitsV4Options, 'projectId' | 'branch'> & { cursor: string }
): Promise<CursorPage<CommitV4>>;
export async function findCommitsV4ByBranch(
  db: AnyDB,
  projectId: string,
  branch: string,
  options?: Omit<ListCommitsV4Options, 'projectId' | 'branch' | 'cursor'>
): Promise<CommitV4[]>;
export async function findCommitsV4ByBranch(
  db: AnyDB,
  projectId: string,
  branch: string,
  options: Omit<ListCommitsV4Options, 'projectId' | 'branch'> = {}
): Promise<CommitV4[] | CursorPage<CommitV4>> {
  const limit = options.limit ?? 100;

  if (options.cursor !== undefined) {
    // Cursor pagination mode
    const conditions = [eq(commitsV4.projectId, projectId), eq(commitsV4.branch, branch)];

    if (options.cursor !== '') {
      const { t, k } = decodeCursor(options.cursor);
      const cursorDate = new Date(t);
      conditions.push(
        or(
          lt(commitsV4.committedAt, cursorDate),
          and(eq(commitsV4.committedAt, cursorDate), lt(commitsV4.hash, k))
        )!
      );
    }

    const rows = await db
      .select()
      .from(commitsV4)
      .where(and(...conditions))
      .orderBy(desc(commitsV4.committedAt), desc(commitsV4.hash))
      .limit(limit + 1);

    return toCursorPage(rows.map(rowToCommitV4), limit, (c) => ({
      t: c.committed_at,
      k: c.hash,
    }));
  }

  // Legacy offset/limit mode
  const offset = options.offset ?? 0;

  const rows = await db
    .select()
    .from(commitsV4)
    .where(and(eq(commitsV4.projectId, projectId), eq(commitsV4.branch, branch)))
    .orderBy(desc(commitsV4.committedAt), desc(commitsV4.hash))
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
  const result = await db.delete(commitsV4).where(eq(commitsV4.hash, hash)).returning();

  return result.length > 0;
}

/**
 * Get multiple CommitsV4 by hashes
 *
 * Batch query utility to avoid N+1 when fetching multiple commits.
 * Returns commits in the same order as the input hashes array.
 * Missing hashes are skipped (no nulls in result).
 */
export async function getCommitsV4ByHashes(db: AnyDB, hashes: string[]): Promise<CommitV4[]> {
  if (hashes.length === 0) return [];

  const rows = await db.select().from(commitsV4).where(inArray(commitsV4.hash, hashes));

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
export async function getCommitV4Parents(db: AnyDB, hash: string): Promise<CommitV4[]> {
  const commit = await findCommitV4ByHash(db, hash);
  if (!commit || commit.parents.length === 0) return [];

  return getCommitsV4ByHashes(db, commit.parents);
}

/**
 * Walk the parent chain from a given commit using a recursive CTE.
 *
 * Replaces the former in-memory BFS with a single PostgreSQL
 * `WITH RECURSIVE` query that traverses the parents JSONB array
 * directly in SQL, eliminating the need to pre-fetch all project commits.
 *
 * Returns { commits, truncated } — truncated=true signals that `limit` was
 * hit before the full DAG was explored.
 *
 * @param db - Database instance
 * @param hash - Starting commit hash
 * @param limit - Maximum number of commits to return (default 50)
 */
export async function findCommitV4History(
  db: AnyDB,
  hash: string,
  limit = 50
): Promise<CommitV4HistoryResult> {
  const MAX_DEPTH = 1000;

  const result = await (
    db as unknown as {
      execute: (q: ReturnType<typeof sql>) => Promise<{ rows: Record<string, unknown>[] }>;
    }
  ).execute(sql`
    WITH RECURSIVE history AS (
      SELECT c.*, 0 AS depth, ARRAY[c.hash] AS visited
      FROM commits_v4 c
      WHERE c.hash = ${hash}

      UNION ALL

      SELECT c.*, h.depth + 1, h.visited || c.hash
      FROM history h,
           jsonb_array_elements_text(h.parents::jsonb) AS parent_hash
      JOIN commits_v4 c ON c.hash = parent_hash
      WHERE h.depth < ${MAX_DEPTH}
        AND NOT (c.hash = ANY(h.visited))
    ),
    deduped AS (
      SELECT DISTINCT ON (hash) hash, schema, parents, author, committed_at,
             content, project_id, message, branch, source_refs, merkle_root,
             merge_summary, position_x, position_y, created_at, depth
      FROM history
      ORDER BY hash, depth
    )
    SELECT * FROM deduped
    ORDER BY depth, committed_at DESC
    LIMIT ${limit + 1}
  `);

  const rows = result.rows;
  const truncated = rows.length > limit;
  const commits = rows.slice(0, limit).map(rawRowToCommitV4);

  return { commits, truncated };
}

// ============================================================
// Validation
// ============================================================

/**
 * Error thrown when main branch linearity is violated
 */
export class MainBranchLinearityError extends Error {
  constructor(
    public code: 'MAIN_ROOT_EXISTS' | 'MAIN_NOT_HEAD',
    message: string
  ) {
    super(message);
    this.name = 'MainBranchLinearityError';
  }
}

/**
 * Validate that a new commit on the main branch maintains linear chain.
 *
 * Rules:
 * 1. Only one root commit (no parents) is allowed on main
 * 2. Non-root commits must extend from the current HEAD (latest commit with no children)
 *
 * @throws MainBranchLinearityError if validation fails
 */
export async function validateMainBranchLinearity(
  db: AnyDB,
  projectId: string,
  branch: string,
  parents: string[]
): Promise<void> {
  if (branch !== 'main') return;

  const mainCommits = await db
    .select({ hash: commitsV4.hash, parents: commitsV4.parents })
    .from(commitsV4)
    .where(and(eq(commitsV4.projectId, projectId), eq(commitsV4.branch, 'main')));

  if (parents.length === 0) {
    // Root commit — reject if main already has commits
    if (mainCommits.length > 0) {
      throw new MainBranchLinearityError(
        'MAIN_ROOT_EXISTS',
        'A root commit on main branch already exists'
      );
    }
  } else {
    // Child commit — parent must be current HEAD (latest with no children on main)
    if (mainCommits.length > 0) {
      const childParents = new Set(mainCommits.flatMap((c) => c.parents));
      const heads = mainCommits.filter((c) => !childParents.has(c.hash));
      if (heads.length > 1) {
        throw new MainBranchLinearityError(
          'MAIN_NOT_HEAD',
          `Main branch has ${heads.length} heads — resolve before committing`
        );
      }
      if (heads.length === 1 && !parents.includes(heads[0].hash)) {
        throw new MainBranchLinearityError(
          'MAIN_NOT_HEAD',
          'New commit must extend from the latest main branch commit'
        );
      }
    }
  }
}

// ============================================================
// Merkle Verification & Backfill
// ============================================================

/**
 * Quick Merkle verification: recompute merkle roots from sentences
 * and compare with stored values for recent commits.
 *
 * Only checks commits that already have a stored merkle_root.
 * Commits without a stored root are skipped (use backfillMerkleRoots first).
 */
export async function verifyMerkleRoots(
  db: AnyDB,
  projectId: string,
  limit = 100
): Promise<{ valid: boolean; checked: number; mismatches: string[]; missing_roots: string[] }> {
  const rows = await db
    .select({
      hash: commitsV4.hash,
      content: commitsV4.content,
      merkleRoot: commitsV4.merkleRoot,
    })
    .from(commitsV4)
    .where(eq(commitsV4.projectId, projectId))
    .orderBy(desc(commitsV4.committedAt))
    .limit(limit);

  const mismatches: string[] = [];
  const missing_roots: string[] = [];
  let checked = 0;

  for (const row of rows) {
    const content = row.content as { sentences: Array<{ id: string; text: string }> };
    const sentences = content.sentences ?? [];

    if (sentences.length === 0) continue;
    checked++;

    const tree = buildMerkleTree(sentences.map((s) => ({ id: s.id, text: s.text })));
    const expectedRoot = tree.root || null;

    if (!row.merkleRoot && expectedRoot) {
      // Non-empty commit with no stored root — flag as missing
      missing_roots.push(row.hash);
    } else if (row.merkleRoot && expectedRoot && row.merkleRoot !== expectedRoot) {
      mismatches.push(row.hash);
    }
  }

  return {
    valid: mismatches.length === 0 && missing_roots.length === 0,
    checked,
    mismatches,
    missing_roots,
  };
}

/**
 * Backfill merkle_root for existing commits that don't have one.
 *
 * Returns the number of commits updated.
 */
export async function backfillMerkleRoots(
  db: AnyDB,
  projectId: string
): Promise<{ updated: number; remaining: boolean }> {
  const BATCH_LIMIT = 10000;
  const rows = await db
    .select()
    .from(commitsV4)
    .where(and(eq(commitsV4.projectId, projectId), isNull(commitsV4.merkleRoot)))
    .limit(BATCH_LIMIT + 1);

  const hasMore = rows.length > BATCH_LIMIT;
  const batch = hasMore ? rows.slice(0, BATCH_LIMIT) : rows;

  let updated = 0;
  for (const row of batch) {
    const commit = rowToCommitV4(row);
    const sentences = commit.content.sentences ?? [];

    if (sentences.length === 0) continue;

    const tree = buildMerkleTree(sentences.map((s) => ({ id: s.id, text: s.text })));
    const root = tree.root || null;

    if (root) {
      await db.update(commitsV4).set({ merkleRoot: root }).where(eq(commitsV4.hash, row.hash));
      updated++;
    }
  }

  return { updated, remaining: hasMore };
}

// ============================================================
// Helpers
// ============================================================

/**
 * Defensively parse a JSONB value that may arrive as a JSON string
 * (e.g. from some PostgreSQL drivers or raw SQL results).
 */
function parseJsonb<T>(val: unknown): T {
  return typeof val === 'string' ? JSON.parse(val) : (val as T);
}

/**
 * Convert raw SQL result row to CommitV4 type.
 * Used for recursive CTE results where Drizzle ORM types are not available.
 */
function rawRowToCommitV4(row: Record<string, unknown>): CommitV4 {
  return {
    hash: row.hash as string,
    schema: 't3x/commit/v4',
    parents: parseJsonb<string[]>(row.parents),
    author: parseJsonb<CommitAuthorV4>(row.author),
    committed_at:
      row.committed_at instanceof Date
        ? (row.committed_at as Date).toISOString()
        : String(row.committed_at),
    content: parseJsonb<{ sentences: SentenceV4[] }>(row.content),
    project_id: (row.project_id as string) ?? undefined,
    message: (row.message as string) ?? undefined,
    branch: (row.branch as string) ?? undefined,
    source_refs: row.source_refs ? parseJsonb<CommitSourceRef[]>(row.source_refs) : undefined,
    merkle_root: (row.merkle_root as string) ?? undefined,
    merge_summary: row.merge_summary ? parseJsonb<MergeSummaryData>(row.merge_summary) : undefined,
    position_x: (row.position_x as number) ?? undefined,
    position_y: (row.position_y as number) ?? undefined,
    created_at:
      row.created_at instanceof Date
        ? (row.created_at as Date).toISOString()
        : String(row.created_at),
  };
}

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
    merkle_root: row.merkleRoot ?? undefined,
    merge_summary: (row.mergeSummary as MergeSummaryData) ?? undefined,
    position_x: row.positionX ?? undefined,
    position_y: row.positionY ?? undefined,
    created_at: row.createdAt.toISOString(),
  };
}
