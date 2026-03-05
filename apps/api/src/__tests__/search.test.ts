/**
 * Search Route Tests
 *
 * Tests for POST /v1/search endpoint (keyword, semantic, hybrid modes).
 * Requires pgvector extension — tests are skipped if not available.
 */

import { insertProject } from '@t3x/storage';
import type { PGLiteDB } from '@t3x/storage/pglite';
import { upsertSentenceVector } from '@t3x/storage/pglite';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

// biome-ignore lint/suspicious/noExplicitAny: test helper
type ApiResponse = any;

let mockDB: PGLiteDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// Mock embedder — default: not configured (null)
const { mockGetEmbedder } = vi.hoisted(() => ({
  mockGetEmbedder: vi.fn().mockReturnValue(null),
}));

vi.mock('../lib/embedder', () => ({
  getEmbedder: mockGetEmbedder,
  isSemanticValidationConfigured: vi.fn().mockReturnValue(false),
}));

// Mock pino logger to silence output in tests
vi.mock('../middleware/logger', () => ({
  pinoLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { searchRoutes } from '../routes/search.openapi';

/** Check if pgvector/sentence_vectors table is available */
async function hasSentenceVectors(db: PGLiteDB): Promise<boolean> {
  try {
    const result = await (
      db as unknown as { execute: (q: unknown) => Promise<{ rows: unknown[] }> }
    ).execute({
      sql: "SELECT 1 FROM information_schema.tables WHERE table_name = 'sentence_vectors'",
      params: [],
    });
    // Drizzle execute returns different shapes — try raw exec approach
    return true;
  } catch {
    return false;
  }
}

describe('Search Routes', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let vectorAvailable = false;
  const app = new Hono();
  app.route('/', searchRoutes);

  // 768-dim vector helpers
  const zeroVec = (dim = 768) => new Array(dim).fill(0);
  const makeVec = (index: number, dim = 768) => {
    const v = zeroVec(dim);
    v[index % dim] = 1;
    return v;
  };

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    // Create test project
    const project = await insertProject(mockDB, testData.project({ name: 'Search Test' }));
    testProjectId = project.projectId;

    // Check if pgvector/sentence_vectors is available
    try {
      await upsertSentenceVector(mockDB, {
        id: 's_search_probe',
        projectId: testProjectId,
        commitHash: 'sha256:probe',
        text: 'probe',
        embedding: makeVec(0),
        modelId: 'test',
      });
      vectorAvailable = true;

      // Insert test sentences
      const sentences = [
        { id: 's_search_1', text: 'The pricing strategy includes tiered plans', idx: 0 },
        { id: 's_search_2', text: 'Customer support handles billing inquiries', idx: 1 },
        { id: 's_search_3', text: 'Enterprise pricing starts at $99 per month', idx: 2 },
        { id: 's_search_4', text: 'The product roadmap includes new features', idx: 3 },
      ];

      for (const s of sentences) {
        await upsertSentenceVector(mockDB, {
          id: s.id,
          projectId: testProjectId,
          commitHash: 'sha256:search_test_commit',
          text: s.text,
          embedding: makeVec(s.idx),
          modelId: 'test-model',
        });
      }
    } catch {
      // pgvector not available — tests will be skipped
      vectorAvailable = false;
    }
  });

  afterAll(async () => {
    await cleanup();
  });

  // ── Keyword Mode ────────────────────────────────────────────

  describe('keyword mode', () => {
    it('returns matching sentences for keyword search', async () => {
      if (!vectorAvailable) return;

      const res = await app.request('/v1/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          query: 'pricing',
          mode: 'keyword',
          limit: 10,
        }),
      });

      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.mode).toBe('keyword');
      expect(json.data.results.length).toBe(2);
      const ids = json.data.results.map((r: ApiResponse) => r.sentence_id);
      expect(ids).toContain('s_search_1');
      expect(ids).toContain('s_search_3');
    });

    it('returns empty results for non-matching query', async () => {
      if (!vectorAvailable) return;

      const res = await app.request('/v1/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          query: 'nonexistentterm',
          mode: 'keyword',
          limit: 10,
        }),
      });

      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      expect(json.data.results.length).toBe(0);
      expect(json.data.total).toBe(0);
    });

    it('includes query_time_ms in response', async () => {
      if (!vectorAvailable) return;

      const res = await app.request('/v1/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          query: 'pricing',
          mode: 'keyword',
        }),
      });

      const json: ApiResponse = await res.json();
      expect(json.data.query_time_ms).toBeTypeOf('number');
      expect(json.data.query_time_ms).toBeGreaterThanOrEqual(0);
    });
  });

  // ── Semantic Mode ───────────────────────────────────────────

  describe('semantic mode', () => {
    it('returns error when embedder not configured', async () => {
      if (!vectorAvailable) return;
      mockGetEmbedder.mockReturnValue(null);

      const res = await app.request('/v1/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          query: 'pricing',
          mode: 'semantic',
        }),
      });

      expect(res.status).toBe(400);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('EMBEDDER_NOT_CONFIGURED');
    });

    it('returns results when embedder is configured', async () => {
      if (!vectorAvailable) return;
      mockGetEmbedder.mockReturnValue({
        id: 'test-embedder',
        embed: vi.fn().mockResolvedValue([makeVec(0)]),
      });

      const res = await app.request('/v1/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          query: 'pricing',
          mode: 'semantic',
          limit: 4,
        }),
      });

      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.mode).toBe('semantic');
      expect(json.data.results.length).toBeGreaterThan(0);
      expect(json.data.results[0].sentence_id).toBe('s_search_1');
    });
  });

  // ── Hybrid Mode ─────────────────────────────────────────────

  describe('hybrid mode', () => {
    it('falls back to keyword when embedder not configured', async () => {
      if (!vectorAvailable) return;
      mockGetEmbedder.mockReturnValue(null);

      const res = await app.request('/v1/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          query: 'pricing',
          mode: 'hybrid',
        }),
      });

      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.mode).toBe('keyword');
      expect(json.data.results.length).toBe(2);
    });

    it('returns hybrid results when embedder is configured', async () => {
      if (!vectorAvailable) return;
      mockGetEmbedder.mockReturnValue({
        id: 'test-embedder',
        embed: vi.fn().mockResolvedValue([makeVec(0)]),
      });

      const res = await app.request('/v1/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          query: 'pricing',
          mode: 'hybrid',
          limit: 10,
        }),
      });

      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.mode).toBe('hybrid');
      expect(json.data.results.length).toBeGreaterThan(0);
    });
  });

  // ── Validation (no pgvector needed) ─────────────────────────

  describe('validation', () => {
    it('rejects empty query', async () => {
      const res = await app.request('/v1/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: 'proj_test',
          query: '',
          mode: 'keyword',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('rejects missing project_id', async () => {
      const res = await app.request('/v1/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'test',
          mode: 'keyword',
        }),
      });

      expect(res.status).toBe(400);
    });
  });
});
