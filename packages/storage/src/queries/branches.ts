/**
 * Branches Queries
 *
 * CRUD operations for branches using Drizzle ORM.
 */

import { generateBranchId } from '@t3x/core';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { type Branch, branches } from '../schema';

export interface CreateBranchInput {
  projectId: string;
  name: string;
  parentBranch?: string;
  description?: string;
}

export interface ListBranchesOptions {
  projectId: string;
  limit?: number;
  offset?: number;
}

/**
 * Insert a new branch
 *
 * Fix 5: Wrap the count + insert inside a transaction to prevent a TOCTOU race
 * where two concurrent insertBranch calls both observe count=0 and both try to
 * set isCurrent=1.
 */
export async function insertBranch(db: AnyDB, input: CreateBranchInput): Promise<Branch> {
  const branchId = generateBranchId();
  const now = new Date();

  return db.transaction(async (tx) => {
    // Check if this is the first branch for the project (inside transaction)
    const [countResult] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(branches)
      .where(eq(branches.projectId, input.projectId));

    const isCurrent = Number(countResult?.count ?? 0) === 0 ? 1 : 0;

    // If parent branch specified, get its head commit
    let headCommitHash: string | null = null;
    if (input.parentBranch) {
      const parent = await findBranchByName(tx as AnyDB, input.projectId, input.parentBranch);
      headCommitHash = parent?.headCommitHash ?? null;
    }

    const [branch] = await tx
      .insert(branches)
      .values({
        branchId,
        projectId: input.projectId,
        name: input.name,
        parentBranch: input.parentBranch ?? null,
        headCommitHash,
        description: input.description ?? null,
        isCurrent,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return branch;
  });
}

/**
 * Find branch by project and name
 */
export async function findBranchByName(
  db: AnyDB,
  projectId: string,
  name: string
): Promise<Branch | null> {
  const [branch] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.projectId, projectId), eq(branches.name, name)))
    .limit(1);

  return branch ?? null;
}

/**
 * Find branch by ID
 */
export async function findBranchById(db: AnyDB, branchId: string): Promise<Branch | null> {
  const [branch] = await db.select().from(branches).where(eq(branches.branchId, branchId)).limit(1);

  return branch ?? null;
}

/**
 * Find branches by project
 */
export async function findBranchesByProject(
  db: AnyDB,
  options: ListBranchesOptions
): Promise<Branch[]> {
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  return db
    .select()
    .from(branches)
    .where(eq(branches.projectId, options.projectId))
    .orderBy(desc(branches.isCurrent), desc(branches.updatedAt))
    .limit(limit)
    .offset(offset);
}

/**
 * Find current branch for project
 */
export async function findCurrentBranch(db: AnyDB, projectId: string): Promise<Branch | null> {
  const [branch] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.projectId, projectId), eq(branches.isCurrent, 1)))
    .limit(1);

  return branch ?? null;
}

/**
 * Switch to a different branch
 *
 * Fix 2: Make atomic. Both UPDATE statements (unset all current, set target
 * current) are wrapped in a single transaction so no window exists where zero
 * or two branches are simultaneously marked as current.
 */
export async function switchBranch(
  db: AnyDB,
  projectId: string,
  branchName: string
): Promise<Branch | null> {
  const branch = await findBranchByName(db, projectId, branchName);
  if (!branch) return null;

  return db.transaction(async (tx) => {
    const now = new Date();

    // Unset current on all branches
    await tx
      .update(branches)
      .set({ isCurrent: 0, updatedAt: now })
      .where(eq(branches.projectId, projectId));

    // Set current on target branch
    const [updated] = await tx
      .update(branches)
      .set({ isCurrent: 1, updatedAt: now })
      .where(and(eq(branches.projectId, projectId), eq(branches.name, branchName)))
      .returning();

    return updated ?? null;
  });
}

/**
 * Update branch head commit
 */
export async function updateBranchHead(
  db: AnyDB,
  projectId: string,
  branchName: string,
  commitHash: string
): Promise<Branch | null> {
  const now = new Date();

  const [updated] = await db
    .update(branches)
    .set({ headCommitHash: commitHash, updatedAt: now })
    .where(and(eq(branches.projectId, projectId), eq(branches.name, branchName)))
    .returning();

  return updated ?? null;
}

/**
 * Delete a branch
 *
 * Fix 8: Wrap in transaction. The existence/currency check and the DELETE are
 * wrapped in a transaction so a concurrent switchBranch call cannot make this
 * branch current between the read and the delete.
 */
export async function deleteBranch(
  db: AnyDB,
  projectId: string,
  branchName: string
): Promise<boolean> {
  return db.transaction(async (tx) => {
    // Don't delete current branch — re-read inside the transaction
    const branch = await findBranchByName(tx as AnyDB, projectId, branchName);
    if (!branch || branch.isCurrent === 1) return false;

    const result = await tx
      .delete(branches)
      .where(and(eq(branches.projectId, projectId), eq(branches.name, branchName)))
      .returning();

    return result.length > 0;
  });
}

/**
 * Ensure main branch exists for project
 */
export async function ensureMainBranch(db: AnyDB, projectId: string): Promise<Branch> {
  const existing = await findBranchByName(db, projectId, 'main');
  if (existing) return existing;

  return insertBranch(db, { projectId, name: 'main' });
}
