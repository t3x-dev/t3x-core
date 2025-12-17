/**
 * Segment Embeddings CRUD operations
 *
 * Pre-computed vector embeddings for Ring 3 segments.
 * Stored separately from turns_v2 to keep main table lightweight.
 */

import { getDb } from '../db';
import type {
  SegmentEmbeddingRecord,
  CreateSegmentEmbeddingInput,
  CreateSegmentEmbeddingsBatchInput,
} from './types';
import { isoNow } from './utils';

/**
 * Convert Float32Array to Buffer for SQLite BLOB storage
 */
export function float32ArrayToBuffer(arr: number[]): Buffer {
  const float32 = new Float32Array(arr);
  return Buffer.from(float32.buffer);
}

/**
 * Convert Buffer from SQLite BLOB to number array
 *
 * Note: Node.js Buffer may use memory pool with non-aligned byteOffset.
 * Float32Array requires 4-byte alignment, so we copy to ensure alignment.
 */
export function bufferToFloat32Array(buf: Buffer): number[] {
  // Create an aligned copy to avoid RangeError when byteOffset % 4 !== 0
  const aligned = Buffer.from(buf);
  const float32 = new Float32Array(aligned.buffer, aligned.byteOffset, aligned.byteLength / 4);
  return Array.from(float32);
}

/**
 * Generate segment ID from turn hash and segment index
 */
export function generateSegmentId(turnHash: string, segmentIndex: number): string {
  return `${turnHash}:s-${segmentIndex}`;
}

