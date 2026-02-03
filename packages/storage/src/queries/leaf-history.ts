/**
 * Leaf History Queries
 *
 * CRUD operations for leaf_history table using Drizzle ORM.
 * Stores generation history for each leaf.
 *
 * @see packages/core/src/types/v4/index.ts for LeafHistory type
 */

import type { CreateLeafHistoryInput, LeafConfig, LeafHistory } from '@t3x/core';
import { generateLeafHistoryId } from '@t3x/core';
import { desc, eq } from 'drizzle-orm';

import type { AnyDB } from '../adapters';
import { type LeafHistoryRecord, leafHistory } from '../schema-v4';

// ============================================================
// Types
// ============================================================

export interface ListLeafHistoryOptions {
  limit?: number;
  offset?: number;
}

// ============================================================
// Query Functions
// ============================================================

/**
 * Create a new LeafHistory entry
 *
 * @param db - Database instance
 * @param input - History data
 * @returns Created history entry
 */
export async function createLeafHistory(
  db: AnyDB,
  input: CreateLeafHistoryInput
): Promise<LeafHistory> {
  const id = generateLeafHistoryId();
  const now = new Date();

  const [row] = await db
    .insert(leafHistory)
    .values({
      id,
      leafId: input.leaf_id,
      output: input.output,
      config: input.config,
      model: input.model,
      generatedAt: now,
      createdBy: input.created_by ?? null,
    })
    .returning();

  return rowToLeafHistory(row);
}

/**
 * Find a LeafHistory entry by ID
 */
export async function findLeafHistoryById(db: AnyDB, id: string): Promise<LeafHistory | null> {
  const [row] = await db.select().from(leafHistory).where(eq(leafHistory.id, id)).limit(1);

  return row ? rowToLeafHistory(row) : null;
}

/**
 * Find all history entries for a Leaf
 *
 * Returns history ordered by generatedAt descending (newest first).
 */
export async function findHistoryByLeafId(
  db: AnyDB,
  leafId: string,
  options: ListLeafHistoryOptions = {}
): Promise<LeafHistory[]> {
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  const rows = await db
    .select()
    .from(leafHistory)
    .where(eq(leafHistory.leafId, leafId))
    .orderBy(desc(leafHistory.generatedAt), leafHistory.id)
    .limit(limit)
    .offset(offset);

  return rows.map(rowToLeafHistory);
}

/**
 * Count history entries for a Leaf
 */
export async function countHistoryByLeafId(db: AnyDB, leafId: string): Promise<number> {
  const rows = await db.select().from(leafHistory).where(eq(leafHistory.leafId, leafId));

  return rows.length;
}

/**
 * Delete a LeafHistory entry by ID
 *
 * @returns true if deleted, false if not found
 */
export async function deleteLeafHistory(db: AnyDB, id: string): Promise<boolean> {
  const result = await db.delete(leafHistory).where(eq(leafHistory.id, id)).returning();

  return result.length > 0;
}

/**
 * Delete all history entries for a Leaf
 *
 * @returns number of deleted entries
 */
export async function deleteHistoryByLeafId(db: AnyDB, leafId: string): Promise<number> {
  const result = await db.delete(leafHistory).where(eq(leafHistory.leafId, leafId)).returning();

  return result.length;
}

// ============================================================
// Helpers
// ============================================================

/**
 * Convert database row to LeafHistory type
 */
function rowToLeafHistory(row: LeafHistoryRecord): LeafHistory {
  return {
    id: row.id,
    leaf_id: row.leafId,
    output: row.output,
    config: row.config as LeafConfig,
    model: row.model,
    generated_at: row.generatedAt.toISOString(),
    created_by: row.createdBy ?? undefined,
  };
}
