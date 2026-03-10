/**
 * Leaf History Route Tests
 *
 * Integration tests for Leaf History API endpoints.
 */

import { createLeafHistory, insertProject } from '@t3x-dev/storage';
import type { PGLiteDB } from '@t3x-dev/storage/pglite';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiResponse = any;

// Mock the database module before importing routes
let mockDB: PGLiteDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// Import routes after mocking
import { leavesRoutes } from '../routes/leaves.openapi';

describe('Leaf History Routes', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let testCommitHash: string;
  let testLeafId: string;
  const app = new Hono();
  app.route('/', leavesRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    // Create a test project
    const project = await insertProject(mockDB, testData.project({ name: 'History Test Project' }));
    testProjectId = project.projectId;

    testCommitHash = 'sha256:test_commit_for_history';
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    // Create a new leaf for each test
    const res = await app.request('/v1/leaves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commit_hash: testCommitHash,
        type: 'tweet',
        title: 'Test Leaf for History',
        config: { model: 'claude-3-5-sonnet-20241022' },
        project_id: testProjectId,
      }),
    });
    const data: ApiResponse = await res.json();
    testLeafId = data.data.id;
  });

  describe('GET /v1/leaves/:id/history', () => {
    it('returns empty array when no history exists', async () => {
      const res = await app.request(`/v1/leaves/${testLeafId}/history`);
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toEqual([]);
    });

    it('returns history entries ordered by most recent first', async () => {
      // Create history entries
      await createLeafHistory(mockDB, {
        leaf_id: testLeafId,
        output: 'First output',
        config: { model: 'claude-3-5-sonnet-20241022' },
        model: 'claude-3-5-sonnet-20241022',
      });

      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      await createLeafHistory(mockDB, {
        leaf_id: testLeafId,
        output: 'Second output',
        config: { model: 'claude-3-5-sonnet-20241022' },
        model: 'claude-3-5-sonnet-20241022',
      });

      const res = await app.request(`/v1/leaves/${testLeafId}/history`);
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.length).toBe(2);
      // Most recent first
      expect(data.data[0].output).toBe('Second output');
      expect(data.data[1].output).toBe('First output');
    });

    it('returns history with correct fields', async () => {
      await createLeafHistory(mockDB, {
        leaf_id: testLeafId,
        output: 'Test output content',
        config: { model: 'claude-3', max_tokens: 500 },
        model: 'claude-3-5-sonnet-20241022',
        created_by: 'test-user',
      });

      const res = await app.request(`/v1/leaves/${testLeafId}/history`);
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.data[0].id).toMatch(/^lhist_/);
      expect(data.data[0].leaf_id).toBe(testLeafId);
      expect(data.data[0].output).toBe('Test output content');
      expect(data.data[0].config).toEqual({ model: 'claude-3', max_tokens: 500 });
      expect(data.data[0].model).toBe('claude-3-5-sonnet-20241022');
      expect(data.data[0].generated_at).toBeDefined();
      expect(data.data[0].created_by).toBe('test-user');
    });

    it('respects pagination limit', async () => {
      // Create 5 history entries
      for (let i = 0; i < 5; i++) {
        await createLeafHistory(mockDB, {
          leaf_id: testLeafId,
          output: `Output ${i}`,
          config: {},
          model: 'claude-3-5-sonnet-20241022',
        });
      }

      const res = await app.request(`/v1/leaves/${testLeafId}/history?limit=3`);
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.data.length).toBe(3);
    });

    it('respects pagination offset', async () => {
      // Create 5 history entries
      for (let i = 0; i < 5; i++) {
        await createLeafHistory(mockDB, {
          leaf_id: testLeafId,
          output: `Output ${i}`,
          config: {},
          model: 'claude-3-5-sonnet-20241022',
        });
        await new Promise((resolve) => setTimeout(resolve, 5)); // Small delay for ordering
      }

      const res = await app.request(`/v1/leaves/${testLeafId}/history?limit=2&offset=2`);
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.data.length).toBe(2);
      // Should get items 2 and 3 (0-indexed from newest: 4, 3, 2, 1, 0)
    });

    it('returns 404 for non-existent leaf', async () => {
      const res = await app.request('/v1/leaves/leaf_nonexistent/history');
      expect(res.status).toBe(404);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('LEAF_NOT_FOUND');
    });
  });

  describe('POST /v1/leaves/:id/restore', () => {
    let historyId: string;

    beforeEach(async () => {
      // Create a history entry to restore from
      const history = await createLeafHistory(mockDB, {
        leaf_id: testLeafId,
        output: 'Historical output to restore',
        config: { model: 'claude-3' },
        model: 'claude-3-5-sonnet-20241022',
      });
      historyId = history.id;
    });

    it('restores output from history entry', async () => {
      const res = await app.request(`/v1/leaves/${testLeafId}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history_id: historyId,
        }),
      });

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.output).toBe('Historical output to restore');
      expect(data.data.generated_at).toBeDefined();
    });

    it('returns 404 for non-existent leaf', async () => {
      const res = await app.request('/v1/leaves/leaf_nonexistent/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history_id: historyId,
        }),
      });

      expect(res.status).toBe(404);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('LEAF_NOT_FOUND');
    });

    it('returns 404 for non-existent history entry', async () => {
      const res = await app.request(`/v1/leaves/${testLeafId}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history_id: 'lhist_nonexistent',
        }),
      });

      expect(res.status).toBe(404);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('HISTORY_NOT_FOUND');
    });

    it('returns 400 when history entry belongs to different leaf', async () => {
      // Create another leaf
      const otherLeafRes = await app.request('/v1/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commit_hash: testCommitHash,
          type: 'weibo',
          project_id: testProjectId,
        }),
      });
      const otherLeafData: ApiResponse = await otherLeafRes.json();
      const otherLeafId = otherLeafData.data.id;

      // Try to restore history from testLeafId to otherLeafId
      const res = await app.request(`/v1/leaves/${otherLeafId}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history_id: historyId, // This belongs to testLeafId
        }),
      });

      expect(res.status).toBe(400);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('HISTORY_MISMATCH');
    });
  });

  describe('DELETE /v1/leaf-history/:id', () => {
    let historyId: string;

    beforeEach(async () => {
      const history = await createLeafHistory(mockDB, {
        leaf_id: testLeafId,
        output: 'History to delete',
        config: {},
        model: 'claude-3-5-sonnet-20241022',
      });
      historyId = history.id;
    });

    it('deletes history entry successfully', async () => {
      const res = await app.request(`/v1/leaf-history/${historyId}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.deleted).toBe(true);
      expect(data.data.id).toBe(historyId);

      // Verify history is deleted
      const historyRes = await app.request(`/v1/leaves/${testLeafId}/history`);
      const historyData: ApiResponse = await historyRes.json();
      expect(historyData.data.find((h: ApiResponse) => h.id === historyId)).toBeUndefined();
    });

    it('returns 404 for non-existent history entry', async () => {
      const res = await app.request('/v1/leaf-history/lhist_nonexistent', {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('HISTORY_NOT_FOUND');
    });
  });
});
