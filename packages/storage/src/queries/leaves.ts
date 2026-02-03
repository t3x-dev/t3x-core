/**
 * Leaves Queries
 *
 * CRUD operations for leaves table using Drizzle ORM.
 * Leaves own constraints, output, and validation results.
 *
 * Key V4 insight: Same commit can have multiple leaves with different constraints.
 *
 * @see docs/specification/semantic-layer-architecture.md
 */

import type {
  Assertion,
  ConstraintV4 as Constraint,
  CreateLeafInput,
  Leaf,
  LeafConfig,
  LeafType,
} from '@t3x/core';
import { generateAssertionId, generateConstraintId, generateLeafId } from '@t3x/core';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { type LeafRecord, leaves } from '../schema-v4';

// ============================================================
// Types
// ============================================================

export interface ListLeavesOptions {
  limit?: number;
  offset?: number;
  type?: LeafType;
}

/**
 * Input for updating a leaf
 */
export interface UpdateLeafInput {
  title?: string;
  constraints?: Constraint[];
  config?: LeafConfig;
  output?: string;
  assertions?: Assertion[];
}

// ============================================================
// Query Functions
// ============================================================

/**
 * Create a new Leaf
 *
 * @param db - Database instance
 * @param input - Leaf data
 * @returns Created leaf
 */
export async function createLeaf(db: AnyDB, input: CreateLeafInput): Promise<Leaf> {
  const id = generateLeafId();
  const now = new Date();

  // Generate IDs for constraints if not provided
  const constraints: Constraint[] = (input.constraints ?? []).map((c) => ({
    ...c,
    id: c.id || generateConstraintId(),
  }));

  const [row] = await db
    .insert(leaves)
    .values({
      id,
      commitHash: input.commit_hash,
      type: input.type,
      title: input.title ?? null,
      constraints,
      config: input.config ?? {},
      projectId: input.project_id,
      createdAt: now,
      createdBy: input.created_by ?? null,
    })
    .returning();

  return rowToLeaf(row);
}

/**
 * Find a Leaf by ID
 */
export async function findLeafById(db: AnyDB, id: string): Promise<Leaf | null> {
  const [row] = await db.select().from(leaves).where(eq(leaves.id, id)).limit(1);

  return row ? rowToLeaf(row) : null;
}

/**
 * Find all Leaves for a commit
 *
 * Returns leaves ordered by createdAt descending.
 * Optionally filter by leaf type.
 */
export async function findLeavesByCommit(
  db: AnyDB,
  commitHash: string,
  options: ListLeavesOptions = {}
): Promise<Leaf[]> {
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  const conditions = [eq(leaves.commitHash, commitHash)];
  if (options.type) {
    conditions.push(eq(leaves.type, options.type));
  }

  const rows = await db
    .select()
    .from(leaves)
    .where(and(...conditions))
    .orderBy(desc(leaves.createdAt), leaves.id)
    .limit(limit)
    .offset(offset);

  return rows.map(rowToLeaf);
}

/**
 * Find all Leaves for a project
 *
 * Returns leaves ordered by createdAt descending.
 * Optionally filter by leaf type.
 */
export async function findLeavesByProject(
  db: AnyDB,
  projectId: string,
  options: ListLeavesOptions = {}
): Promise<Leaf[]> {
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  const conditions = [eq(leaves.projectId, projectId)];
  if (options.type) {
    conditions.push(eq(leaves.type, options.type));
  }

  const rows = await db
    .select()
    .from(leaves)
    .where(and(...conditions))
    .orderBy(desc(leaves.createdAt), leaves.id)
    .limit(limit)
    .offset(offset);

  return rows.map(rowToLeaf);
}

/**
 * Update a Leaf
 *
 * @param db - Database instance
 * @param id - Leaf ID
 * @param updates - Fields to update
 * @returns Updated leaf or null if not found
 */
