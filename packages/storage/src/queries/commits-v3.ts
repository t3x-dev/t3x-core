/**
 * Commits V3 Queries
 *
 * CRUD operations for commits_v3 table using Drizzle ORM.
 * V3 commits use JSONB for author and content fields.
 */

import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { type CommitV3, commitsV3 } from '../schema';

// ============================================================
// Types
// ============================================================

export interface CommitV3Author {
  name: string;
  identity?: string;
  verification?: 'none' | 'device' | 'verified';
}

/**
 * Sentence source in V3 commit content
 * Matches Core Sentence.source (packages/core/src/types/commit-v3.ts)
 */
export interface CommitV3SentenceSource {
  turn_hash: string;
  start_char: number;
  end_char: number;
}

/**
 * Sentence in V3 commit content
 * Matches Core Sentence type (packages/core/src/types/commit-v3.ts)
 */
export interface CommitV3Sentence {
  id: string;
  text: string;
  source: CommitV3SentenceSource;
}

/**
 * Constraint in V3 commit content
 * Matches Core Constraint types (packages/core/src/types/commit-v3.ts)
 * Uses 'require'/'exclude' types with required id and match fields
 */
export interface CommitV3Constraint {
  type: 'require' | 'exclude';
  id: string;
  value: string;
  match: 'exact' | 'semantic';
  /** For 'require' type: source sentence ID */
  source_sentence_id?: string;
  /** For 'require' type: whether this constraint was suggested */
  suggested?: boolean;
  /** For 'exclude' type: reason for exclusion */
  reason?: string;
}

export interface CommitV3Content {
  sentences: CommitV3Sentence[];
  constraints?: CommitV3Constraint[];
}

export interface CreateCommitV3Input {
  hash: string;
  /** Schema version, defaults to 'commit/v3'. Extensible for future versions. */
  schema?: string;
  parents?: string[];
  author: CommitV3Author;
  committedAt: Date;
  content: CommitV3Content;
  projectId?: string;
  message?: string;
  branch?: string;
  position?: { x: number; y: number };
}

