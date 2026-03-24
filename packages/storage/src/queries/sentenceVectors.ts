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
import { sentenceVectors } from '../schema-frames';

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

/**
 * Validate and sanitize a vector embedding array.
 * Ensures all values are finite numbers to prevent SQL injection via malformed vector literals.
 */
function validateEmbedding(embedding: number[]): number[] {
  if (embedding.length === 0) {
    throw new Error('Embedding must not be empty');
  }
  for (let i = 0; i < embedding.length; i++) {
    if (typeof embedding[i] !== 'number' || !Number.isFinite(embedding[i])) {
      throw new Error(`Invalid embedding value at index ${i}: ${String(embedding[i])}`);
    }
  }
  return embedding;
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
  const vectorLiteral = `[${validateEmbedding(input.embedding).join(',')}]`;

  await (db as unknown as { execute: (q: ReturnType<typeof sql>) => Promise<unknown> }).execute(
    sql`INSERT INTO sentence_vectors (id, project_id, commit_hash, text, embedding, model_id, created_at, tsv)
        VALUES (${input.id}, ${input.projectId}, ${input.commitHash}, ${input.text}, ${vectorLiteral}::vector, ${input.modelId}, NOW(), to_tsvector('simple', ${input.text}))
        ON CONFLICT (id) DO UPDATE SET
          embedding = EXCLUDED.embedding,
          model_id = EXCLUDED.model_id,
          text = EXCLUDED.text,
          tsv = to_tsvector('simple', EXCLUDED.text),
          created_at = NOW()`
  );
}

/**
 * Batch insert/update sentence vectors.
 * Uses individual upserts (no prepared statement batching).
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
  const vectorLiteral = `[${validateEmbedding(queryEmbedding).join(',')}]`;

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
// Keyword Search (ts_rank)
// ============================================================

export interface KeywordSearchResult {
  id: string;
  project_id: string;
  commit_hash: string;
  text: string;
  keyword_score: number;
}

/**
 * Search sentences by keyword using PostgreSQL full-text search (ts_rank ranking).
 * Uses tsvector column with GIN index for fast keyword matching.
 * Works without embedding provider — pure keyword search.
 */
export async function searchByKeyword(
  db: AnyDB,
  projectId: string,
  query: string,
  limit: number
): Promise<KeywordSearchResult[]> {
  if (!query.trim()) return [];

  const results = await (
    db as unknown as { execute: (q: ReturnType<typeof sql>) => Promise<{ rows: unknown[] }> }
  ).execute(
    sql`SELECT id, project_id, commit_hash, text,
               ts_rank(tsv, plainto_tsquery('simple', ${query})) AS keyword_score
        FROM sentence_vectors
        WHERE project_id = ${projectId}
          AND tsv @@ plainto_tsquery('simple', ${query})
        ORDER BY keyword_score DESC
        LIMIT ${limit}`
  );

  return (results.rows as Array<Record<string, unknown>>).map((row) => ({
    id: row.id as string,
    project_id: row.project_id as string,
    commit_hash: row.commit_hash as string,
    text: row.text as string,
    keyword_score: Number(row.keyword_score),
  }));
}

// ============================================================
// Hybrid Search (RRF)
// ============================================================

export interface HybridSearchResult {
  id: string;
  project_id: string;
  commit_hash: string;
  text: string;
  score: number;
  keyword_rank: number | null;
  vector_rank: number | null;
}

/**
 * Reciprocal Rank Fusion: merges two ranked result lists into one.
 * score = Σ 1/(k + rank), where rank is 1-indexed, k=60 (standard RRF constant).
 * Results appearing in both lists get higher scores.
 */
