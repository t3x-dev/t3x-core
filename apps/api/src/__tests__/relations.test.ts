/**
 * Relations Route Tests
 *
 * Integration tests for GET/POST inter-sentence relation endpoints.
 */

import type { AnyDB } from '@t3x-dev/storage';
import { insertProject } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

// biome-ignore lint/suspicious/noExplicitAny: test helper
type ApiResponse = any;

let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// Mock provider registry — getLLMProvider is async (must return Promise by default)
const { mockGetLLMProvider } = vi.hoisted(() => ({
  mockGetLLMProvider: vi.fn().mockResolvedValue(null),
}));

vi.mock('../lib/provider-registry', () => ({
  getLLMProvider: mockGetLLMProvider,
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

import { commitRoutes } from '../routes/commits.openapi';
import { relationsRoutes } from '../routes/relations.openapi';

describe('Relations Routes', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let testCommitHash: string;
  const app = new Hono();
  app.route('/', commitRoutes);
  app.route('/', relationsRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    // Create a test project
    const project = await insertProject(mockDB, testData.project({ name: 'Relations Test' }));
    testProjectId = project.projectId;

    // Create a test commit with frames
    const res = await app.request('/v1/commits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parents: [],
        author: { type: 'human', name: 'Relation Tester' },
        content: {
          trees: [
            {
              key: 'f_001',
              slots: { text: 'We want to visit Tokyo in spring.' },
              children: [],
            },
            {
              key: 'f_002',
              slots: { text: 'Cherry blossoms bloom in late March.' },
              children: [],
            },
            {
              key: 'f_003',
              slots: { text: 'Budget is around $3000 per person.' },
              children: [],
            },
          ],
          relations: [],
        },
        project_id: testProjectId,
        message: 'Initial plan for relations test',
        branch: 'main',
      }),
    });

    const data: ApiResponse = await res.json();
    expect(data.success).toBe(true);
    testCommitHash = data.data.commit.hash;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('GET /v1/commits/:hash/relations', () => {
    it('returns empty array initially', async () => {
      const res = await app.request(`/v1/commits/${encodeURIComponent(testCommitHash)}/relations`);
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.relations).toEqual([]);
    });

    it('returns 404 for non-existent commit', async () => {
      const res = await app.request('/v1/commits/sha256:nonexistent_hash/relations');
      expect(res.status).toBe(404);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('COMMIT_NOT_FOUND');
    });
  });

  describe('POST /v1/commits/:hash/relations/extract', () => {
    it('returns 404 for non-existent commit', async () => {
      const res = await app.request('/v1/commits/sha256:nonexistent_hash/relations/extract', {
        method: 'POST',
      });
      expect(res.status).toBe(404);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('COMMIT_NOT_FOUND');
    });

    it('returns 400 when no LLM provider is configured', async () => {
      mockGetLLMProvider.mockResolvedValueOnce(null);

      const res = await app.request(
        `/v1/commits/${encodeURIComponent(testCommitHash)}/relations/extract`,
        { method: 'POST' }
      );
      expect(res.status).toBe(400);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('LLM_NOT_CONFIGURED');
    });

    it('triggers extraction and returns stats', async () => {
      // Mock LLM provider that returns valid relation JSON
      const mockProvider = {
        generate: vi.fn().mockResolvedValue({
          text: JSON.stringify([
            {
              source_id: 'f_001',
              target_id: 'f_002',
              type: 'temporal_follows',
              confidence: 0.9,
              reasoning: 'Cherry blossoms follow the spring visit timing.',
            },
            {
              source_id: 'f_003',
              target_id: 'f_001',
              type: 'supports',
              confidence: 0.75,
              reasoning: 'Budget supports the trip plan.',
            },
          ]),
          usage: { inputTokens: 10, outputTokens: 5 },
        }),
      };
      mockGetLLMProvider.mockResolvedValueOnce(mockProvider);

      const res = await app.request(
        `/v1/commits/${encodeURIComponent(testCommitHash)}/relations/extract`,
        { method: 'POST' }
      );
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.relations_found).toBe(2);
      expect(data.data.stats).toBeDefined();
      expect(data.data.stats.total_sentences).toBe(3);
      expect(data.data.stats.relations_found).toBe(2);
      expect(data.data.stats.avg_confidence).toBeGreaterThan(0);
      expect(data.data.stats.extraction_time_ms).toBeGreaterThanOrEqual(0);
    });
  });

  describe('GET returns relations after extraction', () => {
    it('returns persisted relations after extract', async () => {
      // Set up mock LLM provider for extraction
      const mockProvider = {
        generate: vi.fn().mockResolvedValue({
          text: JSON.stringify([
            {
              source_id: 'f_001',
              target_id: 'f_002',
              type: 'temporal_follows',
              confidence: 0.85,
              reasoning: 'Cherry blossoms follow the plan to visit in spring.',
            },
          ]),
          usage: { inputTokens: 10, outputTokens: 5 },
        }),
      };
      mockGetLLMProvider.mockResolvedValueOnce(mockProvider);

      // Trigger extraction
      const extractRes = await app.request(
        `/v1/commits/${encodeURIComponent(testCommitHash)}/relations/extract`,
        { method: 'POST' }
      );
      expect(extractRes.status).toBe(200);

      // Fetch relations via GET
      const getRes = await app.request(
        `/v1/commits/${encodeURIComponent(testCommitHash)}/relations`
      );
      expect(getRes.status).toBe(200);

      const data: ApiResponse = await getRes.json();
      expect(data.success).toBe(true);
      expect(data.data.relations.length).toBeGreaterThanOrEqual(1);

      const rel = data.data.relations[0];
      expect(rel.id).toBeDefined();
      expect(rel.source_id).toBe('f_001');
      expect(rel.target_id).toBe('f_002');
      expect(rel.type).toBe('temporal_follows');
      expect(rel.confidence).toBe(0.85);
      expect(rel.reasoning).toBe('Cherry blossoms follow the plan to visit in spring.');
    });

    it('re-extraction replaces existing relations', async () => {
      // First extraction
      const mockProvider1 = {
        generate: vi.fn().mockResolvedValue({
          text: JSON.stringify([
            {
              source_id: 'f_001',
              target_id: 'f_002',
              type: 'causes',
              confidence: 0.7,
              reasoning: 'First extraction result.',
            },
          ]),
          usage: { inputTokens: 10, outputTokens: 5 },
        }),
      };
      mockGetLLMProvider.mockResolvedValueOnce(mockProvider1);

      await app.request(`/v1/commits/${encodeURIComponent(testCommitHash)}/relations/extract`, {
        method: 'POST',
      });

      // Second extraction with different result
      const mockProvider2 = {
        generate: vi.fn().mockResolvedValue({
          text: JSON.stringify([
            {
              source_id: 'f_002',
              target_id: 'f_003',
              type: 'contrasts',
              confidence: 0.8,
              reasoning: 'Second extraction replaces first.',
            },
          ]),
          usage: { inputTokens: 10, outputTokens: 5 },
        }),
      };
      mockGetLLMProvider.mockResolvedValueOnce(mockProvider2);

      const extractRes = await app.request(
        `/v1/commits/${encodeURIComponent(testCommitHash)}/relations/extract`,
        { method: 'POST' }
      );
      expect(extractRes.status).toBe(200);

      // Verify the old relations are gone, only new ones remain
      const getRes = await app.request(
        `/v1/commits/${encodeURIComponent(testCommitHash)}/relations`
      );
      const data: ApiResponse = await getRes.json();
      expect(data.success).toBe(true);
      // Should only have the relation from the second extraction
      expect(data.data.relations).toHaveLength(1);
      expect(data.data.relations[0].source_id).toBe('f_002');
      expect(data.data.relations[0].target_id).toBe('f_003');
      expect(data.data.relations[0].type).toBe('contrasts');
    });
  });
});
