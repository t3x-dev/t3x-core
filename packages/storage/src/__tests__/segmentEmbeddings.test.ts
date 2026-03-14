/**
 * Segment Embeddings Storage Tests
 *
 * Tests all segment embedding operations and verifies database effects.
 * Segment embeddings store vector representations of turn content.
 */

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { insertConversation } from '../queries/conversations';
import { insertProject } from '../queries/projects';
import {
  bufferToFloat32Array,
  deleteSegmentEmbeddingsByTurn,
  findEmbeddingsByModel,
  findSegmentEmbeddingById,
  findSegmentEmbeddingsByTurn,
  findSegmentEmbeddingsByTurns,
  float32ArrayToBuffer,
  generateSegmentId,
  getEmbeddingsCountForTurn,
  hasEmbeddingsForTurn,
  insertSegmentEmbedding,
  insertSegmentEmbeddingsBatch,
} from '../queries/segmentEmbeddings';
import { insertTurn } from '../queries/turns';
import { segmentEmbeddings } from '../schema';
import { createTestDB, testData } from './setup';

describe('Segment Embeddings Storage', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let testConversationId: string;
  let testTurnHash: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;

    // Create a test project, conversation, and turn
    const project = await insertProject(db, testData.project({ name: 'Embedding Test Project' }));
    testProjectId = project.projectId;

    const conv = await insertConversation(db, testData.conversation(testProjectId));
    testConversationId = conv.conversationId;

    const turn = await insertTurn(
      db,
      testData.turn(testProjectId, testConversationId, { content: 'Test turn for embeddings' })
    );
    testTurnHash = turn.turnHash;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('helper functions', () => {
    describe('generateSegmentId', () => {
      it('generates ID from turn hash and segment index', () => {
        const id = generateSegmentId('sha256:abc123', 5);

        expect(id).toBe('sha256:abc123:s-5');
      });
    });

    describe('float32ArrayToBuffer / bufferToFloat32Array', () => {
      it('round-trips embedding values correctly', () => {
        const original = [0.1, 0.2, 0.3, 0.4, 0.5];

        const buffer = float32ArrayToBuffer(original);
        const recovered = bufferToFloat32Array(buffer);

        expect(recovered.length).toBe(original.length);
        for (let i = 0; i < original.length; i++) {
          expect(recovered[i]).toBeCloseTo(original[i], 5);
        }
      });

      it('handles empty array', () => {
        const buffer = float32ArrayToBuffer([]);
        const recovered = bufferToFloat32Array(buffer);

        expect(recovered).toEqual([]);
      });
    });
  });

  describe('insertSegmentEmbedding', () => {
    it('creates a segment embedding', async () => {
      const input = {
        turnHash: testTurnHash,
        segmentIndex: 0,
        segmentText: 'First segment text',
        embeddingModel: 'text-embedding-3-small',
        embeddingDim: 512,
        embedding: [0.1, 0.2, 0.3, 0.4],
      };

      const result = await insertSegmentEmbedding(db, input);

      expect(result).toBeDefined();
      expect(result.segmentId).toBe(generateSegmentId(testTurnHash, 0));
      expect(result.segmentText).toBe('First segment text');
      expect(result.embeddingModel).toBe('text-embedding-3-small');
      expect(result.embeddingDim).toBe(512);
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('stores the embedding in the database', async () => {
      const turn = await insertTurn(
        db,
        testData.turn(testProjectId, testConversationId, { content: 'Embedding DB test' })
      );

      const input = {
        turnHash: turn.turnHash,
        segmentIndex: 0,
        segmentText: 'Stored segment',
        embeddingModel: 'test-model',
        embeddingDim: 4,
        embedding: [1.0, 2.0, 3.0, 4.0],
      };

      const result = await insertSegmentEmbedding(db, input);

      // Verify database effect
      const rows = await db
        .select()
        .from(segmentEmbeddings)
        .where(eq(segmentEmbeddings.segmentId, result.segmentId));

      expect(rows).toHaveLength(1);
      expect(rows[0].segmentText).toBe('Stored segment');
      expect(rows[0].turnHash).toBe(turn.turnHash);
    });

    it('stores embedding as binary blob', async () => {
      const turn = await insertTurn(
        db,
        testData.turn(testProjectId, testConversationId, { content: 'Blob test' })
      );
      const embedding = [0.5, -0.5, 1.0, -1.0];

      await insertSegmentEmbedding(db, {
        turnHash: turn.turnHash,
        segmentIndex: 0,
        segmentText: 'Blob segment',
        embeddingModel: 'test',
        embeddingDim: embedding.length,
        embedding,
      });

      const rows = await db
        .select()
        .from(segmentEmbeddings)
        .where(eq(segmentEmbeddings.turnHash, turn.turnHash));

      // PostgreSQL may return Uint8Array or Buffer depending on environment
      const embeddingData = rows[0].embedding;
      expect(embeddingData).toBeDefined();
      expect(embeddingData.byteLength).toBeGreaterThan(0);

      // Convert to Buffer if needed for bufferToFloat32Array
      const buffer = Buffer.isBuffer(embeddingData) ? embeddingData : Buffer.from(embeddingData);
      const recovered = bufferToFloat32Array(buffer);
      for (let i = 0; i < embedding.length; i++) {
        expect(recovered[i]).toBeCloseTo(embedding[i], 5);
      }
    });

    it('upserts on conflict', async () => {
      const turn = await insertTurn(
        db,
        testData.turn(testProjectId, testConversationId, { content: 'Upsert test' })
      );

      // Insert first
      await insertSegmentEmbedding(db, {
        turnHash: turn.turnHash,
        segmentIndex: 0,
        segmentText: 'Original text',
        embeddingModel: 'model-v1',
        embeddingDim: 2,
        embedding: [0.1, 0.2],
      });

      // Upsert same segment
      const updated = await insertSegmentEmbedding(db, {
        turnHash: turn.turnHash,
        segmentIndex: 0,
        segmentText: 'Updated text',
        embeddingModel: 'model-v2',
        embeddingDim: 2,
        embedding: [0.3, 0.4],
      });

      expect(updated.segmentText).toBe('Updated text');
      expect(updated.embeddingModel).toBe('model-v2');

      // Verify only one record exists
      const rows = await db
        .select()
        .from(segmentEmbeddings)
        .where(eq(segmentEmbeddings.turnHash, turn.turnHash));

      expect(rows).toHaveLength(1);
    });
  });

  describe('insertSegmentEmbeddingsBatch', () => {
    it('inserts multiple segments at once', async () => {
      const turn = await insertTurn(
        db,
        testData.turn(testProjectId, testConversationId, { content: 'Batch test' })
      );

      const input = {
        turnHash: turn.turnHash,
        embeddingModel: 'batch-model',
        embeddingDim: 3,
        segments: [
          { index: 0, text: 'Segment A', embedding: [0.1, 0.2, 0.3] },
          { index: 1, text: 'Segment B', embedding: [0.4, 0.5, 0.6] },
          { index: 2, text: 'Segment C', embedding: [0.7, 0.8, 0.9] },
        ],
      };

      const results = await insertSegmentEmbeddingsBatch(db, input);

      expect(results).toHaveLength(3);
      expect(results[0].segmentText).toBe('Segment A');
      expect(results[1].segmentText).toBe('Segment B');
      expect(results[2].segmentText).toBe('Segment C');
    });
  });

  describe('findSegmentEmbeddingById', () => {
    it('returns the segment embedding when it exists', async () => {
      const turn = await insertTurn(
        db,
        testData.turn(testProjectId, testConversationId, { content: 'Find by ID test' })
      );

      const created = await insertSegmentEmbedding(db, {
        turnHash: turn.turnHash,
        segmentIndex: 0,
        segmentText: 'Find me',
        embeddingModel: 'test',
        embeddingDim: 2,
        embedding: [1.0, 2.0],
      });

      const found = await findSegmentEmbeddingById(db, created.segmentId);

      expect(found).toBeDefined();
      expect(found!.segmentId).toBe(created.segmentId);
      expect(found!.segmentText).toBe('Find me');
    });

    it('returns null when segment does not exist', async () => {
      const found = await findSegmentEmbeddingById(db, 'nonexistent:s-0');

      expect(found).toBeNull();
    });
  });

  describe('findSegmentEmbeddingsByTurn', () => {
    it('returns all segments for a turn in order', async () => {
      const turn = await insertTurn(
        db,
        testData.turn(testProjectId, testConversationId, { content: 'Turn segments test' })
      );

      await insertSegmentEmbeddingsBatch(db, {
        turnHash: turn.turnHash,
        embeddingModel: 'test',
        embeddingDim: 2,
        segments: [
          { index: 0, text: 'First', embedding: [0.1, 0.2] },
          { index: 1, text: 'Second', embedding: [0.3, 0.4] },
        ],
      });

      const results = await findSegmentEmbeddingsByTurn(db, turn.turnHash);

      expect(results).toHaveLength(2);
      expect(results[0].segmentIndex).toBe(0);
      expect(results[1].segmentIndex).toBe(1);
    });

    it('returns empty array for turn with no embeddings', async () => {
      const turn = await insertTurn(
        db,
        testData.turn(testProjectId, testConversationId, { content: 'No embeddings' })
      );

      const results = await findSegmentEmbeddingsByTurn(db, turn.turnHash);

      expect(results).toHaveLength(0);
    });
  });

  describe('findSegmentEmbeddingsByTurns', () => {
    it('returns embeddings grouped by turn hash', async () => {
      const turn1 = await insertTurn(
        db,
        testData.turn(testProjectId, testConversationId, { content: 'Multi turn 1' })
      );
      const turn2 = await insertTurn(
        db,
        testData.turn(testProjectId, testConversationId, { content: 'Multi turn 2' })
      );

      await insertSegmentEmbedding(db, {
        turnHash: turn1.turnHash,
        segmentIndex: 0,
        segmentText: 'T1S0',
        embeddingModel: 'test',
        embeddingDim: 2,
        embedding: [0.1, 0.2],
      });

      await insertSegmentEmbedding(db, {
        turnHash: turn2.turnHash,
        segmentIndex: 0,
        segmentText: 'T2S0',
        embeddingModel: 'test',
        embeddingDim: 2,
        embedding: [0.3, 0.4],
      });

      const results = await findSegmentEmbeddingsByTurns(db, [turn1.turnHash, turn2.turnHash]);

      expect(results.size).toBe(2);
      expect(results.get(turn1.turnHash)).toHaveLength(1);
      expect(results.get(turn2.turnHash)).toHaveLength(1);
    });

    it('returns empty map for empty input', async () => {
      const results = await findSegmentEmbeddingsByTurns(db, []);

      expect(results.size).toBe(0);
    });
  });

  describe('hasEmbeddingsForTurn', () => {
    it('returns true when embeddings exist', async () => {
      const turn = await insertTurn(
        db,
        testData.turn(testProjectId, testConversationId, { content: 'Has embeddings' })
      );

      await insertSegmentEmbedding(db, {
        turnHash: turn.turnHash,
        segmentIndex: 0,
        segmentText: 'Exists',
        embeddingModel: 'test',
        embeddingDim: 2,
        embedding: [0.1, 0.2],
      });

      const has = await hasEmbeddingsForTurn(db, turn.turnHash);

      expect(has).toBe(true);
    });

    it('returns false when no embeddings exist', async () => {
      const turn = await insertTurn(
        db,
        testData.turn(testProjectId, testConversationId, { content: 'No embeddings here' })
      );

      const has = await hasEmbeddingsForTurn(db, turn.turnHash);

      expect(has).toBe(false);
    });
  });

  describe('getEmbeddingsCountForTurn', () => {
    it('returns correct count', async () => {
      const turn = await insertTurn(
        db,
        testData.turn(testProjectId, testConversationId, { content: 'Count test' })
      );

      await insertSegmentEmbeddingsBatch(db, {
        turnHash: turn.turnHash,
        embeddingModel: 'test',
        embeddingDim: 2,
        segments: [
          { index: 0, text: 'A', embedding: [0.1, 0.2] },
          { index: 1, text: 'B', embedding: [0.3, 0.4] },
          { index: 2, text: 'C', embedding: [0.5, 0.6] },
        ],
      });

      const count = await getEmbeddingsCountForTurn(db, turn.turnHash);

      expect(count).toBe(3);
    });

    it('returns 0 for turn with no embeddings', async () => {
      const turn = await insertTurn(
        db,
        testData.turn(testProjectId, testConversationId, { content: 'Zero count' })
      );

      const count = await getEmbeddingsCountForTurn(db, turn.turnHash);

      expect(count).toBe(0);
    });
  });

  describe('deleteSegmentEmbeddingsByTurn', () => {
    it('deletes all embeddings for a turn', async () => {
      const turn = await insertTurn(
        db,
        testData.turn(testProjectId, testConversationId, { content: 'Delete test' })
      );

      await insertSegmentEmbeddingsBatch(db, {
        turnHash: turn.turnHash,
        embeddingModel: 'test',
        embeddingDim: 2,
        segments: [
          { index: 0, text: 'X', embedding: [0.1, 0.2] },
          { index: 1, text: 'Y', embedding: [0.3, 0.4] },
        ],
      });

      const deletedCount = await deleteSegmentEmbeddingsByTurn(db, turn.turnHash);

      expect(deletedCount).toBe(2);

      const remaining = await findSegmentEmbeddingsByTurn(db, turn.turnHash);
      expect(remaining).toHaveLength(0);
    });

    it('returns 0 when no embeddings to delete', async () => {
      const count = await deleteSegmentEmbeddingsByTurn(db, 'sha256:nonexistent');

      expect(count).toBe(0);
    });
  });

  describe('findEmbeddingsByModel', () => {
    it('returns embeddings for a specific model', async () => {
      const turn = await insertTurn(
        db,
        testData.turn(testProjectId, testConversationId, { content: 'Model filter test' })
      );

      await insertSegmentEmbedding(db, {
        turnHash: turn.turnHash,
        segmentIndex: 0,
        segmentText: 'Model A',
        embeddingModel: 'unique-model-xyz',
        embeddingDim: 2,
        embedding: [0.1, 0.2],
      });

      const results = await findEmbeddingsByModel(db, 'unique-model-xyz');

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.every((r) => r.embeddingModel === 'unique-model-xyz')).toBe(true);
    });

    it('respects limit option', async () => {
      const results = await findEmbeddingsByModel(db, 'test', 5);

      expect(results.length).toBeLessThanOrEqual(5);
    });
  });
});