export function rrfFusion(
  keywordResults: Array<{ id: string; project_id: string; commit_hash: string; text: string }>,
  vectorResults: Array<{ id: string; project_id: string; commit_hash: string; text: string }>,
  limit: number,
  k = 60
): HybridSearchResult[] {
  const entries = new Map<
    string,
    {
      row: { id: string; project_id: string; commit_hash: string; text: string };
      score: number;
      kr: number | null;
      vr: number | null;
    }
  >();

  keywordResults.forEach((row, idx) => {
    const rank = idx + 1;
    const entry = entries.get(row.id) ?? { row, score: 0, kr: null, vr: null };
    entry.score += 1 / (k + rank);
    entry.kr = rank;
    entries.set(row.id, entry);
  });

  vectorResults.forEach((row, idx) => {
    const rank = idx + 1;
    const entry = entries.get(row.id) ?? { row, score: 0, kr: null, vr: null };
    entry.score += 1 / (k + rank);
    entry.vr = rank;
    entries.set(row.id, entry);
  });

  return [...entries.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((e) => ({
      id: e.row.id,
      project_id: e.row.project_id,
      commit_hash: e.row.commit_hash,
      text: e.row.text,
      score: e.score,
      keyword_rank: e.kr,
      vector_rank: e.vr,
    }));
}

/**
 * Hybrid search combining BM25 keyword search and pgvector cosine similarity
 * using Reciprocal Rank Fusion (RRF).
 *
 * Fetches 2x limit from each source, then fuses with RRF to produce final ranking.
 * Results appearing in both keyword and vector results score higher.
 */
export async function searchHybrid(
  db: AnyDB,
  projectId: string,
  query: string,
  queryEmbedding: number[],
  limit: number
): Promise<HybridSearchResult[]> {
  const fetchLimit = limit * 2;

  // Run both searches in parallel
  const [kwResults, vecResults] = await Promise.all([
    searchByKeyword(db, projectId, query, fetchLimit),
    searchSimilarSentences(db, projectId, queryEmbedding, fetchLimit),
  ]);

  return rrfFusion(kwResults, vecResults, limit);
}

// ============================================================
// Bulk Retrieval (for conflict detection)
// ============================================================

/**
 * Retrieve all sentence vectors for a project.
 * Used by conflict detection to load existing sentences with embeddings.
 *
 * @param excludeCommitHash - Optionally exclude sentences from a specific commit
 *   (e.g., the commit being created, to avoid self-conflicts)
 */
export async function findSentenceVectorsByProject(
  db: AnyDB,
  projectId: string,
  options?: { excludeCommitHash?: string; limit?: number }
): Promise<SearchResult[]> {
  const excludeClause = options?.excludeCommitHash
    ? sql`AND commit_hash != ${options.excludeCommitHash}`
    : sql``;
  const limitVal = options?.limit ?? 10000;

  const results = await (
    db as unknown as { execute: (q: ReturnType<typeof sql>) => Promise<{ rows: unknown[] }> }
  ).execute(
    sql`SELECT id, project_id, commit_hash, text, model_id, 1.0 AS similarity
        FROM sentence_vectors
        WHERE project_id = ${projectId}
          ${excludeClause}
        LIMIT ${limitVal}`
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
// Bulk Retrieval with Embeddings (for knowledge graph clustering)
// ============================================================

/**
 * Retrieve all sentence vectors for a project INCLUDING embedding vectors.
 * Used by the knowledge graph builder for centroid clustering.
 *
 * WARNING: Returns full 768-dim vectors. Can be large for projects with many sentences.
 * Use findSentenceVectorsByProject (without embeddings) for lighter reads.
 */
export async function findSentenceVectorsWithEmbeddingsByProject(
  db: AnyDB,
  projectId: string,
  options?: { limit?: number }
): Promise<Array<{ id: string; text: string; embedding: number[]; commit_hash: string }>> {
  const limitVal = options?.limit ?? 10000;

  const rows = await db
    .select({
      id: sentenceVectors.id,
      text: sentenceVectors.sentenceText,
      embedding: sentenceVectors.embedding,
      commitHash: sentenceVectors.commitHash,
    })
    .from(sentenceVectors)
    .where(eq(sentenceVectors.projectId, projectId))
    .limit(limitVal);

  return rows.map((row) => ({
    id: row.id,
    text: row.text,
    embedding: row.embedding,
    commit_hash: row.commitHash,
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
