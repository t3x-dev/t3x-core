/**
 * Merge Drafts Queries
 *
 * CRUD operations for merge drafts using Drizzle ORM.
 * Merge drafts store the intermediate state of merge operations,
 * allowing users to save progress and resume later.
 */

import { generateMergeDraftId } from '@t3x-dev/core';
import { and, desc, eq } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { type MergeDraft, mergeDrafts, type NewMergeDraft } from '../schema';

export type MergeDraftStatus = 'pending' | 'committed' | 'cancelled';

export interface CreateMergeDraftInput {
  projectId: string;
  sourceHash: string;
  targetHash: string;
  sourceBranch?: string;
  targetBranch?: string;
  prepared: unknown; // Merge2WayResult
  message?: string;
}

export interface ListMergeDraftsOptions {
  projectId: string;
  status?: MergeDraftStatus;
  limit?: number;
  offset?: number;
}

export interface UpdateMergeDraftInput {
  prepared?: unknown; // Merge2WayResult with user decisions
  message?: string;
  status?: MergeDraftStatus;
}

/**
 * Create a new merge draft
 */
export async function createMergeDraft(
  db: AnyDB,
  input: CreateMergeDraftInput
): Promise<MergeDraft> {
  const draftId = generateMergeDraftId();
  const now = new Date();

  const [draft] = await db
    .insert(mergeDrafts)
    .values({
      draftId,
      projectId: input.projectId,
      sourceHash: input.sourceHash,
      targetHash: input.targetHash,
      sourceBranch: input.sourceBranch ?? null,
      targetBranch: input.targetBranch ?? null,
      preparedJson: JSON.stringify(input.prepared),
      status: 'pending',
      message: input.message ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return draft;
}

/**
 * Get merge draft by ID
 */
export async function getMergeDraft(db: AnyDB, draftId: string): Promise<MergeDraft | null> {
  const [draft] = await db
    .select()
    .from(mergeDrafts)
    .where(eq(mergeDrafts.draftId, draftId))
    .limit(1);

  return draft ?? null;
}

/**
 * List merge drafts by project
 */
export async function listMergeDraftsByProject(
  db: AnyDB,
  options: ListMergeDraftsOptions
): Promise<MergeDraft[]> {
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  if (options.status) {
    return db
      .select()
      .from(mergeDrafts)
      .where(
        and(eq(mergeDrafts.projectId, options.projectId), eq(mergeDrafts.status, options.status))
      )
      .orderBy(desc(mergeDrafts.updatedAt))
      .limit(limit)
      .offset(offset);
  }

  return db
    .select()
    .from(mergeDrafts)
    .where(eq(mergeDrafts.projectId, options.projectId))
    .orderBy(desc(mergeDrafts.updatedAt))
    .limit(limit)
    .offset(offset);
}

/**
 * Update merge draft
 *
 * Fix 3: Eliminate TOCTOU race. The preliminary read is removed — the UPDATE
 * itself is the authority. If 0 rows are returned the draft did not exist (or
 * was already deleted) and we return null, eliminating the window between read
 * and write that existed with the old read-then-write pattern.
 */
export async function updateMergeDraft(
  db: AnyDB,
  draftId: string,
  input: UpdateMergeDraftInput
): Promise<MergeDraft | null> {
  const updates: Partial<NewMergeDraft> = {
    updatedAt: new Date(),
  };

  if (input.prepared !== undefined) {
    updates.preparedJson = JSON.stringify(input.prepared);
  }
  if (input.message !== undefined) {
    updates.message = input.message;
  }
  if (input.status !== undefined) {
    updates.status = input.status;
  }

  const [updated] = await db
    .update(mergeDrafts)
    .set(updates)
    .where(eq(mergeDrafts.draftId, draftId))
    .returning();

  return updated ?? null;
}

/**
 * Mark merge draft as committed
 */
export async function commitMergeDraft(db: AnyDB, draftId: string): Promise<MergeDraft | null> {
  return updateMergeDraft(db, draftId, { status: 'committed' });
}

/**
 * Mark merge draft as cancelled
 */
export async function cancelMergeDraft(db: AnyDB, draftId: string): Promise<MergeDraft | null> {
  return updateMergeDraft(db, draftId, { status: 'cancelled' });
}

/**
 * Delete merge draft
 */
export async function deleteMergeDraft(db: AnyDB, draftId: string): Promise<boolean> {
  const result = await db.delete(mergeDrafts).where(eq(mergeDrafts.draftId, draftId)).returning();

  return result.length > 0;
}

/**
 * Find pending merge draft for a project (source + target combination)
 */
export async function findPendingMergeDraft(
  db: AnyDB,
  projectId: string,
  sourceHash: string,
  targetHash: string
): Promise<MergeDraft | null> {
  const [draft] = await db
    .select()
    .from(mergeDrafts)
    .where(
      and(
        eq(mergeDrafts.projectId, projectId),
        eq(mergeDrafts.sourceHash, sourceHash),
        eq(mergeDrafts.targetHash, targetHash),
        eq(mergeDrafts.status, 'pending')
      )
    )
    .limit(1);

  return draft ?? null;
}