export interface CreateCommitV3Options {
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
export class ParentNotFoundError extends Error {
  constructor(
    public missingParents: string[],
    public allParents: string[]
  ) {
    super(
      `Parent commits not found: ${missingParents.join(', ')}. ` +
        `Use { strictParents: false } for import mode.`
    );
    this.name = 'ParentNotFoundError';
  }
}

export interface ListCommitsV3Options {
  projectId: string;
  branch?: string;
  limit?: number;
  offset?: number;
}

/**
 * Output type for CommitV3 with camelCase fields (consistent with other storage queries)
 */
export interface CommitV3Output {
  hash: string;
  schema: string;
  parents: string[];
  author: CommitV3Author;
  committedAt: string;
  content: CommitV3Content;
  projectId: string | null;
  message: string | null;
  branch: string | null;
  /** Position is only set when BOTH x and y are non-null in DB */
  position?: { x: number; y: number };
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// Query Functions
// ============================================================

/**
 * Insert a new commit v3
 *
 * @param db - Database instance
 * @param input - Commit data
 * @param options - Optional settings (strictParents defaults to true)
 * @throws ParentNotFoundError if strictParents=true and any parent doesn't exist
 */
export async function createCommitV3(
  db: AnyDB,
  input: CreateCommitV3Input,
  options: CreateCommitV3Options = {}
): Promise<CommitV3Output> {
  const { strictParents = true } = options;
  const parents = input.parents ?? [];

  // Validate parents exist if strict mode
  if (strictParents && parents.length > 0) {
    const existingParents = await db
      .select({ hash: commitsV3.hash })
      .from(commitsV3)
      .where(inArray(commitsV3.hash, parents));

    const existingHashes = new Set(existingParents.map((p) => p.hash));
    const missingParents = parents.filter((h) => !existingHashes.has(h));

    if (missingParents.length > 0) {
      throw new ParentNotFoundError(missingParents, parents);
    }
  }

  const [row] = await db
    .insert(commitsV3)
    .values({
      hash: input.hash,
      schema: input.schema ?? 'commit/v3',
      parents,
      author: input.author,
      committedAt: input.committedAt,
      content: input.content,
      projectId: input.projectId ?? null,
      message: input.message ?? null,
      branch: input.branch ?? null,
      positionX: input.position?.x ?? null,
      positionY: input.position?.y ?? null,
    })
    .returning();

  return rowToCommitV3(row);
}

/**
 * Get a commit v3 by hash
 */
export async function getCommitV3(db: AnyDB, hash: string): Promise<CommitV3Output | null> {
  const [row] = await db.select().from(commitsV3).where(eq(commitsV3.hash, hash)).limit(1);

  return row ? rowToCommitV3(row) : null;
}

/**
 * List commits v3 by project
 *
 * Branch filtering is done at SQL level to ensure correct pagination.
 * Uses committedAt DESC, hash ASC for stable ordering when timestamps match.
 */
export async function listCommitsV3(
  db: AnyDB,
  options: ListCommitsV3Options
): Promise<CommitV3Output[]> {
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  // Build WHERE clause: always filter by projectId, optionally by branch
  const whereClause = options.branch
    ? and(eq(commitsV3.projectId, options.projectId), eq(commitsV3.branch, options.branch))
    : eq(commitsV3.projectId, options.projectId);

  const rows = await db
    .select()
    .from(commitsV3)
    .where(whereClause)
    .orderBy(desc(commitsV3.committedAt), commitsV3.hash) // Secondary sort by hash for stability
    .limit(limit)
    .offset(offset);

  return rows.map(rowToCommitV3);
}

/**
 * Update commit v3 position
 *
 * Supports partial updates (only x or only y).
 * Reads raw DB values to preserve existing coordinates during partial updates.
 */
export async function updateCommitV3Position(
  db: AnyDB,
  hash: string,
  position: { x?: number; y?: number }
): Promise<CommitV3Output | null> {
  // Read raw DB values (not the output which only has position when both are set)
  const [existing] = await db.select().from(commitsV3).where(eq(commitsV3.hash, hash)).limit(1);

  if (!existing) return null;

  // Merge with existing DB values for partial updates
  const newX = position.x !== undefined ? position.x : existing.positionX;
  const newY = position.y !== undefined ? position.y : existing.positionY;

  const [updated] = await db
    .update(commitsV3)
    .set({
      positionX: newX,
      positionY: newY,
      updatedAt: new Date(),
    })
    .where(eq(commitsV3.hash, hash))
    .returning();

  return updated ? rowToCommitV3(updated) : null;
}

/**
 * Delete a commit v3 by hash
 */
export async function deleteCommitV3(db: AnyDB, hash: string): Promise<boolean> {
  const result = await db.delete(commitsV3).where(eq(commitsV3.hash, hash)).returning();

  return result.length > 0;
}

/**
 * Get commit v3 parents
 *
 * Uses single query with WHERE IN to avoid N+1 problem.
 * Returns parents in the same order as the parents array.
 */
export async function getCommitV3Parents(db: AnyDB, hash: string): Promise<CommitV3Output[]> {
  const commit = await getCommitV3(db, hash);
  if (!commit || commit.parents.length === 0) return [];

  // Single query to get all parents
  const rows = await db.select().from(commitsV3).where(inArray(commitsV3.hash, commit.parents));

  // Create a map for O(1) lookup
  const parentMap = new Map<string, CommitV3Output>();
  for (const row of rows) {
    parentMap.set(row.hash, rowToCommitV3(row));
  }

  // Return in the original order of commit.parents
  const result: CommitV3Output[] = [];
  for (const parentHash of commit.parents) {
    const parent = parentMap.get(parentHash);
    if (parent) result.push(parent);
  }

  return result;
}

/**
 * Get multiple commits v3 by hashes
 *
 * Batch query utility to avoid N+1 when fetching multiple commits.
 * Returns commits in the same order as the input hashes array.
 * Missing hashes are skipped (no nulls in result).
 */
export async function getCommitsV3ByHashes(db: AnyDB, hashes: string[]): Promise<CommitV3Output[]> {
  if (hashes.length === 0) return [];

  const rows = await db.select().from(commitsV3).where(inArray(commitsV3.hash, hashes));

  // Create a map for O(1) lookup
  const commitMap = new Map<string, CommitV3Output>();
  for (const row of rows) {
    commitMap.set(row.hash, rowToCommitV3(row));
  }

  // Return in the original order of input hashes
  const result: CommitV3Output[] = [];
  for (const hash of hashes) {
    const commit = commitMap.get(hash);
    if (commit) result.push(commit);
  }

  return result;
}

// ============================================================
// History & Ancestry Functions
// ============================================================

/**
 * Walk the parent chain from a given commit using a recursive CTE.
 *
 * Replaces the former in-memory BFS with a single PostgreSQL
 * `WITH RECURSIVE` query that traverses the parents text[] array
 * directly in SQL, eliminating N+1 queries.
 *
 * Returns commits in BFS-like order (by depth).
 * Missing parent commits (dangling references) are silently skipped
 * by the JOIN condition.
 */
export async function findCommitV3History(
  db: AnyDB,
  commitHash: string,
  limit = 50
): Promise<CommitV3Output[]> {
  const MAX_DEPTH = 1000;

  const rows = Array.from(
    await db.execute(sql`
      WITH RECURSIVE history AS (
        SELECT c.*, 0 AS depth, ARRAY[c.hash] AS visited
        FROM commits_v3 c
        WHERE c.hash = ${commitHash}

        UNION ALL

        SELECT c.*, h.depth + 1, h.visited || c.hash
        FROM history h,
             unnest(h.parents) AS parent_hash
        JOIN commits_v3 c ON c.hash = parent_hash
        WHERE h.depth < ${MAX_DEPTH}
          AND NOT (c.hash = ANY(h.visited))
      ),
      deduped AS (
        SELECT DISTINCT ON (hash) hash, schema, parents, author, committed_at,
               content, project_id, message, branch,
               position_x, position_y, created_at, updated_at, depth
        FROM history
        ORDER BY hash, depth
      )
      SELECT * FROM deduped
      ORDER BY depth, hash
      LIMIT ${limit}
    `)
  ) as Record<string, unknown>[];

  return rows.map(rawRowToCommitV3);
}

/**
 * Find common ancestor of two commits using a recursive CTE.
 *
 * Walks both ancestor trees in SQL and uses INTERSECT to find
 * the most recent common ancestor (by committed_at DESC).
 * Returns null if no common ancestor is found (disjoint histories).
 */
export async function findCommonAncestorV3(
  db: AnyDB,
  hash1: string,
  hash2: string
): Promise<CommitV3Output | null> {
  const MAX_DEPTH = 1000;

  const rows = Array.from(
    await db.execute(sql`
      WITH RECURSIVE
        ancestors1 AS (
          SELECT hash, parents, 0 AS depth, ARRAY[hash] AS visited
          FROM commits_v3
          WHERE hash = ${hash1}

          UNION ALL

          SELECT c.hash, c.parents, a.depth + 1, a.visited || c.hash
          FROM ancestors1 a,
               unnest(a.parents) AS ph
          JOIN commits_v3 c ON c.hash = ph
          WHERE a.depth < ${MAX_DEPTH}
            AND NOT (c.hash = ANY(a.visited))
        ),
        ancestors2 AS (
          SELECT hash, parents, 0 AS depth, ARRAY[hash] AS visited
          FROM commits_v3
          WHERE hash = ${hash2}

          UNION ALL

          SELECT c.hash, c.parents, a.depth + 1, a.visited || c.hash
          FROM ancestors2 a,
               unnest(a.parents) AS ph
          JOIN commits_v3 c ON c.hash = ph
          WHERE a.depth < ${MAX_DEPTH}
            AND NOT (c.hash = ANY(a.visited))
        )
      SELECT c.hash, c.schema, c.parents, c.author, c.committed_at,
             c.content, c.project_id, c.message, c.branch,
             c.position_x, c.position_y, c.created_at, c.updated_at
      FROM commits_v3 c
      WHERE c.hash IN (
        SELECT a1.hash
        FROM (SELECT DISTINCT hash, MIN(depth) AS min_depth FROM ancestors1 GROUP BY hash) a1
        JOIN (SELECT DISTINCT hash, MIN(depth) AS min_depth FROM ancestors2 GROUP BY hash) a2
          ON a1.hash = a2.hash
        ORDER BY a1.min_depth + a2.min_depth
        LIMIT 1
      )
      LIMIT 1
    `)
  ) as Record<string, unknown>[];

  return rows.length > 0 ? rawRowToCommitV3(rows[0]) : null;
}

// ============================================================
// Helpers
// ============================================================

/**
 * Defensively parse a PostgreSQL text[] value that may arrive as a
 * `{val1,val2}` string literal from some drivers, or as a JSON string.
 */
function parseArray(val: unknown): string[] {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    // PostgreSQL text[] literal: {val1,val2}
    if (val.startsWith('{') && val.endsWith('}')) {
      return val.slice(1, -1).split(',').filter(Boolean);
    }
    return JSON.parse(val);
  }
  return [];
}

/**
 * Defensively parse a JSONB value that may arrive as a JSON string
 * (e.g. from some PostgreSQL drivers or raw SQL results).
 */
function parseJsonb<T>(val: unknown): T {
  return typeof val === 'string' ? JSON.parse(val) : (val as T);
}

/**
 * Convert raw SQL result row to CommitV3Output type.
 * Used for recursive CTE results where Drizzle ORM types are not available.
 */
function rawRowToCommitV3(row: Record<string, unknown>): CommitV3Output {
  const positionX = row.position_x as number | null;
  const positionY = row.position_y as number | null;
  const position =
    positionX != null && positionY != null ? { x: positionX, y: positionY } : undefined;

  const committedAt = row.committed_at;
  const createdAt = row.created_at;
  const updatedAt = row.updated_at;

  return {
    hash: row.hash as string,
    schema: row.schema as string,
    parents: parseArray(row.parents),
    author: parseJsonb<CommitV3Author>(row.author),
    committedAt: committedAt instanceof Date ? committedAt.toISOString() : String(committedAt),
    content: parseJsonb<CommitV3Content>(row.content),
    projectId: (row.project_id as string) ?? null,
    message: (row.message as string) ?? null,
    branch: (row.branch as string) ?? null,
    position,
    createdAt: createdAt instanceof Date ? createdAt.toISOString() : String(createdAt),
    updatedAt: updatedAt instanceof Date ? updatedAt.toISOString() : String(updatedAt),
  };
}

/**
 * Convert database row to output type (camelCase)
 */
function rowToCommitV3(row: CommitV3): CommitV3Output {
  // Only return position when BOTH x and y are set
  // This preserves the distinction between "not set" and "set to 0"
  const position =
    row.positionX != null && row.positionY != null
      ? { x: row.positionX, y: row.positionY }
      : undefined;

  return {
    hash: row.hash,
    schema: row.schema,
    parents: row.parents,
    author: row.author as CommitV3Author,
    committedAt: row.committedAt.toISOString(),
    content: row.content as CommitV3Content,
    projectId: row.projectId,
    message: row.message,
    branch: row.branch,
    position,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
