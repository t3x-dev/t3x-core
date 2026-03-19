/**
 * Draft Workbench Features Tests
 *
 * Integration tests for Workbench features:
 * 1. Preview with model parameter (haiku/sonnet/opus)
 * 2. Suggest endpoint (returns suggestions based on draft goal)
 * 3. Commit populates sentence vectors (best-effort)
 * 4. Preview caching (same content returns cached result)
 * 5. Preview stale detection (after update, preview should be stale)
 */

import type { AnyDB } from '@t3x-dev/storage';
import { insertProject } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

// biome-ignore lint/suspicious/noExplicitAny: test helper
type ApiResponse = any;

// Mock the database module before importing routes
let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// Partial mock of @t3x-dev/core — keep real exports, mock only generation functions
const { mockGenerateLeafOutput, mockIsGenerationConfigured } = vi.hoisted(() => ({
  mockGenerateLeafOutput: vi.fn(),
  mockIsGenerationConfigured: vi.fn(),
}));

vi.mock('@t3x-dev/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@t3x-dev/core')>();
  return {
    ...actual,
    generateLeafOutput: mockGenerateLeafOutput,
    isGenerationConfigured: mockIsGenerationConfigured,
  };
});

// Mock embedder — return null by default (no embedder configured)
const mockGetEmbedder = vi.fn(() => null);

vi.mock('../lib/embedder', () => ({
  getEmbedder: () => mockGetEmbedder(),
}));

// Import routes after mocking
import { draftsRoutes } from '../routes/drafts.openapi';

