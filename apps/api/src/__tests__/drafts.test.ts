/**
 * Drafts Route Tests
 *
 * Integration tests for Draft CRUD + preview + commit + fork endpoints.
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

// Import routes after mocking
import { draftsRoutes } from '../routes/drafts.openapi';

describe('Drafts Routes', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  const app = new Hono();
  app.route('/', draftsRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    const project = await insertProject(mockDB, testData.project({ name: 'Drafts Test' }));
    testProjectId = project.projectId;

    // Reset generation mocks
    mockGenerateLeafOutput.mockReset();
    mockIsGenerationConfigured.mockReset();
  });

  afterAll(async () => {
    await cleanup();
  });

  // ============================================================
  // CRUD Tests
  // ============================================================

  describe('POST /v1/drafts', () => {
    it('creates a draft with required fields', async () => {
      const res = await app.request('/v1/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          title: 'My Draft',
        }),
      });

      expect(res.status).toBe(201);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.id).toMatch(/^draft_/);
      expect(data.data.project_id).toBe(testProjectId);
      expect(data.data.title).toBe('My Draft');
      expect(data.data.status).toBe('editing');
      expect(data.data.revision).toBe(1);
      expect(data.data.sentences).toEqual([]);
      expect(data.data.constraints).toEqual([]);
      expect(data.data.target_branch).toBe('main');
    });

    it('creates a draft with all fields', async () => {
      const res = await app.request('/v1/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          title: 'Full Draft',
          goal: 'Extract pricing info',
          parent_commit_hash: 'sha256:abc123',
          target_branch: 'feature',
          preview_type: 'tweet',
        }),
      });

      expect(res.status).toBe(201);
      const data: ApiResponse = await res.json();
      expect(data.data.goal).toBe('Extract pricing info');
      expect(data.data.parent_commit_hash).toBe('sha256:abc123');
      expect(data.data.target_branch).toBe('feature');
      expect(data.data.preview_type).toBe('tweet');
    });

    it('rejects missing title', async () => {
      const res = await app.request('/v1/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /v1/drafts', () => {
    it('lists drafts by project_id', async () => {
      // Create some drafts
      for (let i = 0; i < 3; i++) {
        await app.request('/v1/drafts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: testProjectId,
            title: `List Draft ${i}`,
          }),
        });
      }

      const res = await app.request(`/v1/drafts?project_id=${testProjectId}`);
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.length).toBeGreaterThanOrEqual(3);
    });

    it('rejects missing project_id', async () => {
      const res = await app.request('/v1/drafts');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /v1/drafts/:id', () => {
    it('returns a draft by ID', async () => {
      const createRes = await app.request('/v1/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          title: 'Get Test',
        }),
      });
      const created: ApiResponse = await createRes.json();
      const draftId = created.data.id;

      const res = await app.request(`/v1/drafts/${draftId}`);
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.data.id).toBe(draftId);
      expect(data.data.title).toBe('Get Test');
    });

    it('returns 404 for non-existent draft', async () => {
      const res = await app.request('/v1/drafts/draft_nonexistent');
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /v1/drafts/:id', () => {
    it('updates draft with correct revision', async () => {
      const createRes = await app.request('/v1/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          title: 'Update Test',
        }),
      });
      const created: ApiResponse = await createRes.json();
      const draftId = created.data.id;

      const res = await app.request(`/v1/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Updated Title',
          sentences: [
            {
              id: 'ds_test01',
              text: 'Hello world',
              origin: { type: 'manual' },
              position: 0,
              included: true,
            },
          ],
          if_revision: 1,
        }),
      });

      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.data.title).toBe('Updated Title');
      expect(data.data.sentences).toHaveLength(1);
      expect(data.data.revision).toBe(2);
    });

    it('returns 409 on revision conflict', async () => {
      const createRes = await app.request('/v1/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          title: 'Conflict Test',
        }),
      });
      const created: ApiResponse = await createRes.json();
      const draftId = created.data.id;

      // First update
      await app.request(`/v1/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'V2',
          if_revision: 1,
        }),
      });

      // Stale revision
      const res = await app.request(`/v1/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Should Fail',
          if_revision: 1,
        }),
      });

      expect(res.status).toBe(409);
    });

    it('rejects missing if_revision', async () => {
      const createRes = await app.request('/v1/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          title: 'Missing Rev',
        }),
      });
      const created: ApiResponse = await createRes.json();

      const res = await app.request(`/v1/drafts/${created.data.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'No Rev' }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /v1/drafts/:id', () => {
    it('deletes a draft', async () => {
      const createRes = await app.request('/v1/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          title: 'Delete Me',
        }),
      });
      const created: ApiResponse = await createRes.json();
      const draftId = created.data.id;

      const res = await app.request(`/v1/drafts/${draftId}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.data.deleted).toBe(true);
      expect(data.data.id).toBe(draftId);

      // Verify deleted
      const getRes = await app.request(`/v1/drafts/${draftId}`);
      expect(getRes.status).toBe(404);
    });

    it('returns 404 for non-existent draft', async () => {
      const res = await app.request('/v1/drafts/draft_nonexistent', {
        method: 'DELETE',
      });
      expect(res.status).toBe(404);
    });
  });

  // ============================================================
  // Helper: create a draft with sentences (for preview/commit tests)
  // ============================================================

  async function createDraftWithSentences(title: string) {
    const createRes = await app.request('/v1/drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: testProjectId,
        title,
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
            id: 'ds_test01',
            text: 'The product costs $99',
            origin: { type: 'manual' },
            position: 0,
            included: true,
          },
          {
            id: 'ds_test02',
            text: 'Free trial available',
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
  // Preview Tests
  // ============================================================

  describe('POST /v1/drafts/:id/preview', () => {
    it('returns 404 for non-existent draft', async () => {
      const res = await app.request('/v1/drafts/draft_nonexistent/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(404);
    });

    it('returns 400 if draft has no included sentences', async () => {
      // Create an empty draft (no sentences)
      const createRes = await app.request('/v1/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          title: 'Empty Preview Draft',
        }),
      });
      const created: ApiResponse = await createRes.json();

      mockIsGenerationConfigured.mockReturnValue(true);

      const res = await app.request(`/v1/drafts/${created.data.id}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const data: ApiResponse = await res.json();
      expect(data.error.message).toContain('no included sentences');
    });

    it('returns 400 if generation not configured', async () => {
      const draftId = await createDraftWithSentences('Preview Not Configured');

      mockIsGenerationConfigured.mockReturnValue(false);

      const res = await app.request(`/v1/drafts/${draftId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const data: ApiResponse = await res.json();
      expect(data.error.code).toBe('GENERATION_NOT_CONFIGURED');
    });

    it('generates preview successfully', async () => {
      const draftId = await createDraftWithSentences('Preview Success');

      mockIsGenerationConfigured.mockReturnValue(true);
      mockGenerateLeafOutput.mockResolvedValue({
        output: 'Generated tweet: The product costs $99 with free trial.',
        model: 'claude-haiku-4-5-20251001',
      });

      const res = await app.request(`/v1/drafts/${draftId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.output).toContain('Generated tweet');
      expect(data.data.model_used).toBe('claude-haiku-4-5-20251001');
      expect(data.data.token_count).toBeGreaterThan(0);
      expect(data.data.cached).toBe(false);
    });

    it('returns cached preview on identical content', async () => {
      const draftId = await createDraftWithSentences('Preview Cache');

      mockIsGenerationConfigured.mockReturnValue(true);
      mockGenerateLeafOutput.mockResolvedValue({
        output: 'Cached output text',
        model: 'claude-haiku-4-5-20251001',
      });

      // Reset call count before this test
      mockGenerateLeafOutput.mockClear();

      // First request — generates
      await app.request(`/v1/drafts/${draftId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      // Wait past debounce window
      await new Promise((r) => setTimeout(r, 1100));

      // Second request — should hit cache
      const res = await app.request(`/v1/drafts/${draftId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.data.cached).toBe(true);
      expect(data.data.output).toBe('Cached output text');
      // generateLeafOutput should have been called only once (second call used cache)
      expect(mockGenerateLeafOutput).toHaveBeenCalledTimes(1);
    });

    it('returns 400 if draft is committed', async () => {
      const draftId = await createDraftWithSentences('Preview Committed');

      // Mark as committed directly via storage
      const { commitDraft } = await import('@t3x-dev/storage');
      await commitDraft(mockDB, draftId, 'sha256:previewtest');

      mockIsGenerationConfigured.mockReturnValue(true);

      const res = await app.request(`/v1/drafts/${draftId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const data: ApiResponse = await res.json();
      expect(data.error.message).toContain('committed');
    });
  });

  // ============================================================
  // Commit Tests
  // ============================================================

  describe('POST /v1/drafts/:id/commit', () => {
    it('returns 404 for non-existent draft', async () => {
      const res = await app.request('/v1/drafts/draft_nonexistent/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(404);
    });

    it('returns 400 if draft has no included sentences', async () => {
      const createRes = await app.request('/v1/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          title: 'Empty Commit Draft',
        }),
      });
      const created: ApiResponse = await createRes.json();

      const res = await app.request(`/v1/drafts/${created.data.id}/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const data: ApiResponse = await res.json();
      expect(data.error.message).toContain('no included sentences');
    });

    it('commits a draft without constraints (no leaf created)', async () => {
      const draftId = await createDraftWithSentences('Commit No Leaf');

      const res = await app.request(`/v1/drafts/${draftId}/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'My first commit' }),
      });

      expect(res.status).toBe(201);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.commit).toBeDefined();
      expect(data.data.commit.hash).toMatch(/^sha256:/);
      expect(data.data.commit.content.frames).toHaveLength(2);
      expect(data.data.commit.content.frames[0].type).toBe('legacy_sentence');
      expect(data.data.commit.content.frames[0].slots.text).toBeDefined();
      expect(data.data.commit.message).toBe('My first commit');
      expect(data.data.leaf).toBeNull();
      expect(data.data.draft_status).toBe('committed');

      // Verify draft is now committed in DB
      const getRes = await app.request(`/v1/drafts/${draftId}`);
      const getDraft: ApiResponse = await getRes.json();
      expect(getDraft.data.status).toBe('committed');
      expect(getDraft.data.committed_as).toBe(data.data.commit.hash);
    });

    it('commits a draft with constraints (creates leaf)', async () => {
      // Create draft with sentences + constraints
      const createRes = await app.request('/v1/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          title: 'Commit With Leaf',
          preview_type: 'tweet',
        }),
      });
      const created: ApiResponse = await createRes.json();
      const draftId = created.data.id;

      // PATCH: add sentences + constraints
      await app.request(`/v1/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sentences: [
            {
              id: 'ds_leaf01',
              text: 'Important fact',
              origin: { type: 'manual' },
              position: 0,
              included: true,
            },
          ],
          constraints: [
            {
              id: 'dc_req01',
              type: 'require',
              match_mode: 'exact',
              value: 'Important',
            },
          ],
          if_revision: 1,
        }),
      });

      const res = await app.request(`/v1/drafts/${draftId}/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(201);
      const data: ApiResponse = await res.json();
      expect(data.data.commit).toBeDefined();
      expect(data.data.leaf).toBeDefined();
      expect(data.data.leaf.id).toMatch(/^leaf_/);
      expect(data.data.leaf.type).toBe('tweet');
      expect(data.data.leaf.constraints).toHaveLength(1);
      expect(data.data.leaf.constraints[0].id).toMatch(/^cst_/);
      expect(data.data.leaf.commit_hash).toBe(data.data.commit.hash);
      expect(data.data.draft_status).toBe('committed');

      // Verify draft has committed_leaf_id
      const getRes = await app.request(`/v1/drafts/${draftId}`);
      const getDraft: ApiResponse = await getRes.json();
      expect(getDraft.data.committed_leaf_id).toBe(data.data.leaf.id);
    });

    it('returns 400 if draft is already committed', async () => {
      const draftId = await createDraftWithSentences('Already Committed');

      // Commit via storage directly
      const { commitDraft } = await import('@t3x-dev/storage');
      await commitDraft(mockDB, draftId, 'sha256:alreadycommitted');

      const res = await app.request(`/v1/drafts/${draftId}/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const data: ApiResponse = await res.json();
      expect(data.error.message).toContain('committed');
    });
  });

  // ============================================================
  // Fork Tests
  // ============================================================

  describe('POST /v1/drafts/:id/fork', () => {
    it('forks a committed draft', async () => {
      // Create and commit a draft
      const createRes = await app.request('/v1/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          title: 'Fork Source',
        }),
      });
      const created: ApiResponse = await createRes.json();
      const draftId = created.data.id;

      // Add sentences and commit (we need to manually commit via storage since commit
      // endpoint requires actual commits; instead we use the fork validation path)
      // We'll use the PATCH + storage layer to mark as committed
      const { commitDraft } = await import('@t3x-dev/storage');
      await commitDraft(mockDB, draftId, 'sha256:forktest');

      // Fork
      const res = await app.request(`/v1/drafts/${draftId}/fork`, {
        method: 'POST',
      });

      expect(res.status).toBe(201);
      const data: ApiResponse = await res.json();
      expect(data.data.id).not.toBe(draftId);
      expect(data.data.forked_from).toBe(draftId);
      expect(data.data.status).toBe('editing');
      expect(data.data.parent_commit_hash).toBe('sha256:forktest');
    });

    it('returns error for non-committed draft', async () => {
      const createRes = await app.request('/v1/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          title: 'Not Committed',
        }),
      });
      const created: ApiResponse = await createRes.json();

      const res = await app.request(`/v1/drafts/${created.data.id}/fork`, {
        method: 'POST',
      });

      expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent draft', async () => {
      const res = await app.request('/v1/drafts/draft_nonexistent/fork', {
        method: 'POST',
      });

      expect(res.status).toBe(404);
    });
  });
});
