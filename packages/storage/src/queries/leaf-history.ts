/**
 * Leaf History Queries
 *
 * CRUD operations for leaf_history table using Drizzle ORM.
 * Stores generation history for each leaf.
 *
 * @see packages/core/src/types/index.ts for LeafHistory type
 */

import type { CreateLeafHistoryInput, LeafConfig, LeafHistory } from '@t3x-dev/core';
import { generateLeafHistoryId } from '@t3x-dev/core';
import { asc, count, desc, eq } from 'drizzle-orm';

import type { AnyDB } from '../adapters';
import { type LeafHistoryRecord, leafHistory } from '../schema-trees';

// ============================================================
// Types
// ============================================================

export interface ListLeafHistoryOptions {
  limit?: number;
  offset?: number;
}

/**
 * Extended input that includes S16 columns (attempt_number, prompt_used).
 * The base CreateLeafHistoryInput from @t3x-dev/core is not modified;
 * extra fields are handled at the storage layer only.
 */
export type CreateLeafHistoryInputExtended = CreateLeafHistoryInput & {
  attempt_number?: number;
  prompt_used?: string;
};

// ============================================================
// Query Functions
// ============================================================

/**
 * Create a new LeafHistory entry
 *
 * @param db - Database instance
 * @param input - History data (accepts base or extended input with S16 columns)
 * @returns Created history entry
 */
export async function createLeafHistory(
  db: AnyDB,
  input: CreateLeafHistoryInputExtended
): Promise<LeafHistory & { attempt_number: number; prompt_used?: string }> {
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
      attemptNumber: input.attempt_number ?? 1,
      promptUsed: input.prompt_used ?? null,
    })
    .returning();

  return rowToLeafHistory(row);
}

/**
 * Find a LeafHistory entry by ID
 */
export async function findLeafHistoryById(
  db: AnyDB,
  id: string
): Promise<(LeafHistory & { attempt_number: number; prompt_used?: string }) | null> {
  const [row] = await db.select().from(leafHistory).where(eq(leafHistory.id, id)).limit(1);

  return row ? rowToLeafHistory(row) : null;
}

/**
 * Find all history entries for a Leaf
 *
 * Returns history ordered by generatedAt descending (newest first),
 * then by attemptNumber ascending as secondary sort.
 */
export async function findHistoryByLeafId(
  db: AnyDB,
  leafId: string,
  options: ListLeafHistoryOptions = {}
): Promise<(LeafHistory & { attempt_number: number; prompt_used?: string })[]> {
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  const rows = await db
    .select()
    .from(leafHistory)
    .where(eq(leafHistory.leafId, leafId))
    .orderBy(desc(leafHistory.generatedAt), leafHistory.attemptNumber, leafHistory.id)
    .limit(limit)
    .offset(offset);

  return rows.map(rowToLeafHistory);
}

/**
 * Count history entries for a Leaf
 */
export async function countHistoryByLeafId(db: AnyDB, leafId: string): Promise<number> {
  const rows = await db
    .select({ count: count() })
    .from(leafHistory)
    .where(eq(leafHistory.leafId, leafId));

  return rows[0]?.count ?? 0;
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

/**
 * Find all history entries for a Leaf ordered by attempt_number ASC.
 *
 * Useful for viewing the corrective iteration sequence.
 */
export async function findHistoryByLeafIdOrderedByAttempt(
  db: AnyDB,
  leafId: string
): Promise<(LeafHistory & { attempt_number: number; prompt_used?: string })[]> {
  const rows = await db
    .select()
    .from(leafHistory)
    .where(eq(leafHistory.leafId, leafId))
    .orderBy(asc(leafHistory.attemptNumber), leafHistory.id);

  return rows.map(rowToLeafHistory);
}

// ============================================================
// Helpers
// ============================================================

/**
 * Convert database row to LeafHistory type (including S16 columns)
 */
function rowToLeafHistory(
  row: LeafHistoryRecord
): LeafHistory & { attempt_number: number; prompt_used?: string } {
  return {
    id: row.id,
    leaf_id: row.leafId,
    output: row.output,
    config: row.config as LeafConfig,
    model: row.model,
    generated_at: row.generatedAt.toISOString(),
    created_by: row.createdBy ?? undefined,
    attempt_number: row.attemptNumber,
    prompt_used: row.promptUsed ?? undefined,
  };
}
