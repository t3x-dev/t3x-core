/**
 * Sentence Relations Queries
 *
 * CRUD operations for inter-sentence relations (Ring 4).
 * Relations are derivative data extracted at commit time.
 */

import type { SentenceRelation } from '@t3x/core';
import { eq } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { type SentenceRelationRecord, sentenceRelations } from '../schema-v4';

interface RelationInput {
  id: string;
  project_id: string;
  commit_hash: string;
  source_id: string;
  target_id: string;
  type: string;
  confidence: number;
  reasoning?: string;
}

function rowToRelation(row: SentenceRelationRecord): SentenceRelation {
  return {
    id: row.id,
    source_id: row.sourceId,
    target_id: row.targetId,
    type: row.type as SentenceRelation['type'],
    confidence: row.confidence,
    reasoning: row.reasoning ?? '',
  };
}

/**
 * Upsert relations for a commit. Uses ON CONFLICT to handle re-extraction.
 * Returns the number of rows affected.
 */
export async function upsertRelations(db: AnyDB, relations: RelationInput[]): Promise<number> {
  if (relations.length === 0) return 0;

  // Drizzle doesn't support batch onConflictDoUpdate with multiple values well,
  // so we use individual upserts. Performance is acceptable since this runs
  // asynchronously in fire-and-forget mode.
  for (const rel of relations) {
    await db
      .insert(sentenceRelations)
      .values({
        id: rel.id,
        projectId: rel.project_id,
        commitHash: rel.commit_hash,
        sourceId: rel.source_id,
        targetId: rel.target_id,
        type: rel.type,
        confidence: rel.confidence,
        reasoning: rel.reasoning,
      })
      .onConflictDoUpdate({
        target: [
          sentenceRelations.commitHash,
          sentenceRelations.sourceId,
          sentenceRelations.targetId,
          sentenceRelations.type,
        ],
        set: {
          id: rel.id,
          confidence: rel.confidence,
          reasoning: rel.reasoning,
        },
      });
  }

  return relations.length;
}

/**
 * Find all relations for a commit.
 */
export async function findRelationsByCommit(
  db: AnyDB,
  commitHash: string
): Promise<SentenceRelation[]> {
  const rows = await db
    .select()
    .from(sentenceRelations)
    .where(eq(sentenceRelations.commitHash, commitHash));

  return rows.map(rowToRelation);
}

/**
 * Delete all relations for a commit. Returns the number of rows deleted.
 */
export async function deleteRelationsByCommit(db: AnyDB, commitHash: string): Promise<number> {
  const result = await db
    .delete(sentenceRelations)
    .where(eq(sentenceRelations.commitHash, commitHash))
    .returning();

  return result.length;
}
