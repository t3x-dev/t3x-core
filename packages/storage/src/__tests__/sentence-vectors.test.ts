/**
 * Sentence Vectors Tests
 *
 * Tests for pgvector-powered sentence similarity search.
 * Uses embedded-postgres with the pgvector extension for isolated testing.
 */

import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import {
  deleteSentenceVectorsByCommit,
  deleteSentenceVectorsByProject,
  rrfFusion,
  searchByKeyword,
  searchHybrid,
  searchSimilarSentences,
  upsertSentenceVector,
  upsertSentenceVectorsBatch,
} from '../queries/sentenceVectors';
import { createTestDB } from './setup';

/** Check if pgvector is available in this postgres instance */
async function hasVector(sql: postgres.Sql): Promise<boolean> {
  try {
    await sql.unsafe("SELECT 'test'::vector(1)");
    return true;
  } catch {
    return false;
  }
}

describe('sentenceVectors', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;
  let vectorAvailable = false;

  beforeAll(async () => {
    const testEnv = await createTestDB();
    db = testEnv.db;
    cleanup = testEnv.cleanup;
    vectorAvailable = await hasVector(testEnv.sql);
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
    if (!vectorAvailable) return;
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
    if (!vectorAvailable) return;
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
    if (!vectorAvailable) return;
    const results = await searchSimilarSentences(db, 'proj_test1', makeVector(3), 10);

    // batch002 should be highest similarity (seed 3 matches)
    expect(results[0].id).toBe('s_batch002');
    // Similarity should be descending
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].similarity).toBeGreaterThanOrEqual(results[i].similarity);
    }
  });

  it('should respect limit parameter', async () => {
    if (!vectorAvailable) return;
    const results = await searchSimilarSentences(db, 'proj_test1', makeVector(1), 2);
    expect(results.length).toBe(2);
  });

  it('should filter by project_id', async () => {
    if (!vectorAvailable) return;
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
    if (!vectorAvailable) return;
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
    if (!vectorAvailable) return;
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
    if (!vectorAvailable) return;
    const deleted = await deleteSentenceVectorsByCommit(db, 'sha256:def456');
    expect(deleted).toBe(3); // batch001, batch002, batch003
  });

  it('should delete vectors by project', async () => {
    if (!vectorAvailable) return;
    const deleted = await deleteSentenceVectorsByProject(db, 'proj_other');
    expect(deleted).toBe(1);
  });
});

describe('searchByKeyword (keyword)', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;
  let vectorAvailable = false;

  const PROJECT_ID = 'proj_kw_test';
  const COMMIT_HASH = 'sha256:kw_commit';

  // 768-d zero vector (dummy — keyword search doesn't use embeddings)
  function zeroVector(): number[] {
    const vec = new Array(768).fill(0);
    vec[0] = 1; // at least one non-zero to pass validation
    return vec;
  }

  beforeAll(async () => {
    const testEnv = await createTestDB();
    db = testEnv.db;
    cleanup = testEnv.cleanup;
    vectorAvailable = await hasVector(testEnv.sql);

    if (!vectorAvailable) return;

    // Insert test sentences with known text
    const sentences = [
      { id: 's_kw001', text: 'The pricing strategy includes tiered plans' },
      { id: 's_kw002', text: 'Customer support handles billing inquiries' },
      { id: 's_kw003', text: 'Enterprise pricing starts at $99 per month' },
      { id: 's_kw004', text: 'The product roadmap includes new features' },
    ];

    for (const s of sentences) {
      await upsertSentenceVector(db, {
        id: s.id,
        projectId: PROJECT_ID,
        commitHash: COMMIT_HASH,
        text: s.text,
        embedding: zeroVector(),
        modelId: 'test-model',
      });
    }
  });

  afterAll(async () => {
    await cleanup();
  });

  it('should find sentences matching a keyword', async () => {
    if (!vectorAvailable) return;
    const results = await searchByKeyword(db, PROJECT_ID, 'pricing', 10);
    expect(results.length).toBe(2);
    const ids = results.map((r) => r.id);
    expect(ids).toContain('s_kw001');
    expect(ids).toContain('s_kw003');
  });

  it('should not return non-matching sentences', async () => {
    if (!vectorAvailable) return;
    const results = await searchByKeyword(db, PROJECT_ID, 'pricing', 10);
    const ids = results.map((r) => r.id);
    expect(ids).not.toContain('s_kw002');
    expect(ids).not.toContain('s_kw004');
  });

  it('should return results ordered by keyword_score descending', async () => {
    if (!vectorAvailable) return;
    const results = await searchByKeyword(db, PROJECT_ID, 'pricing', 10);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].keyword_score).toBeGreaterThanOrEqual(results[i].keyword_score);
    }
  });

  it('should respect limit parameter', async () => {
    if (!vectorAvailable) return;
    const results = await searchByKeyword(db, PROJECT_ID, 'pricing', 1);
    expect(results.length).toBe(1);
  });

  it('should scope results to project_id', async () => {
    if (!vectorAvailable) return;
    const results = await searchByKeyword(db, 'proj_nonexistent', 'pricing', 10);
    expect(results.length).toBe(0);
  });

  it('should return empty array for empty query', async () => {
    if (!vectorAvailable) return;
    const results = await searchByKeyword(db, PROJECT_ID, '', 10);
    expect(results.length).toBe(0);
  });

  it('should return empty array for whitespace-only query', async () => {
    if (!vectorAvailable) return;
    const results = await searchByKeyword(db, PROJECT_ID, '   ', 10);
    expect(results.length).toBe(0);
  });

  it('should return correct fields in results', async () => {
    if (!vectorAvailable) return;
    const results = await searchByKeyword(db, PROJECT_ID, 'billing', 10);
    expect(results.length).toBe(1);
    const row = results[0];
    expect(row.id).toBe('s_kw002');
    expect(row.project_id).toBe(PROJECT_ID);
    expect(row.commit_hash).toBe(COMMIT_HASH);
    expect(row.text).toBe('Customer support handles billing inquiries');
    expect(typeof row.keyword_score).toBe('number');
    expect(row.keyword_score).toBeGreaterThan(0);
  });

  it('should find sentences with word "includes"', async () => {
    if (!vectorAvailable) return;
    const results = await searchByKeyword(db, PROJECT_ID, 'includes', 10);
    expect(results.length).toBe(2);
    const ids = results.map((r) => r.id);
    expect(ids).toContain('s_kw001');
    expect(ids).toContain('s_kw004');
  });
});

