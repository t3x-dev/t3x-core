/**
 * Comparisons Queries
 *
 * CRUD operations for saved A/B comparison snapshots.
 */
import { desc, eq } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { savedComparisons } from '../schema';

// ============================================================
// Types
// ============================================================

export interface CreateComparisonInput {
  comparison_id: string;
  project_id: string;
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
      projectId: input.project_id,
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

/**
 * List saved comparisons for a project (most recent first).
 */
export async function listComparisons(
  db: AnyDB,
  projectId: string,
  opts?: { limit?: number; offset?: number }
) {
  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;
  return db
    .select()
    .from(savedComparisons)
    .where(eq(savedComparisons.projectId, projectId))
    .orderBy(desc(savedComparisons.createdAt))
    .limit(limit)
    .offset(offset);
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