describe('Draft Workbench Features', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  const app = new Hono();
  app.route('/', draftsRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    const project = await insertProject(mockDB, testData.project({ name: 'Draft Workbench Test' }));
    testProjectId = project.projectId;

    // Reset generation mocks
    mockGenerateLeafOutput.mockReset();
    mockIsGenerationConfigured.mockReset();
    mockGetEmbedder.mockReset();
    mockGetEmbedder.mockReturnValue(null);
  });

  afterAll(async () => {
    await cleanup();
  });

  // ============================================================
  // Helper: create a draft with sentences
  // ============================================================

  async function createDraftWithSentences(title: string, opts?: { goal?: string }) {
    const createRes = await app.request('/v1/drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: testProjectId,
        title,
        goal: opts?.goal,
      }),
    });
    const created: ApiResponse = await createRes.json();
    const draftId = created.data.id;

    // Add included sentences via PATCH
    await app.request(`/v1/drafts/${draftId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sentences: [
          {
            id: 'ds_v2_01',
            text: 'The product costs $99',
            origin: { type: 'manual' },
            position: 0,
            included: true,
          },
          {
            id: 'ds_v2_02',
            text: 'Free trial available for 14 days',
            origin: { type: 'manual' },
            position: 1,
            included: true,
          },
        ],
        if_revision: 1,
      }),
    });

    return draftId;
  }

  // ============================================================
  // 1. Preview with model parameter
  // ============================================================

  describe('POST /v1/drafts/:id/preview — model parameter', () => {
    it('passes haiku model through to generation', async () => {
      const draftId = await createDraftWithSentences('Preview Haiku');

      mockIsGenerationConfigured.mockReturnValue(true);
      mockGenerateLeafOutput.mockResolvedValue({
        output: 'Haiku output text',
        model: 'claude-haiku-4-5-20251001',
      });

      const res = await app.request(`/v1/drafts/${draftId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'haiku' }),
      });

      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.model_used).toBe('claude-haiku-4-5-20251001');

      // Verify generateLeafOutput was called with haiku model ID
      expect(mockGenerateLeafOutput).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-haiku-4-5-20251001',
        })
      );
    });

    it('passes sonnet model through to generation', async () => {
      const draftId = await createDraftWithSentences('Preview Sonnet');

      mockIsGenerationConfigured.mockReturnValue(true);
      mockGenerateLeafOutput.mockResolvedValue({
        output: 'Sonnet output text',
        model: 'claude-sonnet-4-6',
      });

      const res = await app.request(`/v1/drafts/${draftId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'sonnet' }),
      });

      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.data.model_used).toBe('claude-sonnet-4-6');

      expect(mockGenerateLeafOutput).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-sonnet-4-6',
        })
      );
    });

    it('passes opus model through to generation', async () => {
      const draftId = await createDraftWithSentences('Preview Opus');

      mockIsGenerationConfigured.mockReturnValue(true);
      mockGenerateLeafOutput.mockResolvedValue({
        output: 'Opus output text',
        model: 'claude-opus-4-6',
      });

      const res = await app.request(`/v1/drafts/${draftId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'opus' }),
      });

      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.data.model_used).toBe('claude-opus-4-6');

      expect(mockGenerateLeafOutput).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-opus-4-6',
        })
      );
    });

    it('defaults to haiku when no model specified', async () => {
      const draftId = await createDraftWithSentences('Preview Default');

      mockIsGenerationConfigured.mockReturnValue(true);
      mockGenerateLeafOutput.mockResolvedValue({
        output: 'Default output text',
        model: 'claude-haiku-4-5-20251001',
      });

      const res = await app.request(`/v1/drafts/${draftId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.data.model_used).toBe('claude-haiku-4-5-20251001');

      expect(mockGenerateLeafOutput).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-haiku-4-5-20251001',
        })
      );
    });
  });

  // ============================================================
  // 2. Suggest endpoint
  // ============================================================

  describe('POST /v1/drafts/:id/suggest', () => {
    it('returns 501 when embedder is not configured', async () => {
      const draftId = await createDraftWithSentences('Suggest No Embedder', {
        goal: 'Find pricing info',
      });

      mockGetEmbedder.mockReturnValue(null);

      const res = await app.request(`/v1/drafts/${draftId}/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(501);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('EMBEDDING_NOT_CONFIGURED');
    });

    it('returns 404 for non-existent draft', async () => {
      const res = await app.request('/v1/drafts/draft_nonexistent/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(404);
    });

    it('returns empty suggestions when draft has no goal', async () => {
      const draftId = await createDraftWithSentences('Suggest No Goal');

      // Provide a mock embedder that will not be called
      const mockEmb = {
        id: 'mock-embedder',
        encode: vi.fn(),
      };
      mockGetEmbedder.mockReturnValue(mockEmb);

      const res = await app.request(`/v1/drafts/${draftId}/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.suggestions).toEqual([]);
      // embedder.encode should not be called when there is no goal
      expect(mockEmb.encode).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // 3. Commit populates sentence vectors (best-effort)
  // ============================================================

  describe('POST /v1/drafts/:id/commit — vector population', () => {
    it('commits successfully when embedder is null (vectors skipped)', async () => {
      const draftId = await createDraftWithSentences('Commit No Vectors');
      mockGetEmbedder.mockReturnValue(null);

      const res = await app.request(`/v1/drafts/${draftId}/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Commit without vectors' }),
      });

      expect(res.status).toBe(201);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.commit).toBeDefined();
      expect(data.data.commit.hash).toMatch(/^sha256:/);
      expect(data.data.commit.content.frames).toHaveLength(2);
      expect(data.data.draft_status).toBe('committed');
    });

    it('commits successfully even if vector population fails', async () => {
      const draftId = await createDraftWithSentences('Commit Vector Fail');

      // Provide an embedder that throws on encode
      const failingEmbedder = {
        id: 'fail-embedder',
        encode: vi.fn().mockRejectedValue(new Error('Embedding service unavailable')),
      };
      mockGetEmbedder.mockReturnValue(failingEmbedder);

      // Suppress console.warn from the handler
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const res = await app.request(`/v1/drafts/${draftId}/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Commit with failing embedder' }),
      });

      expect(res.status).toBe(201);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.commit).toBeDefined();
      expect(data.data.draft_status).toBe('committed');

      // Embedder encode was called (best-effort attempt)
      expect(failingEmbedder.encode).toHaveBeenCalledTimes(1);

      warnSpy.mockRestore();
    });
  });

  // ============================================================
  // 4. Preview caching
  // ============================================================

  describe('POST /v1/drafts/:id/preview — caching', () => {
    it('returns cached preview on identical content', async () => {
      const draftId = await createDraftWithSentences('Preview Cache V2');

      mockIsGenerationConfigured.mockReturnValue(true);
      mockGenerateLeafOutput.mockResolvedValue({
        output: 'Cached output for V2 test',
        model: 'claude-haiku-4-5-20251001',
      });

      // Reset call count
      mockGenerateLeafOutput.mockClear();

      // First request — generates fresh output
      const res1 = await app.request(`/v1/drafts/${draftId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res1.status).toBe(200);
      const data1: ApiResponse = await res1.json();
      expect(data1.data.cached).toBe(false);
      expect(data1.data.output).toBe('Cached output for V2 test');

      // Wait past debounce window (1s)
      await new Promise((r) => setTimeout(r, 1100));

      // Second request — should hit cache
      const res2 = await app.request(`/v1/drafts/${draftId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res2.status).toBe(200);
      const data2: ApiResponse = await res2.json();
      expect(data2.data.cached).toBe(true);
      expect(data2.data.output).toBe('Cached output for V2 test');
      expect(data2.data.model_used).toBe('claude-haiku-4-5-20251001');

      // generateLeafOutput should only have been called once
      expect(mockGenerateLeafOutput).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================
  // 5. Preview stale detection
  // ============================================================

  describe('POST /v1/drafts/:id/preview — stale detection', () => {
    it('regenerates after draft content changes', async () => {
      const draftId = await createDraftWithSentences('Preview Stale Test');

      mockIsGenerationConfigured.mockReturnValue(true);
      mockGenerateLeafOutput.mockClear();
      mockGenerateLeafOutput
        .mockResolvedValueOnce({
          output: 'First preview output',
          model: 'claude-haiku-4-5-20251001',
        })
        .mockResolvedValueOnce({
          output: 'Second preview output after update',
          model: 'claude-haiku-4-5-20251001',
        });

      // First preview
      const res1 = await app.request(`/v1/drafts/${draftId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res1.status).toBe(200);
      const data1: ApiResponse = await res1.json();
      expect(data1.data.cached).toBe(false);
      expect(data1.data.output).toBe('First preview output');

      // Update the draft sentences (content changes → cache should invalidate)
      await app.request(`/v1/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sentences: [
            {
              id: 'ds_v2_01',
              text: 'The product costs $149',
              origin: { type: 'manual' },
              position: 0,
              included: true,
            },
            {
              id: 'ds_v2_02',
              text: 'Free trial available for 14 days',
              origin: { type: 'manual' },
              position: 1,
              included: true,
            },
            {
              id: 'ds_v2_03',
              text: 'Enterprise plan available',
              origin: { type: 'manual' },
              position: 2,
              included: true,
            },
          ],
          if_revision: 2,
        }),
      });

      // Wait past debounce
      await new Promise((r) => setTimeout(r, 1100));

      // Second preview — content changed so cache should miss
      const res2 = await app.request(`/v1/drafts/${draftId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res2.status).toBe(200);
      const data2: ApiResponse = await res2.json();
      expect(data2.data.cached).toBe(false);
      expect(data2.data.output).toBe('Second preview output after update');

      // generateLeafOutput should have been called twice (cache miss after update)
      expect(mockGenerateLeafOutput).toHaveBeenCalledTimes(2);
    });
  });
});
