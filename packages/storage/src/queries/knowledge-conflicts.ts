/**
 * Knowledge Conflicts Queries (S15)
 *
 * CRUD operations for knowledge_conflicts table using Drizzle ORM.
 * Tracks detected conflicts between new and existing sentences.
 */

import { randomUUID } from 'crypto';
import { and, count, eq } from 'drizzle-orm';

import type { AnyDB } from '../adapters';
import { type KnowledgeConflictRecord, knowledgeConflicts } from '../schema-knowledge-conflicts';

// ============================================================
// Types
// ============================================================

export interface InsertConflictInput {
  project_id: string;
  new_sentence_id: string;
  new_commit_hash: string;
  existing_sentence_id: string;
  existing_commit_hash: string;
  cosine: number;
  jaccard: number;
}

export interface KnowledgeConflictOutput {
  id: string;
  project_id: string;
  new_sentence_id: string;
  new_commit_hash: string;
  existing_sentence_id: string;
  existing_commit_hash: string;
  cosine: number;
  jaccard: number;
  status: string;
  resolution: string | null;
  created_at: string;
}

// ============================================================
// ID Generation
// ============================================================

function generateConflictId(): string {
  return `kc_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

// ============================================================
// Query Functions
// ============================================================

/**
 * Insert a new knowledge conflict
 */
export async function insertConflict(
  db: AnyDB,
  input: InsertConflictInput
): Promise<KnowledgeConflictOutput> {
  const id = generateConflictId();

  const [row] = await db
    .insert(knowledgeConflicts)
    .values({
      id,
      projectId: input.project_id,
      newSentenceId: input.new_sentence_id,
      newCommitHash: input.new_commit_hash,
      existingSentenceId: input.existing_sentence_id,
      existingCommitHash: input.existing_commit_hash,
      cosine: input.cosine,
      jaccard: input.jaccard,
    })
    .returning();

  return rowToOutput(row);
}

/**
 * Find conflicts by project, optionally filtered by status
 */
export async function findConflictsByProject(
  db: AnyDB,
  projectId: string,
  options?: { status?: string }
): Promise<KnowledgeConflictOutput[]> {
  const conditions = [eq(knowledgeConflicts.projectId, projectId)];

  if (options?.status) {
    conditions.push(eq(knowledgeConflicts.status, options.status));
  }

  const rows = await db
    .select()
    .from(knowledgeConflicts)
    .where(and(...conditions))
    .orderBy(knowledgeConflicts.createdAt);

  return rows.map(rowToOutput);
}

/**
 * Find a single conflict by ID
 */
export async function findConflictById(
  db: AnyDB,
  id: string
): Promise<KnowledgeConflictOutput | null> {
  const [row] = await db
    .select()
    .from(knowledgeConflicts)
    .where(eq(knowledgeConflicts.id, id))
    .limit(1);

  return row ? rowToOutput(row) : null;
}

/**
 * Resolve a conflict — sets status='resolved' and the resolution type
 */
export async function resolveConflict(
  db: AnyDB,
  id: string,
  resolution: string
): Promise<KnowledgeConflictOutput | null> {
  const [row] = await db
    .update(knowledgeConflicts)
    .set({ status: 'resolved', resolution })
    .where(eq(knowledgeConflicts.id, id))
    .returning();

  return row ? rowToOutput(row) : null;
}

/**
 * Dismiss a conflict — sets status='dismissed', resolution='dismissed'
 */
export async function dismissConflict(
  db: AnyDB,
  id: string
): Promise<KnowledgeConflictOutput | null> {
  const [row] = await db
    .update(knowledgeConflicts)
    .set({ status: 'dismissed', resolution: 'dismissed' })
    .where(eq(knowledgeConflicts.id, id))
    .returning();

  return row ? rowToOutput(row) : null;
}

/**
 * Count conflicts for a project, optionally filtered by status
 */
export async function countConflictsByProject(
  db: AnyDB,
  projectId: string,
  status?: string
): Promise<number> {
  const conditions = [eq(knowledgeConflicts.projectId, projectId)];

  if (status) {
    conditions.push(eq(knowledgeConflicts.status, status));
  }

  const rows = await db
    .select({ count: count() })
    .from(knowledgeConflicts)
    .where(and(...conditions));

  return rows[0]?.count ?? 0;
}

// ============================================================
// Helpers
// ============================================================

function rowToOutput(row: KnowledgeConflictRecord): KnowledgeConflictOutput {
  return {
    id: row.id,
    project_id: row.projectId,
    new_sentence_id: row.newSentenceId,
    new_commit_hash: row.newCommitHash,
    existing_sentence_id: row.existingSentenceId,
    existing_commit_hash: row.existingCommitHash,
    cosine: row.cosine,
    jaccard: row.jaccard,
    status: row.status,
    resolution: row.resolution,
    created_at: row.createdAt.toISOString(),
  };
}
