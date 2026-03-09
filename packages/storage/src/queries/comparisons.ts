/**
 * Comparisons Queries
 *
 * CRUD operations for saved A/B comparison snapshots.
 */
import { and, desc, eq, lt, or } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { type SavedComparison, savedComparisons } from '../schema';
import { type CursorPage, decodeCursor, toCursorPage } from './pagination';

// ============================================================
// Types
// ============================================================

export interface CreateComparisonInput {
  comparison_id: string;
  project_id?: string | null;
  title: string;
  control_config: { model: string; prompt_version: string };
  treatment_config: { model: string; prompt_version: string };
  control_run_ids: string[];
  treatment_run_ids: string[];
  result_snapshot: Record<string, unknown>;
}

// ============================================================
// CRUD
// ============================================================

/**
 * Insert a new saved comparison.
 */
export async function createComparison(db: AnyDB, input: CreateComparisonInput) {
  const [row] = await db
    .insert(savedComparisons)
    .values({
      comparisonId: input.comparison_id,
      projectId: input.project_id || null,
      title: input.title,
      controlConfig: input.control_config,
      treatmentConfig: input.treatment_config,
      controlRunIds: input.control_run_ids,
      treatmentRunIds: input.treatment_run_ids,
      resultSnapshot: input.result_snapshot,
      createdAt: new Date(),
    })
    .returning();
  return row;
}

export interface ListComparisonsOptions {
  limit?: number;
  offset?: number;
  /** Opaque cursor for keyset pagination. Empty string = first page in cursor mode. */
  cursor?: string;
}

/**
 * List saved comparisons for a project (most recent first).
 */
export async function listComparisons(
  db: AnyDB,
  projectId: string | null | undefined,
  opts: ListComparisonsOptions & { cursor: string }
): Promise<CursorPage<SavedComparison>>;
export async function listComparisons(
  db: AnyDB,
  projectId?: string | null,
  opts?: Omit<ListComparisonsOptions, 'cursor'>
): Promise<SavedComparison[]>;
export async function listComparisons(
  db: AnyDB,
  projectId?: string | null,
  opts?: ListComparisonsOptions
): Promise<SavedComparison[] | CursorPage<SavedComparison>> {
  const limit = opts?.limit ?? 100;

  if (opts?.cursor !== undefined) {
    // Cursor pagination mode
    const conditions = [];
    if (projectId) {
      conditions.push(eq(savedComparisons.projectId, projectId));
    }

    if (opts.cursor !== '') {
      const { t, k } = decodeCursor(opts.cursor);
      const cursorDate = new Date(t);
      // Keyset: (created_at < t) OR (created_at = t AND comparison_id < k)
      conditions.push(
        or(
          lt(savedComparisons.createdAt, cursorDate),
          and(eq(savedComparisons.createdAt, cursorDate), lt(savedComparisons.comparisonId, k))
        )!
      );
    }

    const rows = await db
      .select()
      .from(savedComparisons)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(savedComparisons.createdAt), desc(savedComparisons.comparisonId))
      .limit(limit + 1);

    return toCursorPage(rows, limit, (c) => ({
      t: c.createdAt.toISOString(),
      k: c.comparisonId,
    }));
  }

  // Legacy offset/limit mode
  const offset = opts?.offset ?? 0;
  const query = db
    .select()
    .from(savedComparisons)
    .orderBy(desc(savedComparisons.createdAt))
    .limit(limit)
    .offset(offset);
  if (projectId) {
    return query.where(eq(savedComparisons.projectId, projectId));
  }
  return query;
}

/**
 * Get a single comparison by ID.
 */
export async function getComparison(db: AnyDB, comparisonId: string) {
  const [row] = await db
    .select()
    .from(savedComparisons)
    .where(eq(savedComparisons.comparisonId, comparisonId))
    .limit(1);
  return row ?? null;
}

/**
 * Delete a comparison by ID. Returns true if a row was deleted.
 */
export async function deleteComparison(db: AnyDB, comparisonId: string): Promise<boolean> {
  const result = await db
    .delete(savedComparisons)
    .where(eq(savedComparisons.comparisonId, comparisonId))
    .returning();
  return result.length > 0;
}
