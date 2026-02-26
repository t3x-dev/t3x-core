/**
 * Sentence Vectors Queries
 *
 * CRUD + similarity search operations for the sentence_vectors table.
 * Uses pgvector's cosine distance operator for semantic search.
 *
 * Populated when a draft is committed (if embedding provider is configured).
 * Powers the AutoSuggest feature in the Workbench.
 */

import { eq, sql } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { sentenceVectors } from '../schema-v4';

// ============================================================
// Types
// ============================================================

export interface UpsertSentenceVectorInput {
  id: string;
  projectId: string;
  commitHash: string;
  text: string;
  embedding: number[];
  modelId: string;
}

export interface SearchResult {
  id: string;
  project_id: string;
  commit_hash: string;
  text: string;
  model_id: string;
  similarity: number;
}

// ============================================================
// Validation
// ============================================================

function validateEmbedding(embedding: number[]): void {
  if (embedding.length === 0) {
    throw new Error('Embedding must not be empty');
  }
  for (let i = 0; i < embedding.length; i++) {
    if (!Number.isFinite(embedding[i])) {
      throw new Error(`Embedding contains non-finite value at index ${i}`);
    }
  }
}

// ============================================================
// Upsert
// ============================================================

/**
 * Insert or update a single sentence vector.
 */
export async function upsertSentenceVector(
  db: AnyDB,
  input: UpsertSentenceVectorInput
): Promise<void> {
  validateEmbedding(input.embedding);
  const vectorLiteral = `[${input.embedding.join(',')}]`;

  await (db as unknown as { execute: (q: ReturnType<typeof sql>) => Promise<unknown> }).execute(
    sql`INSERT INTO sentence_vectors (id, project_id, commit_hash, text, embedding, model_id, created_at)
        VALUES (${input.id}, ${input.projectId}, ${input.commitHash}, ${input.text}, ${vectorLiteral}::vector, ${input.modelId}, NOW())
        ON CONFLICT (id) DO UPDATE SET
          embedding = EXCLUDED.embedding,
          model_id = EXCLUDED.model_id,
          text = EXCLUDED.text,
          created_at = NOW()`
  );
}

/**
 * Batch insert/update sentence vectors.
 * Uses individual upserts for PGLite compatibility (no prepared statement batching).
 */
export async function upsertSentenceVectorsBatch(
  db: AnyDB,
  inputs: UpsertSentenceVectorInput[]
): Promise<void> {
  for (const input of inputs) {
    await upsertSentenceVector(db, input);
  }
}

// ============================================================
// Search
// ============================================================

/**
 * Find sentences similar to a query embedding using cosine distance.
 *
 * @param db - Database instance
 * @param projectId - Scope to this project
 * @param queryEmbedding - The query vector (768 dimensions)
 * @param limit - Max results to return
 * @param excludeCommitHash - Optionally exclude sentences from a specific commit
 * @returns Array of search results sorted by similarity (highest first)
 */
export async function searchSimilarSentences(
  db: AnyDB,
  projectId: string,
  queryEmbedding: number[],
  limit: number,
  excludeCommitHash?: string
): Promise<SearchResult[]> {
  validateEmbedding(queryEmbedding);
  const vectorLiteral = `[${queryEmbedding.join(',')}]`;

  const excludeClause = excludeCommitHash ? sql`AND commit_hash != ${excludeCommitHash}` : sql``;

  const results = await (
    db as unknown as { execute: (q: ReturnType<typeof sql>) => Promise<{ rows: unknown[] }> }
  ).execute(
    sql`SELECT id, project_id, commit_hash, text, model_id,
               1 - (embedding <=> ${vectorLiteral}::vector) AS similarity
        FROM sentence_vectors
        WHERE project_id = ${projectId}
          ${excludeClause}
        ORDER BY embedding <=> ${vectorLiteral}::vector
        LIMIT ${limit}`
  );

  return (results.rows as Array<Record<string, unknown>>).map((row) => ({
    id: row.id as string,
    project_id: row.project_id as string,
    commit_hash: row.commit_hash as string,
    text: row.text as string,
    model_id: row.model_id as string,
    similarity: Number(row.similarity),
  }));
}

// ============================================================
// Delete
// ============================================================

/**
 * Delete all sentence vectors for a specific commit.
 *
 * @returns Number of deleted rows
 */
export async function deleteSentenceVectorsByCommit(
  db: AnyDB,
  commitHash: string
): Promise<number> {
  const deleted = await db
    .delete(sentenceVectors)
    .where(eq(sentenceVectors.commitHash, commitHash))
    .returning();

  return deleted.length;
}

/**
 * Delete all sentence vectors for a project.
 *
 * @returns Number of deleted rows
 */
export async function deleteSentenceVectorsByProject(
  db: AnyDB,
  projectId: string
): Promise<number> {
  const deleted = await db
    .delete(sentenceVectors)
    .where(eq(sentenceVectors.projectId, projectId))
    .returning();

  return deleted.length;
}
