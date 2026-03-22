/**
 * Leaf Output Edits Queries
 *
 * Tracks user edits on leaf output for constraint reverse learning (Item 17).
 */

import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { type LeafOutputEditRecord, leafOutputEdits } from '../schema-frames';

// ============================================================
// Types
// ============================================================

export interface CreateLeafOutputEditInput {
  leaf_id: string;
  project_id: string;
  original_output: string;
  modified_output: string;
}

export interface ListLeafOutputEditsOptions {
  limit?: number;
}

// ============================================================
// Queries
// ============================================================

/**
 * Record a user edit on leaf output.
 */
export async function insertLeafOutputEdit(
  db: AnyDB,
  input: CreateLeafOutputEditInput
): Promise<LeafOutputEditRecord> {
  const id = `ledit_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

  const [result] = await db
    .insert(leafOutputEdits)
    .values({
      id,
      leafId: input.leaf_id,
      projectId: input.project_id,
      originalOutput: input.original_output,
      modifiedOutput: input.modified_output,
    })
    .returning();

  return result;
}

/**
 * List edits for a specific leaf, most recent first.
 */
export async function findEditsByLeafId(
  db: AnyDB,
  leafId: string,
  options?: ListLeafOutputEditsOptions
): Promise<LeafOutputEditRecord[]> {
  const limit = options?.limit ?? 50;

  return db
    .select()
    .from(leafOutputEdits)
    .where(eq(leafOutputEdits.leafId, leafId))
    .orderBy(desc(leafOutputEdits.createdAt))
    .limit(limit);
}

/**
 * List edits for a project (across all leaves), most recent first.
 */
export async function findEditsByProject(
  db: AnyDB,
  projectId: string,
  options?: ListLeafOutputEditsOptions
): Promise<LeafOutputEditRecord[]> {
  const limit = options?.limit ?? 50;

  return db
    .select()
    .from(leafOutputEdits)
    .where(eq(leafOutputEdits.projectId, projectId))
    .orderBy(desc(leafOutputEdits.createdAt))
    .limit(limit);
}

/**
 * Delete all edits for a leaf.
 */
export async function deleteEditsByLeafId(db: AnyDB, leafId: string): Promise<number> {
  const result = await db
    .delete(leafOutputEdits)
    .where(eq(leafOutputEdits.leafId, leafId))
    .returning();
  return result.length;
}