// ============================================================
// rrfFusion (pure function — no DB needed)
// ============================================================

describe('rrfFusion', () => {
  it('combines keyword and vector results with correct scores', () => {
    const kwResults = [
      { id: 'a', project_id: 'p1', commit_hash: 'h1', text: 'A' },
      { id: 'b', project_id: 'p1', commit_hash: 'h1', text: 'B' },
    ];
    const vecResults = [
      { id: 'b', project_id: 'p1', commit_hash: 'h1', text: 'B' },
      { id: 'c', project_id: 'p1', commit_hash: 'h1', text: 'C' },
    ];

    const results = rrfFusion(kwResults, vecResults, 10);

    // 'b' appears in both → highest score
    expect(results[0].id).toBe('b');
    expect(results[0].keyword_rank).toBe(2);
    expect(results[0].vector_rank).toBe(1);
    expect(results[0].score).toBeCloseTo(1 / (60 + 2) + 1 / (60 + 1), 10);

    // 'a' and 'c' appear in one list each
    expect(results.length).toBe(3);
  });

  it('respects limit parameter', () => {
    const kwResults = Array.from({ length: 10 }, (_, i) => ({
      id: `kw${i}`,
      project_id: 'p1',
      commit_hash: 'h1',
      text: `KW${i}`,
    }));
    const vecResults = Array.from({ length: 10 }, (_, i) => ({
      id: `vec${i}`,
      project_id: 'p1',
      commit_hash: 'h1',
      text: `VEC${i}`,
    }));

    const results = rrfFusion(kwResults, vecResults, 5);
    expect(results.length).toBe(5);
  });

  it('handles empty keyword results', () => {
    const vecResults = [{ id: 'a', project_id: 'p1', commit_hash: 'h1', text: 'A' }];
    const results = rrfFusion([], vecResults, 10);
    expect(results.length).toBe(1);
    expect(results[0].keyword_rank).toBeNull();
    expect(results[0].vector_rank).toBe(1);
  });

  it('handles empty vector results', () => {
    const kwResults = [{ id: 'a', project_id: 'p1', commit_hash: 'h1', text: 'A' }];
    const results = rrfFusion(kwResults, [], 10);
    expect(results.length).toBe(1);
    expect(results[0].keyword_rank).toBe(1);
    expect(results[0].vector_rank).toBeNull();
  });

  it('handles both empty', () => {
    const results = rrfFusion([], [], 10);
    expect(results.length).toBe(0);
  });
});