function upsertSegmentEmbeddingSql(dialect: 'sqlite' | 'postgres'): string {
  if (dialect === 'postgres') {
    return `
      INSERT INTO segment_embeddings
        (segment_id, turn_hash, segment_index, segment_text, embedding_model, embedding_dim, embedding, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (segment_id) DO UPDATE SET
        turn_hash = EXCLUDED.turn_hash,
        segment_index = EXCLUDED.segment_index,
        segment_text = EXCLUDED.segment_text,
        embedding_model = EXCLUDED.embedding_model,
        embedding_dim = EXCLUDED.embedding_dim,
        embedding = EXCLUDED.embedding,
        created_at = EXCLUDED.created_at
    `;
  }

  return `
    INSERT OR REPLACE INTO segment_embeddings
      (segment_id, turn_hash, segment_index, segment_text, embedding_model, embedding_dim, embedding, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
}

/**
 * Create a single segment embedding
 * Uses INSERT OR REPLACE to handle re-embedding scenarios (e.g., model upgrade)
 */
export async function createSegmentEmbedding(input: CreateSegmentEmbeddingInput): Promise<SegmentEmbeddingRecord> {
  const db = getDb();
  const created_at = isoNow();
  const segment_id = generateSegmentId(input.turn_hash, input.segment_index);
  const embeddingBlob = float32ArrayToBuffer(input.embedding);

  await db.prepare(upsertSegmentEmbeddingSql(db.dialect)).run(
    segment_id,
    input.turn_hash,
    input.segment_index,
    input.segment_text,
    input.embedding_model,
    input.embedding_dim,
    embeddingBlob,
    created_at
  );

  return {
    segment_id,
    turn_hash: input.turn_hash,
    segment_index: input.segment_index,
    segment_text: input.segment_text,
    embedding_model: input.embedding_model,
    embedding_dim: input.embedding_dim,
    embedding: embeddingBlob,
    created_at,
  };
}

/**
 * Create multiple segment embeddings in a batch (within transaction)
 * Uses INSERT OR REPLACE to handle re-embedding scenarios (e.g., model upgrade)
 */
export async function createSegmentEmbeddingsBatch(input: CreateSegmentEmbeddingsBatchInput): Promise<SegmentEmbeddingRecord[]> {
  const db = getDb();
  const created_at = isoNow();

  const results: SegmentEmbeddingRecord[] = [];

  await db.transaction(async (tx) => {
    const stmt = tx.prepare(upsertSegmentEmbeddingSql(tx.dialect));
    for (const seg of input.segments) {
      const segment_id = generateSegmentId(input.turn_hash, seg.index);
      const embeddingBlob = float32ArrayToBuffer(seg.embedding);

      await stmt.run(
        segment_id,
        input.turn_hash,
        seg.index,
        seg.text,
        input.embedding_model,
        input.embedding_dim,
        embeddingBlob,
        created_at
      );

      results.push({
        segment_id,
        turn_hash: input.turn_hash,
        segment_index: seg.index,
        segment_text: seg.text,
        embedding_model: input.embedding_model,
        embedding_dim: input.embedding_dim,
        embedding: embeddingBlob,
        created_at,
      });
    }
  });

  return results;
}

/**
 * Get a single segment embedding by ID
 */
export async function getSegmentEmbedding(segment_id: string): Promise<SegmentEmbeddingRecord | null> {
  const db = getDb();
  const row = await db
    .prepare(`SELECT * FROM segment_embeddings WHERE segment_id = ?`)
    .get(segment_id) as SegmentEmbeddingRecord | undefined;
  return row ?? null;
}

/**
 * Get all segment embeddings for a turn
 */
export async function getSegmentEmbeddingsByTurn(turn_hash: string): Promise<SegmentEmbeddingRecord[]> {
  const db = getDb();
  return await db
    .prepare(
      `SELECT * FROM segment_embeddings
       WHERE turn_hash = ?
       ORDER BY segment_index ASC`
    )
    .all(turn_hash) as SegmentEmbeddingRecord[];
}

/**
 * Get segment embeddings for multiple turns (batch query)
 */
export async function getSegmentEmbeddingsByTurns(turn_hashes: string[]): Promise<Map<string, SegmentEmbeddingRecord[]>> {
  if (turn_hashes.length === 0) {
    return new Map();
  }

  const db = getDb();
  const placeholders = turn_hashes.map(() => '?').join(',');
  const rows = await db
    .prepare(
      `SELECT * FROM segment_embeddings
       WHERE turn_hash IN (${placeholders})
       ORDER BY turn_hash, segment_index ASC`
    )
    .all(...turn_hashes) as SegmentEmbeddingRecord[];

  // Group by turn_hash
  const result = new Map<string, SegmentEmbeddingRecord[]>();
  for (const row of rows) {
    const existing = result.get(row.turn_hash) ?? [];
    existing.push(row);
    result.set(row.turn_hash, existing);
  }

  return result;
}

/**
 * Check if embeddings exist for a turn
 */
export async function hasEmbeddingsForTurn(turn_hash: string): Promise<boolean> {
  const db = getDb();
  const row = await db
    .prepare(`SELECT 1 FROM segment_embeddings WHERE turn_hash = ? LIMIT 1`)
    .get(turn_hash);
  return row !== undefined;
}

/**
 * Delete all embeddings for a turn
 */
export async function deleteSegmentEmbeddingsByTurn(turn_hash: string): Promise<number> {
  const db = getDb();
  const result = await db
    .prepare(`DELETE FROM segment_embeddings WHERE turn_hash = ?`)
    .run(turn_hash);
  return result.changes;
}

/**
 * Get embeddings count for a turn
 */
export async function getEmbeddingsCountForTurn(turn_hash: string): Promise<number> {
  const db = getDb();
  const row = await db
    .prepare(`SELECT CAST(COUNT(*) AS INTEGER) as count FROM segment_embeddings WHERE turn_hash = ?`)
    .get(turn_hash) as { count: number };
  return row.count;
}

/**
 * Get all embeddings with a specific model (for migration/cleanup)
 */
export async function getEmbeddingsByModel(model: string, limit = 1000): Promise<SegmentEmbeddingRecord[]> {
  const db = getDb();
  return await db
    .prepare(
      `SELECT * FROM segment_embeddings
       WHERE embedding_model = ?
       LIMIT ?`
    )
    .all(model, limit) as SegmentEmbeddingRecord[];
}
