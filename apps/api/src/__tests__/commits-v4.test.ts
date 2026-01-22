/**
 * Commits V4 Route Tests
 *
 * Integration tests for CommitV4 CRUD API endpoints.
 * Tests cover all CRUD operations and error handling.
 */

import { insertProject } from '@t3x/storage';
import type { PGLiteDB } from '@t3x/storage/pglite';
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
import { commitsV4Routes } from '../routes/commits-v4.openapi';

describe('Commits V4 Routes', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  const app = new Hono();
  app.route('/', commitsV4Routes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    // Create a test project
    const project = await insertProject(mockDB, testData.project({ name: 'CommitsV4 Test Project' }));
    testProjectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('POST /v1/commits-v4', () => {
    it('creates a commit with valid input', async () => {
      const res = await app.request('/v1/commits-v4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parents: [],
          author: { type: 'human', id: 'user_123', name: 'Test User' },
          sentences: [
            { id: 's_1', text: 'We want to visit Tokyo in spring.' },
            { id: 's_2', text: 'Budget is around $3000 per person.' },
          ],
          project_id: testProjectId,
          message: 'Initial travel plan',
          branch: 'main',
        }),
      });

      expect(res.status).toBe(201);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.hash).toMatch(/^sha256:/);
      expect(data.data.schema).toBe('t3x/commit/v4');
      expect(data.data.parents).toEqual([]);
      expect(data.data.author).toEqual({ type: 'human', id: 'user_123', name: 'Test User' });
      expect(data.data.committed_at).toBeDefined();
      expect(data.data.content.sentences).toHaveLength(2);
      expect(data.data.project_id).toBe(testProjectId);
      expect(data.data.message).toBe('Initial travel plan');
      expect(data.data.branch).toBe('main');
      expect(data.data.created_at).toBeDefined();
    });

    it('creates a commit with minimal input', async () => {
      const res = await app.request('/v1/commits-v4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: { type: 'agent' },
          sentences: [{ id: 's_1', text: 'Simple sentence.' }],
          project_id: testProjectId,
        }),
      });

      expect(res.status).toBe(201);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.hash).toMatch(/^sha256:/);
      expect(data.data.parents).toEqual([]);
      expect(data.data.message).toBeNull();
      expect(data.data.branch).toBeNull();
      expect(data.data.source_refs).toBeNull();
      expect(data.data.position_x).toBeNull();
      expect(data.data.position_y).toBeNull();
    });

    it('creates a commit with parent reference', async () => {
      // First create a parent commit
      const parentRes = await app.request('/v1/commits-v4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: { type: 'human', name: 'Parent Author' },
          sentences: [{ id: 's_1', text: 'Parent commit sentence.' }],
          project_id: testProjectId,
        }),
      });
      const parentData: ApiResponse = await parentRes.json();
      const parentHash = parentData.data.hash;

      // Create child commit with parent reference
      const res = await app.request('/v1/commits-v4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parents: [parentHash],
          author: { type: 'human', name: 'Child Author' },
          sentences: [{ id: 's_1', text: 'Child commit sentence.' }],
          project_id: testProjectId,
          message: 'Child commit',
        }),
      });

      expect(res.status).toBe(201);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.parents).toEqual([parentHash]);
    });

    it('creates a commit with source_refs', async () => {
      const res = await app.request('/v1/commits-v4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: { type: 'human' },
          sentences: [{ id: 's_1', text: 'Sentence with source.' }],
          project_id: testProjectId,
          source_refs: [
            { type: 'conversation', id: 'conv_123', title: 'Travel Discussion' },
            { type: 'leaf', id: 'leaf_456', assertion_lessons: ['Learned X'] },
          ],
        }),
      });

      expect(res.status).toBe(201);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.source_refs).toHaveLength(2);
      expect(data.data.source_refs[0].type).toBe('conversation');
      expect(data.data.source_refs[1].assertion_lessons).toEqual(['Learned X']);
    });

    it('creates a commit with position', async () => {
      const res = await app.request('/v1/commits-v4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: { type: 'human' },
          sentences: [{ id: 's_1', text: 'Positioned commit.' }],
          project_id: testProjectId,
          position_x: 100,
          position_y: 200,
        }),
      });

      expect(res.status).toBe(201);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.position_x).toBe(100);
      expect(data.data.position_y).toBe(200);
    });

    it('returns 400 for missing required fields', async () => {
      const res = await app.request('/v1/commits-v4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: { type: 'human' },
          // missing sentences and project_id
        }),
      });

      expect(res.status).toBe(400);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
    });

    it('returns 400 for empty sentences', async () => {
      const res = await app.request('/v1/commits-v4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: { type: 'human' },
          sentences: [],
          project_id: testProjectId,
        }),
      });

      expect(res.status).toBe(400);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
    });

    it('returns 400 for non-existent parent commit', async () => {
      const res = await app.request('/v1/commits-v4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parents: ['sha256:nonexistent_parent'],
          author: { type: 'human' },
          sentences: [{ id: 's_1', text: 'Test sentence.' }],
          project_id: testProjectId,
        }),
      });

      expect(res.status).toBe(400);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('PARENT_NOT_FOUND');
      expect(data.error.message).toContain('nonexistent_parent');
    });

    it('returns 404 for non-existent project', async () => {
      const res = await app.request('/v1/commits-v4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: { type: 'human' },
          sentences: [{ id: 's_1', text: 'Test sentence.' }],
          project_id: 'proj_nonexistent',
        }),
      });

      expect(res.status).toBe(404);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('PROJECT_NOT_FOUND');
    });
  });

  describe('GET /v1/commits-v4/:hash', () => {
    let createdCommitHash: string;

    beforeEach(async () => {
      // Create a commit to test with
      const res = await app.request('/v1/commits-v4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: { type: 'human', name: 'Get Test' },
          sentences: [{ id: 's_1', text: 'Test sentence for GET.' }],
          project_id: testProjectId,
          message: 'Test commit for GET',
        }),
      });
      const data: ApiResponse = await res.json();
      createdCommitHash = data.data.hash;
    });

    it('returns commit by hash', async () => {
      const res = await app.request(`/v1/commits-v4/${encodeURIComponent(createdCommitHash)}`);
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.hash).toBe(createdCommitHash);
      expect(data.data.schema).toBe('t3x/commit/v4');
      expect(data.data.content.sentences).toHaveLength(1);
    });

    it('returns 404 for non-existent commit', async () => {
      const res = await app.request('/v1/commits-v4/sha256:nonexistent');
      expect(res.status).toBe(404);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /v1/projects/:projectId/commits-v4', () => {
    let testProjectId2: string;

    beforeAll(async () => {
      // Create a separate project for list tests
      const project = await insertProject(
        mockDB,
        testData.project({ name: 'CommitsV4 List Test Project' })
      );
      testProjectId2 = project.projectId;

      // Create commits for this project
      await app.request('/v1/commits-v4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: { type: 'human' },
          sentences: [{ id: 's_1', text: 'First commit.' }],
          project_id: testProjectId2,
          branch: 'main',
        }),
      });
      await app.request('/v1/commits-v4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: { type: 'human' },
          sentences: [{ id: 's_1', text: 'Second commit.' }],
          project_id: testProjectId2,
          branch: 'main',
        }),
      });
      await app.request('/v1/commits-v4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: { type: 'human' },
          sentences: [{ id: 's_1', text: 'Feature commit.' }],
          project_id: testProjectId2,
          branch: 'feature',
        }),
      });
    });

    it('returns commits by project', async () => {
      const res = await app.request(`/v1/projects/${testProjectId2}/commits-v4`);
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeGreaterThanOrEqual(3);
    });

    it('filters by branch', async () => {
      const res = await app.request(`/v1/projects/${testProjectId2}/commits-v4?branch=feature`);
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.length).toBe(1);
      expect(data.data[0].branch).toBe('feature');
    });

    it('respects pagination', async () => {
      const res = await app.request(`/v1/projects/${testProjectId2}/commits-v4?limit=1&offset=0`);
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.length).toBe(1);
    });

    it('returns empty array for project with no commits', async () => {
      const emptyProject = await insertProject(
        mockDB,
        testData.project({ name: 'Empty Project' })
      );

      const res = await app.request(`/v1/projects/${emptyProject.projectId}/commits-v4`);
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toEqual([]);
    });
  });

  describe('PATCH /v1/commits-v4/:hash/position', () => {
    let createdCommitHash: string;

    beforeEach(async () => {
      const res = await app.request('/v1/commits-v4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: { type: 'human' },
          sentences: [{ id: 's_1', text: 'Position test commit.' }],
          project_id: testProjectId,
          position_x: 0,
          position_y: 0,
        }),
      });
      const data: ApiResponse = await res.json();
      createdCommitHash = data.data.hash;
    });

    it('updates commit position', async () => {
      const res = await app.request(
        `/v1/commits-v4/${encodeURIComponent(createdCommitHash)}/position`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            position_x: 150,
            position_y: 250,
          }),
        }
      );

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.position_x).toBe(150);
      expect(data.data.position_y).toBe(250);
      expect(data.data.hash).toBe(createdCommitHash);
    });

    it('returns 404 for non-existent commit', async () => {
      const res = await app.request('/v1/commits-v4/sha256:nonexistent/position', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          position_x: 100,
          position_y: 200,
        }),
      });

      expect(res.status).toBe(404);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('NOT_FOUND');
    });

    it('returns 400 for missing position fields', async () => {
      const res = await app.request(
        `/v1/commits-v4/${encodeURIComponent(createdCommitHash)}/position`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            position_x: 100,
            // missing position_y
          }),
        }
      );

      expect(res.status).toBe(400);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
    });
  });

  describe('DELETE /v1/commits-v4/:hash', () => {
    let createdCommitHash: string;

    beforeEach(async () => {
      const res = await app.request('/v1/commits-v4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: { type: 'human' },
          sentences: [{ id: 's_1', text: 'Delete test commit.' }],
          project_id: testProjectId,
        }),
      });
      const data: ApiResponse = await res.json();
      createdCommitHash = data.data.hash;
    });

    it('deletes commit successfully', async () => {
      const res = await app.request(
        `/v1/commits-v4/${encodeURIComponent(createdCommitHash)}`,
        {
          method: 'DELETE',
        }
      );

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.deleted).toBe(true);
      expect(data.data.hash).toBe(createdCommitHash);

      // Verify commit is deleted
      const getRes = await app.request(
        `/v1/commits-v4/${encodeURIComponent(createdCommitHash)}`
      );
      expect(getRes.status).toBe(404);
    });

    it('returns 404 for non-existent commit', async () => {
      const res = await app.request('/v1/commits-v4/sha256:nonexistent', {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('NOT_FOUND');
    });
  });
});
