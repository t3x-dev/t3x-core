/**
 * Merge Results Queries
 *
 * CRUD operations for merge results using Drizzle ORM.
 */

import { generateMergeResultId } from '@t3x/core';
import { and, desc, eq } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { type MergeResult, mergeResults } from '../schema';

export type MergeStatus = 'clean' | 'conflicts';

export interface CreateMergeResultInput {
  projectId: string;
  baseCommitHash: string;
  sourceCommitHash: string;
  targetCommitHash: string;
  status: MergeStatus;
  autoMerged: unknown[];
  conflicts: unknown[];
}

/**
 * Insert a new merge result
 */
export async function insertMergeResult(
  db: AnyDB,
  input: CreateMergeResultInput
): Promise<MergeResult> {
  const mergeResultId = generateMergeResultId();
  const createdAt = new Date();

  const autoMergedJson = JSON.stringify(input.autoMerged);
  const conflictsJson = JSON.stringify(input.conflicts);

  const [result] = await db
    .insert(mergeResults)
    .values({
      mergeResultId,
      projectId: input.projectId,
      baseCommitHash: input.baseCommitHash,
      sourceCommitHash: input.sourceCommitHash,
      targetCommitHash: input.targetCommitHash,
      status: input.status,
      autoMergedJson,
      conflictsJson,
      createdAt,
    })
    .returning();

  return result;
}

/**
 * Find merge result by ID
 */
export async function findMergeResultById(
  db: AnyDB,
  mergeResultId: string
): Promise<MergeResult | null> {
  const [result] = await db
    .select()
    .from(mergeResults)
    .where(eq(mergeResults.mergeResultId, mergeResultId))
    .limit(1);

  return result ?? null;
}

/**
 * Find merge result by commit hashes
 * Returns the most recent result when multiple matches exist
 */
export async function findMergeResultByHashes(
  db: AnyDB,
  baseCommitHash: string,
  sourceCommitHash: string,
  targetCommitHash: string
): Promise<MergeResult | null> {
  const [result] = await db
    .select()
    .from(mergeResults)
    .where(
      and(
        eq(mergeResults.baseCommitHash, baseCommitHash),
        eq(mergeResults.sourceCommitHash, sourceCommitHash),
        eq(mergeResults.targetCommitHash, targetCommitHash)
      )
    )
    // Sort by createdAt desc, then by mergeResultId desc for deterministic ordering
    // when timestamps are equal (e.g., in fast test execution)
    .orderBy(desc(mergeResults.createdAt), desc(mergeResults.mergeResultId))
    .limit(1);

  return result ?? null;
}

/**
 * Find merge results by project
 */
export async function findMergeResultsByProject(
  db: AnyDB,
  projectId: string,
  limit = 100,
  offset = 0
): Promise<MergeResult[]> {
  return db
    .select()
    .from(mergeResults)
    .where(eq(mergeResults.projectId, projectId))
    .orderBy(desc(mergeResults.createdAt))
    .limit(limit)
    .offset(offset);
}

/**
 * Delete a merge result
 */
export async function deleteMergeResult(db: AnyDB, mergeResultId: string): Promise<boolean> {
  const result = await db
    .delete(mergeResults)
    .where(eq(mergeResults.mergeResultId, mergeResultId))
    .returning();

  return result.length > 0;
}
