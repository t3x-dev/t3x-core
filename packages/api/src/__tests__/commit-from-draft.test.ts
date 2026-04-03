/**
 * Commit-from-Draft Route Tests
 *
 * Integration tests for POST /v1/commit endpoint.
 */

import type { AnyDB } from '@t3x-dev/storage';
import { insertDraft, insertProject, updateDraft } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

// biome-ignore lint/suspicious/noExplicitAny: test helper
type ApiResponse = any;

// Mock the database module before importing routes
let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// Mock the webhook dispatcher
const mockDispatch = vi.fn();
vi.mock('../lib/webhook-dispatcher', () => ({
  webhookDispatcher: {
    dispatch: (...args: unknown[]) => mockDispatch(...args),
  },
}));

// Import routes after mocking
import { commitFromDraftRoutes } from '../routes/commit-from-draft.openapi';

describe('Commit-from-Draft Routes', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  const app = new Hono();
  app.route('/', commitFromDraftRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    // Create test project
    const project = await insertProject(
      mockDB,
      testData.project({ name: 'Commit-from-Draft Test Project' })
    );
    testProjectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(() => {
    mockDispatch.mockClear();
  });

  /** Helper: create a draft with tree nodes ready for commit */
  async function createDraftWithTrees(
    projectId: string,
    trees: Array<{ key: string; slots: Record<string, unknown>; children?: unknown[]; confidence?: number }>
  ): Promise<string> {
    const draft = await insertDraft(mockDB, {
      project_id: projectId,
      title: 'Test draft for commit',
    });
    await updateDraft(mockDB, draft.id, { nodes: trees }, draft.revision);
    return draft.id;
  }

  describe('POST /v1/commit', () => {
    it('creates commit from draft (happy path)', async () => {
      const draftId = await createDraftWithTrees(testProjectId, [
        { key: 's_001', slots: { text: 'The deadline is next Friday.' }, children: [], confidence: 1.0 },
        { key: 's_002', slots: { text: 'Budget is $50k.' }, children: [], confidence: 0.95 },
      ]);

      const res = await app.request('/v1/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          draft_id: draftId,
          message: 'First commit from API',
        }),
      });

      expect(res.status).toBe(201);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.commit_hash).toBeTruthy();
      expect(data.data.commit_hash).toMatch(/^sha256:/);
      expect(data.data.tree_count).toBe(2);
      expect(data.data.branch).toBe('main');
    });

    it('returns 404 for non-existent draft', async () => {
      const res = await app.request('/v1/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          draft_id: 'draft_nonexistent',
        }),
      });

      expect(res.status).toBe(404);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
    });

    it('fires commit.created webhook', async () => {
      const draftId = await createDraftWithTrees(testProjectId, [
        { key: 's_010', slots: { text: 'Webhook test node.' }, children: [], confidence: 1.0 },
      ]);

      const res = await app.request('/v1/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          draft_id: draftId,
        }),
      });

      expect(res.status).toBe(201);

      expect(mockDispatch).toHaveBeenCalledWith(
        'commit.created',
        expect.objectContaining({
          project_id: testProjectId,
          commit_hash: expect.any(String),
          tree_count: 1,
          branch: 'main',
        }),
        testProjectId
      );
    });

    it('uses specified branch (defaults to main)', async () => {
      const draftId = await createDraftWithTrees(testProjectId, [
        { key: 's_020', slots: { text: 'Feature branch node.' }, children: [], confidence: 1.0 },
      ]);

      const res = await app.request('/v1/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          draft_id: draftId,
          branch: 'feature/test',
        }),
      });

      expect(res.status).toBe(201);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.branch).toBe('feature/test');
    });

    it('returns 404 when draft belongs to different project', async () => {
      // Create draft in a different project
      const otherProject = await insertProject(mockDB, testData.project({ name: 'Other Project' }));
      const draftId = await createDraftWithTrees(otherProject.projectId, [
        { key: 's_030', slots: { text: 'Wrong project node.' }, children: [], confidence: 1.0 },
      ]);

      const res = await app.request('/v1/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          draft_id: draftId,
        }),
      });

      expect(res.status).toBe(404);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
    });

    it('returns 400 for draft with no trees', async () => {
      const draft = await insertDraft(mockDB, {
        project_id: testProjectId,
        title: 'Empty draft',
      });

      const res = await app.request('/v1/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          draft_id: draft.id,
        }),
      });

      expect(res.status).toBe(400);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
    });

    it('marks draft as committed after successful commit', async () => {
      const { findDraftById } = await import('@t3x-dev/storage');

      const draftId = await createDraftWithTrees(testProjectId, [
        { key: 's_040', slots: { text: 'Check status node.' }, children: [], confidence: 1.0 },
      ]);

      await app.request('/v1/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          draft_id: draftId,
        }),
      });

      const updatedDraft = await findDraftById(mockDB, draftId);
      expect(updatedDraft?.status).toBe('committed');
      expect(updatedDraft?.committed_as).toBeTruthy();
    });
  });
});
