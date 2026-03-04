/**
 * Segment Embeddings Queries
 *
 * CRUD operations for segment embeddings using Drizzle ORM.
 */

import { eq, inArray, sql } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { type SegmentEmbedding, segmentEmbeddings } from '../schema';

export interface CreateSegmentEmbeddingInput {
  turnHash: string;
  segmentIndex: number;
  segmentText: string;
  embeddingModel: string;
  embeddingDim: number;
  embedding: number[];
}

export interface CreateSegmentEmbeddingsBatchInput {
  turnHash: string;
  embeddingModel: string;
  embeddingDim: number;
  segments: Array<{
    index: number;
    text: string;
    embedding: number[];
  }>;
}

/**
 * Generate segment ID from turn hash and segment index
 */
export function generateSegmentId(turnHash: string, segmentIndex: number): string {
  return `${turnHash}:s-${segmentIndex}`;
}

/**
 * Convert number array to Buffer for storage
 */
export function float32ArrayToBuffer(arr: number[]): Buffer {
  const float32 = new Float32Array(arr);
  return Buffer.from(float32.buffer);
}

/**
 * Convert Buffer to number array
 */
export function bufferToFloat32Array(buf: Buffer): number[] {
  const aligned = Buffer.from(buf);
  const float32 = new Float32Array(aligned.buffer, aligned.byteOffset, aligned.byteLength / 4);
  return Array.from(float32);
}

/**
 * Insert a single segment embedding
 */
export async function insertSegmentEmbedding(
  db: AnyDB,
  input: CreateSegmentEmbeddingInput
): Promise<SegmentEmbedding> {
  const segmentId = generateSegmentId(input.turnHash, input.segmentIndex);
  const createdAt = new Date();
  const embeddingBlob = float32ArrayToBuffer(input.embedding);

  // Use upsert (INSERT ... ON CONFLICT DO UPDATE)
  const [result] = await db
    .insert(segmentEmbeddings)
    .values({
      segmentId,
      turnHash: input.turnHash,
      segmentIndex: input.segmentIndex,
      segmentText: input.segmentText,
      embeddingModel: input.embeddingModel,
      embeddingDim: input.embeddingDim,
      embedding: embeddingBlob,
      createdAt,
    })
    .onConflictDoUpdate({
      target: segmentEmbeddings.segmentId,
      set: {
        segmentText: input.segmentText,
        embeddingModel: input.embeddingModel,
        embeddingDim: input.embeddingDim,
        embedding: embeddingBlob,
        createdAt,
      },
    })
    .returning();

  return result;
}

/**
 * Insert multiple segment embeddings in a batch
 */
export async function insertSegmentEmbeddingsBatch(
  db: AnyDB,
  input: CreateSegmentEmbeddingsBatchInput
): Promise<SegmentEmbedding[]> {
  const _createdAt = new Date();
  const results: SegmentEmbedding[] = [];

  for (const seg of input.segments) {
    const result = await insertSegmentEmbedding(db, {
      turnHash: input.turnHash,
      segmentIndex: seg.index,
      segmentText: seg.text,
      embeddingModel: input.embeddingModel,
      embeddingDim: input.embeddingDim,
      embedding: seg.embedding,
    });
    results.push(result);
  }

  return results;
}

/**
 * Find segment embedding by ID
 */
export async function findSegmentEmbeddingById(
  db: AnyDB,
  segmentId: string
): Promise<SegmentEmbedding | null> {
  const [result] = await db
    .select()
    .from(segmentEmbeddings)
    .where(eq(segmentEmbeddings.segmentId, segmentId))
    .limit(1);

  return result ?? null;
}

/**
 * Find segment embeddings by turn
 */
export async function findSegmentEmbeddingsByTurn(
  db: AnyDB,
  turnHash: string
): Promise<SegmentEmbedding[]> {
  return db
    .select()
    .from(segmentEmbeddings)
    .where(eq(segmentEmbeddings.turnHash, turnHash))
    .orderBy(segmentEmbeddings.segmentIndex);
}

/**
 * Find segment embeddings for multiple turns
 *
 * Fix 6: Use inArray() instead of raw sql template literal IN syntax.
 * The raw sql`${col} IN ${array}` form is incorrect Drizzle syntax.
 */
export async function findSegmentEmbeddingsByTurns(
  db: AnyDB,
  turnHashes: string[]
): Promise<Map<string, SegmentEmbedding[]>> {
  if (turnHashes.length === 0) {
    return new Map();
  }

  const results = await db
    .select()
    .from(segmentEmbeddings)
    .where(inArray(segmentEmbeddings.turnHash, turnHashes))
    .orderBy(segmentEmbeddings.turnHash, segmentEmbeddings.segmentIndex);

  // Group by turn_hash
  const grouped = new Map<string, SegmentEmbedding[]>();
  for (const row of results) {
    const existing = grouped.get(row.turnHash) ?? [];
    existing.push(row);
    grouped.set(row.turnHash, existing);
  }

  return grouped;
}

/**
 * Check if embeddings exist for a turn
 */
export async function hasEmbeddingsForTurn(db: AnyDB, turnHash: string): Promise<boolean> {
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(segmentEmbeddings)
    .where(eq(segmentEmbeddings.turnHash, turnHash));

  return Number(result?.count ?? 0) > 0;
}

/**
 * Delete embeddings for a turn
 */
export async function deleteSegmentEmbeddingsByTurn(db: AnyDB, turnHash: string): Promise<number> {
  const result = await db
    .delete(segmentEmbeddings)
    .where(eq(segmentEmbeddings.turnHash, turnHash))
    .returning();

  return result.length;
}

/**
 * Get embeddings count for a turn
 */
export async function getEmbeddingsCountForTurn(db: AnyDB, turnHash: string): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(segmentEmbeddings)
    .where(eq(segmentEmbeddings.turnHash, turnHash));

  return Number(result?.count ?? 0);
}

/**
 * Find embeddings by model
 */
export async function findEmbeddingsByModel(
  db: AnyDB,
  model: string,
  limit = 1000
): Promise<SegmentEmbedding[]> {
  return db
    .select()
    .from(segmentEmbeddings)
    .where(eq(segmentEmbeddings.embeddingModel, model))
    .limit(limit);
}
