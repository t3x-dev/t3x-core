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

/**
 * Create a single segment embedding
 * Uses INSERT OR REPLACE to handle re-embedding scenarios (e.g., model upgrade)
 */
export function createSegmentEmbedding(input: CreateSegmentEmbeddingInput): SegmentEmbeddingRecord {
  const db = getDb();
  const created_at = isoNow();
  const segment_id = generateSegmentId(input.turn_hash, input.segment_index);
  const embeddingBlob = float32ArrayToBuffer(input.embedding);

  db.prepare(
    `INSERT OR REPLACE INTO segment_embeddings
     (segment_id, turn_hash, segment_index, segment_text, embedding_model, embedding_dim, embedding, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
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
export function createSegmentEmbeddingsBatch(input: CreateSegmentEmbeddingsBatchInput): SegmentEmbeddingRecord[] {
  const db = getDb();
  const created_at = isoNow();

  const stmt = db.prepare(
    `INSERT OR REPLACE INTO segment_embeddings
     (segment_id, turn_hash, segment_index, segment_text, embedding_model, embedding_dim, embedding, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const results: SegmentEmbeddingRecord[] = [];

  const insertMany = db.transaction(() => {
    for (const seg of input.segments) {
      const segment_id = generateSegmentId(input.turn_hash, seg.index);
      const embeddingBlob = float32ArrayToBuffer(seg.embedding);

      stmt.run(
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

  insertMany();
  return results;
}

/**
 * Get a single segment embedding by ID
 */
export function getSegmentEmbedding(segment_id: string): SegmentEmbeddingRecord | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM segment_embeddings WHERE segment_id = ?`)
    .get(segment_id) as SegmentEmbeddingRecord | undefined;
  return row ?? null;
}

/**
 * Get all segment embeddings for a turn
 */
export function getSegmentEmbeddingsByTurn(turn_hash: string): SegmentEmbeddingRecord[] {
  const db = getDb();
  return db
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
export function getSegmentEmbeddingsByTurns(turn_hashes: string[]): Map<string, SegmentEmbeddingRecord[]> {
  if (turn_hashes.length === 0) {
    return new Map();
  }

  const db = getDb();
  const placeholders = turn_hashes.map(() => '?').join(',');
  const rows = db
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
export function hasEmbeddingsForTurn(turn_hash: string): boolean {
  const db = getDb();
  const row = db
    .prepare(`SELECT 1 FROM segment_embeddings WHERE turn_hash = ? LIMIT 1`)
    .get(turn_hash);
  return row !== undefined;
}

/**
 * Delete all embeddings for a turn
 */
export function deleteSegmentEmbeddingsByTurn(turn_hash: string): number {
  const db = getDb();
  const result = db
    .prepare(`DELETE FROM segment_embeddings WHERE turn_hash = ?`)
    .run(turn_hash);
  return result.changes;
}

/**
 * Get embeddings count for a turn
 */
export function getEmbeddingsCountForTurn(turn_hash: string): number {
  const db = getDb();
  const row = db
    .prepare(`SELECT COUNT(*) as count FROM segment_embeddings WHERE turn_hash = ?`)
    .get(turn_hash) as { count: number };
  return row.count;
}

/**
 * Get all embeddings with a specific model (for migration/cleanup)
 */
export function getEmbeddingsByModel(model: string, limit = 1000): SegmentEmbeddingRecord[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM segment_embeddings
       WHERE embedding_model = ?
       LIMIT ?`
    )
    .all(model, limit) as SegmentEmbeddingRecord[];
}
