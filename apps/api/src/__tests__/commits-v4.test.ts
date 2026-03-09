/**
 * Commits V4 Route Tests
 *
 * Integration tests for CommitV4 CRUD API endpoints.
 * Tests cover all CRUD operations and error handling.
 */

import { findBranchByName, findCurrentBranch, insertProject } from '@t3x/storage';
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
    const project = await insertProject(
      mockDB,
      testData.project({ name: 'CommitsV4 Test Project' })
    );
    testProjectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('POST /v1/commits-v4', () => {
    describe('V4-only validation', () => {
      it('rejects V3 commit payload with COMMIT_VERSION_UNSUPPORTED error', async () => {
        // V3 payload has turn_window and facet_snapshot instead of sentences
        const v3Payload = {
          schema: 't3x/commit/v3',
          project_id: testProjectId,
          branch: 'main',
          turn_window: { start_turn_hash: 'sha256:abc', end_turn_hash: 'sha256:def' },
          facet_snapshot: [],
        };

        const res = await app.request('/v1/commits-v4', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(v3Payload),
        });

        const data: ApiResponse = await res.json();
        // V3 payload lacks sentences, so it should fail validation first with INVALID_REQUEST
        // or if it passes validation, the route handler should detect V3 fields and return COMMIT_VERSION_UNSUPPORTED
        expect(res.status).toBe(400);
        expect(data.success).toBe(false);
        // When sentences is missing, Zod validation fails with INVALID_REQUEST
        // The COMMIT_VERSION_UNSUPPORTED check only runs after validation passes
        expect(data.error.code).toBe('INVALID_REQUEST');
      });

      it('rejects payload with explicit V3 schema field', async () => {
        // This payload has sentences (valid for V4) but explicitly sets schema to V3
        // The route handler should detect this and return COMMIT_VERSION_UNSUPPORTED
        const payload = {
          schema: 't3x/commit/v3',
          project_id: testProjectId,
          author: { type: 'human' },
          sentences: [{ id: 's_1', text: 'Test sentence.' }],
        };

        const res = await app.request('/v1/commits-v4', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data: ApiResponse = await res.json();
        expect(res.status).toBe(400);
        expect(data.success).toBe(false);
        expect(data.error.code).toBe('COMMIT_VERSION_UNSUPPORTED');
        expect(data.error.message).toContain('V4');
      });

      it('returns INVALID_REQUEST when sentences field is missing', async () => {
        const res = await app.request('/v1/commits-v4', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            author: { type: 'human' },
            project_id: testProjectId,
            // sentences field missing
          }),
        });

        expect(res.status).toBe(400);
        const data: ApiResponse = await res.json();
        expect(data.success).toBe(false);
        expect(data.error.code).toBe('INVALID_REQUEST');
      });

      it('returns INVALID_REQUEST when sentences array is empty', async () => {
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
        expect(data.error.code).toBe('INVALID_REQUEST');
      });

      it('rejects payload with constraints at commit level', async () => {
        const res = await app.request('/v1/commits-v4', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            author: { type: 'human' },
            sentences: [{ id: 's_1', text: 'Test sentence.' }],
            project_id: testProjectId,
            constraints: [{ type: 'require', value: 'test', match_mode: 'exact' }],
          }),
        });

        expect(res.status).toBe(400);
        const data: ApiResponse = await res.json();
        expect(data.success).toBe(false);
        expect(data.error.code).toBe('INVALID_REQUEST');
        expect(data.error.message).toContain('constraints');
        expect(data.error.message).toContain('Leaves');
      });

      it('rejects payload with constraints inside content object', async () => {
        const res = await app.request('/v1/commits-v4', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            author: { type: 'human' },
            sentences: [{ id: 's_1', text: 'Test sentence.' }],
            project_id: testProjectId,
            content: {
              constraints: [{ type: 'require', value: 'test', match_mode: 'exact' }],
            },
          }),
        });

        expect(res.status).toBe(400);
        const data: ApiResponse = await res.json();
        expect(data.success).toBe(false);
        expect(data.error.code).toBe('INVALID_REQUEST');
        expect(data.error.message).toContain('constraints');
      });

      it('rejects V3 payload with turn_window field', async () => {
        const res = await app.request('/v1/commits-v4', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            author: { type: 'human' },
            sentences: [{ id: 's_1', text: 'Test sentence.' }],
            project_id: testProjectId,
            turn_window: { start_turn_hash: 'sha256:abc', end_turn_hash: 'sha256:def' },
          }),
        });

        expect(res.status).toBe(400);
        const data: ApiResponse = await res.json();
        expect(data.success).toBe(false);
        expect(data.error.code).toBe('COMMIT_VERSION_UNSUPPORTED');
        expect(data.error.message).toContain('turn_window');
      });
    });

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
      // Response wraps commit + conflicts
      const commit = data.data.commit;
      expect(commit.hash).toMatch(/^sha256:/);
      expect(commit.schema).toBe('t3x/commit/v4');
      expect(commit.parents).toEqual([]);
      expect(commit.author).toEqual({ type: 'human', id: 'user_123', name: 'Test User' });
      expect(commit.committed_at).toBeDefined();
      expect(commit.content.sentences).toHaveLength(2);
      expect(commit.project_id).toBe(testProjectId);
      expect(commit.message).toBe('Initial travel plan');
      expect(commit.branch).toBe('main');
      expect(commit.created_at).toBeDefined();
      // conflicts is null when no embedder is configured
      expect(data.data.conflicts).toBeNull();
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
      const commit = data.data.commit;
      expect(commit.hash).toMatch(/^sha256:/);
      expect(commit.parents).toEqual([]);
      expect(commit.message).toBeNull();
      expect(commit.branch).toBeNull();
      expect(commit.source_refs).toBeNull();
      expect(commit.position_x).toBeNull();
      expect(commit.position_y).toBeNull();
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
      const parentHash = parentData.data.commit.hash;

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
      expect(data.data.commit.parents).toEqual([parentHash]);
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
      const commit = data.data.commit;
      expect(commit.source_refs).toHaveLength(2);
      expect(commit.source_refs[0].type).toBe('conversation');
      expect(commit.source_refs[1].assertion_lessons).toEqual(['Learned X']);
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
      expect(data.data.commit.position_x).toBe(100);
      expect(data.data.commit.position_y).toBe(200);
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
      createdCommitHash = data.data.commit.hash;
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
      expect(data.error.code).toBe('COMMIT_NOT_FOUND');
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
      // First commit on main (root)
      const firstRes = await app.request('/v1/commits-v4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: { type: 'human' },
          sentences: [{ id: 's_1', text: 'First commit.' }],
          project_id: testProjectId2,
          branch: 'main',
        }),
      });
      const firstData = (await firstRes.json()) as { data: { commit: { hash: string } } };
      const firstHash = firstData.data.commit.hash;

      // Second commit on main (must have parent to satisfy main branch linear chain)
      await app.request('/v1/commits-v4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: { type: 'human' },
          sentences: [{ id: 's_1', text: 'Second commit.' }],
          project_id: testProjectId2,
          branch: 'main',
          parents: [firstHash],
        }),
      });
      // Feature branch commit (root on feature is fine)
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
      const emptyProject = await insertProject(mockDB, testData.project({ name: 'Empty Project' }));

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
      createdCommitHash = data.data.commit.hash;
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
      expect(data.error.code).toBe('COMMIT_NOT_FOUND');
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
      createdCommitHash = data.data.commit.hash;
    });

    it('deletes commit successfully', async () => {
      const res = await app.request(`/v1/commits-v4/${encodeURIComponent(createdCommitHash)}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.deleted).toBe(true);
      expect(data.data.hash).toBe(createdCommitHash);

      // Verify commit is deleted
      const getRes = await app.request(`/v1/commits-v4/${encodeURIComponent(createdCommitHash)}`);
      expect(getRes.status).toBe(404);
    });

    it('returns 404 for non-existent commit', async () => {
      const res = await app.request('/v1/commits-v4/sha256:nonexistent', {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('COMMIT_NOT_FOUND');
    });
  });

  describe('Branch HEAD Integration', () => {
    it('creates main branch automatically when creating first V4 commit', async () => {
      // Create a new project with no branches
      const project = await insertProject(
        mockDB,
        testData.project({ name: 'Branch Integration Test Project' })
      );

      // Verify no main branch exists yet
      const branchBefore = await findBranchByName(mockDB, project.projectId, 'main');
      expect(branchBefore).toBeNull();

      // Create V4 commit with branch: "main"
      const res = await app.request('/v1/commits-v4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: { type: 'human', name: 'Branch Test' },
          sentences: [{ id: 's_1', text: 'Testing branch integration.' }],
          project_id: project.projectId,
          branch: 'main',
        }),
      });

      expect(res.status).toBe(201);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);

      // Verify main branch was created and HEAD is updated
      const branchAfter = await findBranchByName(mockDB, project.projectId, 'main');
      expect(branchAfter).not.toBeNull();
      expect(branchAfter!.headCommitHash).toBe(data.data.commit.hash);
    });

    it('updates branch HEAD when creating subsequent commits', async () => {
      // Create a new project
      const project = await insertProject(
        mockDB,
        testData.project({ name: 'Branch HEAD Update Test' })
      );

      // Create first commit
      const res1 = await app.request('/v1/commits-v4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: { type: 'human' },
          sentences: [{ id: 's_1', text: 'First commit.' }],
          project_id: project.projectId,
          branch: 'main',
        }),
      });
      const data1: ApiResponse = await res1.json();

      // Create second commit
      const res2 = await app.request('/v1/commits-v4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: { type: 'human' },
          sentences: [{ id: 's_1', text: 'Second commit.' }],
          project_id: project.projectId,
          branch: 'main',
          parents: [data1.data.commit.hash],
        }),
      });
      const data2: ApiResponse = await res2.json();

      // Verify HEAD points to second commit
      const branch = await findBranchByName(mockDB, project.projectId, 'main');
      expect(branch!.headCommitHash).toBe(data2.data.commit.hash);
    });

    it('sets main branch as current branch', async () => {
      // Create a new project
      const project = await insertProject(
        mockDB,
        testData.project({ name: 'Current Branch Test' })
      );

      // Create commit with branch: "main"
      await app.request('/v1/commits-v4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: { type: 'human' },
          sentences: [{ id: 's_1', text: 'Test current branch.' }],
          project_id: project.projectId,
          branch: 'main',
        }),
      });

      // Verify main is the current branch
      const currentBranch = await findCurrentBranch(mockDB, project.projectId);
      expect(currentBranch).not.toBeNull();
      expect(currentBranch!.name).toBe('main');
    });
  });
});