// ============================================================
// searchHybrid (integration test — requires DB + pgvector)
// ============================================================

describe('searchHybrid', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;
  let vectorAvailable = false;

  const PROJECT_ID = 'proj_hybrid_test';
  const COMMIT_HASH = 'sha256:hybrid_commit';

  // Create a 768-d vector with value at specific index positions
  function sparseVector(values: Array<[number, number]>): number[] {
    const vec = new Array(768).fill(0);
    for (const [idx, val] of values) {
      vec[idx] = val;
    }
    return vec;
  }

  beforeAll(async () => {
    const testEnv = await createTestDB();
    db = testEnv.db;
    cleanup = testEnv.cleanup;
    vectorAvailable = await hasVector(testEnv.sql);

    if (!vectorAvailable) return;

    // Insert test sentences:
    // - "pricing strategy" with embedding pointing mostly in dim 0
    // - "customer support" with embedding pointing mostly in dim 1
    // - "product roadmap"  with embedding pointing mostly in dim 2
    const sentences = [
      {
        id: 's_hyb001',
        text: 'The pricing strategy includes tiered plans',
        embedding: sparseVector([
          [0, 1],
          [1, 0],
          [2, 0],
        ]),
      },
      {
        id: 's_hyb002',
        text: 'Customer support handles billing inquiries',
        embedding: sparseVector([
          [0, 0],
          [1, 1],
          [2, 0],
        ]),
      },
      {
        id: 's_hyb003',
        text: 'The product roadmap covers next quarter',
        embedding: sparseVector([
          [0, 0],
          [1, 0],
          [2, 1],
        ]),
      },
    ];

    for (const s of sentences) {
      await upsertSentenceVector(db, {
        id: s.id,
        projectId: PROJECT_ID,
        commitHash: COMMIT_HASH,
        text: s.text,
        embedding: s.embedding,
        modelId: 'test-model',
      });
    }
  });

  afterAll(async () => {
    await cleanup();
  });

  it('should rank dual-match item highest', async () => {
    if (!vectorAvailable) return;

    // Query embedding close to "pricing" (dim 0), keyword "pricing"
    const queryEmbedding = sparseVector([
      [0, 0.9],
      [1, 0.1],
      [2, 0],
    ]);

    const results = await searchHybrid(db, PROJECT_ID, 'pricing', queryEmbedding, 10);

    // "pricing strategy" should be #1 — matched by both keyword AND vector
    expect(results[0].id).toBe('s_hyb001');
    expect(results[0].keyword_rank).not.toBeNull();
    expect(results[0].vector_rank).not.toBeNull();
  });

  it('should include results from both sources', async () => {
    if (!vectorAvailable) return;

    // Query embedding close to "customer support" (dim 1), keyword "roadmap"
    const queryEmbedding = sparseVector([
      [0, 0],
      [1, 0.95],
      [2, 0.05],
    ]);

    const results = await searchHybrid(db, PROJECT_ID, 'roadmap', queryEmbedding, 10);

    const ids = results.map((r) => r.id);
    // "customer support" from vector, "product roadmap" from keyword
    expect(ids).toContain('s_hyb002'); // vector match
    expect(ids).toContain('s_hyb003'); // keyword match
  });

  it('should respect limit parameter', async () => {
    if (!vectorAvailable) return;

    const queryEmbedding = sparseVector([
      [0, 0.5],
      [1, 0.5],
      [2, 0],
    ]);

    const results = await searchHybrid(db, PROJECT_ID, 'pricing', queryEmbedding, 1);
    expect(results.length).toBe(1);
  });

  it('should return correct HybridSearchResult fields', async () => {
    if (!vectorAvailable) return;

    const queryEmbedding = sparseVector([
      [0, 1],
      [1, 0],
      [2, 0],
    ]);

    const results = await searchHybrid(db, PROJECT_ID, 'pricing', queryEmbedding, 10);
    const first = results[0];

    expect(first.id).toBeTruthy();
    expect(first.project_id).toBe(PROJECT_ID);
    expect(first.commit_hash).toBe(COMMIT_HASH);
    expect(first.text).toBeTruthy();
    expect(typeof first.score).toBe('number');
    expect(first.score).toBeGreaterThan(0);
    // keyword_rank and vector_rank should be number or null
    expect(first.keyword_rank === null || typeof first.keyword_rank === 'number').toBe(true);
    expect(first.vector_rank === null || typeof first.vector_rank === 'number').toBe(true);
  });
});