export async function updateLeaf(
  db: AnyDB,
  id: string,
  updates: UpdateLeafInput
): Promise<Leaf | null> {
  const updateData: Record<string, unknown> = {};

  if (updates.title !== undefined) {
    updateData.title = updates.title;
  }
  if (updates.constraints !== undefined) {
    // Generate IDs for constraints if not provided
    updateData.constraints = updates.constraints.map((c) => ({
      ...c,
      id: c.id || generateConstraintId(),
    }));
  }
  if (updates.config !== undefined) {
    updateData.config = updates.config;
  }
  if (updates.output !== undefined) {
    updateData.output = updates.output;
    updateData.generatedAt = new Date();
  }
  if (updates.assertions !== undefined) {
    // Generate IDs for assertions if not provided
    updateData.assertions = updates.assertions.map((a) => ({
      ...a,
      id: a.id || generateAssertionId(),
    }));
  }

  if (Object.keys(updateData).length === 0) {
    return findLeafById(db, id);
  }

  const [updated] = await db.update(leaves).set(updateData).where(eq(leaves.id, id)).returning();

  return updated ? rowToLeaf(updated) : null;
}

/**
 * Update leaf output
 *
 * Convenience method for setting generated content.
 */
export async function updateLeafOutput(
  db: AnyDB,
  id: string,
  output: string
): Promise<Leaf | null> {
  const [updated] = await db
    .update(leaves)
    .set({
      output,
      generatedAt: new Date(),
    })
    .where(eq(leaves.id, id))
    .returning();

  return updated ? rowToLeaf(updated) : null;
}

/**
 * Update leaf assertions
 *
 * Convenience method for setting validation results.
 * Generates IDs for assertions if not provided.
 */
export async function updateLeafAssertions(
  db: AnyDB,
  id: string,
  assertions: Assertion[]
): Promise<Leaf | null> {
  // Generate IDs for assertions if not provided
  const assertionsWithIds = assertions.map((a) => ({
    ...a,
    id: a.id || generateAssertionId(),
  }));

  const [updated] = await db
    .update(leaves)
    .set({ assertions: assertionsWithIds })
    .where(eq(leaves.id, id))
    .returning();

  return updated ? rowToLeaf(updated) : null;
}

/**
 * Delete a Leaf by ID
 *
 * @returns true if deleted, false if not found
 */
export async function deleteLeaf(db: AnyDB, id: string): Promise<boolean> {
  const result = await db.delete(leaves).where(eq(leaves.id, id)).returning();

  return result.length > 0;
}

/**
 * Get multiple Leaves by IDs
 *
 * Batch query utility to avoid N+1 when fetching multiple leaves.
 * Returns leaves in the same order as the input IDs array.
 * Missing IDs are skipped (no nulls in result).
 */
export async function getLeavesByIds(db: AnyDB, ids: string[]): Promise<Leaf[]> {
  if (ids.length === 0) return [];

  const rows = await db.select().from(leaves).where(inArray(leaves.id, ids));

  // Create a map for O(1) lookup
  const leafMap = new Map<string, Leaf>();
  for (const row of rows) {
    leafMap.set(row.id, rowToLeaf(row));
  }

  // Return in the original order of input IDs
  const result: Leaf[] = [];
  for (const id of ids) {
    const leaf = leafMap.get(id);
    if (leaf) result.push(leaf);
  }

  return result;
}

// ============================================================
// Helpers
// ============================================================

/**
 * Convert database row to Leaf type
 */
function rowToLeaf(row: LeafRecord): Leaf {
  return {
    id: row.id,
    commit_hash: row.commitHash,
    type: row.type as LeafType,
    title: row.title ?? undefined,
    constraints: row.constraints as Constraint[],
    config: row.config as LeafConfig,
    output: row.output ?? undefined,
    generated_at: row.generatedAt?.toISOString(),
    assertions: row.assertions as Assertion[] | undefined,
    project_id: row.projectId,
    created_at: row.createdAt.toISOString(),
    created_by: row.createdBy ?? undefined,
  };
}
