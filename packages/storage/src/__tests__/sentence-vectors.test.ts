/**
 * Sentence Vectors Tests
 *
 * Tests for pgvector-powered sentence similarity search.
 * Uses PGLite with the vector extension for isolated in-memory testing.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import {
  deleteSentenceVectorsByCommit,
  deleteSentenceVectorsByProject,
  searchSimilarSentences,
  upsertSentenceVector,
  upsertSentenceVectorsBatch,
} from '../queries/sentenceVectors';
import { createTestDB } from './setup';

describe('sentenceVectors', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const testEnv = await createTestDB();
    db = testEnv.db;
    cleanup = testEnv.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  // Helper: create a simple 768-d vector with a known pattern
  function makeVector(seed: number): number[] {
    const vec = new Array(768).fill(0);
    // Create a sparse, normalized-ish pattern
    vec[0] = Math.cos(seed);
    vec[1] = Math.sin(seed);
    vec[2] = Math.cos(seed * 2);
    // Normalize
    const norm = Math.sqrt(vec[0] ** 2 + vec[1] ** 2 + vec[2] ** 2);
    if (norm > 0) {
      vec[0] /= norm;
      vec[1] /= norm;
      vec[2] /= norm;
    }
    return vec;
  }

  it('should upsert a single sentence vector', async () => {
    const input = {
      id: 's_test001',
      projectId: 'proj_test1',
      commitHash: 'sha256:abc123',
      text: 'This is a test sentence about pricing.',
      embedding: makeVector(1),
      modelId: 'google-ai:text-embedding-004',
    };

    await upsertSentenceVector(db, input);

    // Verify by searching
    const results = await searchSimilarSentences(db, 'proj_test1', makeVector(1), 10);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].id).toBe('s_test001');
    expect(results[0].text).toBe('This is a test sentence about pricing.');
    expect(results[0].similarity).toBeGreaterThan(0.9);
  });

  it('should upsert batch of vectors', async () => {
    const inputs = [
      {
        id: 's_batch001',
        projectId: 'proj_test1',
        commitHash: 'sha256:def456',
        text: 'Enterprise pricing starts at $29/month.',
        embedding: makeVector(2),
        modelId: 'google-ai:text-embedding-004',
      },
      {
        id: 's_batch002',
        projectId: 'proj_test1',
        commitHash: 'sha256:def456',
        text: 'Freemium conversion rate is 12%.',
        embedding: makeVector(3),
        modelId: 'google-ai:text-embedding-004',
      },
      {
        id: 's_batch003',
        projectId: 'proj_test1',
        commitHash: 'sha256:def456',
        text: 'SLA includes 99.9% uptime guarantee.',
        embedding: makeVector(4),
        modelId: 'google-ai:text-embedding-004',
      },
    ];

    await upsertSentenceVectorsBatch(db, inputs);

    const results = await searchSimilarSentences(db, 'proj_test1', makeVector(2), 10);
    expect(results.length).toBeGreaterThanOrEqual(3);
    // Closest should be batch001 (same vector seed)
    expect(results[0].id).toBe('s_batch001');
  });

  it('should return results sorted by similarity', async () => {
    const results = await searchSimilarSentences(db, 'proj_test1', makeVector(3), 10);

    // batch002 should be highest similarity (seed 3 matches)
    expect(results[0].id).toBe('s_batch002');
    // Similarity should be descending
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].similarity).toBeGreaterThanOrEqual(results[i].similarity);
    }
  });

  it('should respect limit parameter', async () => {
    const results = await searchSimilarSentences(db, 'proj_test1', makeVector(1), 2);
    expect(results.length).toBe(2);
  });

  it('should filter by project_id', async () => {
    // Insert vector for different project
    await upsertSentenceVector(db, {
      id: 's_other001',
      projectId: 'proj_other',
      commitHash: 'sha256:other',
      text: 'This is from another project.',
      embedding: makeVector(1),
      modelId: 'google-ai:text-embedding-004',
    });

    const results = await searchSimilarSentences(db, 'proj_other', makeVector(1), 10);
    expect(results.length).toBe(1);
    expect(results[0].project_id).toBe('proj_other');
  });

  it('should exclude specific commit hash', async () => {
    const results = await searchSimilarSentences(
      db,
      'proj_test1',
      makeVector(2),
      10,
      'sha256:def456' // exclude this commit
    );
    // Only s_test001 (from sha256:abc123) should remain for proj_test1
    for (const r of results) {
      expect(r.commit_hash).not.toBe('sha256:def456');
    }
  });

  it('should upsert (update) existing vector', async () => {
    await upsertSentenceVector(db, {
      id: 's_test001',
      projectId: 'proj_test1',
      commitHash: 'sha256:abc123',
      text: 'Updated sentence text.',
      embedding: makeVector(5),
      modelId: 'google-ai:text-embedding-004-v2',
    });

    const results = await searchSimilarSentences(db, 'proj_test1', makeVector(5), 1);
    expect(results[0].id).toBe('s_test001');
    expect(results[0].text).toBe('Updated sentence text.');
    expect(results[0].model_id).toBe('google-ai:text-embedding-004-v2');
  });

  it('should delete vectors by commit', async () => {
    const deleted = await deleteSentenceVectorsByCommit(db, 'sha256:def456');
    expect(deleted).toBe(3); // batch001, batch002, batch003
  });

  it('should delete vectors by project', async () => {
    const deleted = await deleteSentenceVectorsByProject(db, 'proj_other');
    expect(deleted).toBe(1);
  });
});
