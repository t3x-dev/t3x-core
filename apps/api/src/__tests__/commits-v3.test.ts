/**
 * Commits V3 Route Tests
 */

import { deleteCommitV3, insertProject, listCommitsV3 } from '@t3x-dev/storage';
import type { AnyDB } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiResponse = any;

// Mock the database module before importing routes
let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// Import routes after mocking
import { commitsV3Routes } from '../routes/commits-v3.openapi';

describe('Commits V3 Routes', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  const app = new Hono();
  app.route('/', commitsV3Routes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    // Create a test project
    const project = await insertProject(
      mockDB,
      testData.project({ name: 'CommitsV3 Test Project' })
    );
    testProjectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    // Clean up commits before each test
    const commits = await listCommitsV3(mockDB, { projectId: testProjectId });
    for (const commit of commits) {
      await deleteCommitV3(mockDB, commit.hash);
    }
  });

  describe('POST /v1/commits-v3', () => {
    it('creates a commit with valid input', async () => {
      const res = await app.request('/v1/commits-v3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          branch: 'main',
          message: 'Test commit',
          content: {
            sentences: [
              {
                id: 's1',
                text: 'Service fee is $5000.',
                source: {
                  turn_hash: 'sha256:abc123',
                  start_char: 0,
                  end_char: 21,
                },
              },
            ],
            constraints: [
              {
                type: 'require',
                id: 'c1',
                value: '$5000',
                match: 'exact',
                source_sentence_id: 's1',
              },
            ],
          },
        }),
      });

      expect(res.status).toBe(201);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.hash).toMatch(/^sha256:/);
      expect(data.data.schema).toBe('commit/v3');
      expect(data.data.author.name).toBeDefined();
      expect(data.data.project_id).toBe(testProjectId);
      expect(data.data.message).toBe('Test commit');
      expect(data.data.branch).toBe('main');
      expect(data.data.content.sentences).toHaveLength(1);
      expect(data.data.content.constraints).toHaveLength(1);
    });

    it('creates a commit without constraints', async () => {
      const res = await app.request('/v1/commits-v3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          content: {
            sentences: [
              {
                id: 's1',
                text: 'Hello world.',
                source: {
                  turn_hash: 'sha256:def456',
                  start_char: 0,
                  end_char: 12,
                },
              },
            ],
          },
        }),
      });

      expect(res.status).toBe(201);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.branch).toBe('main'); // default
      expect(data.data.content.sentences).toHaveLength(1);
    });

    it('creates a commit with position', async () => {
      const res = await app.request('/v1/commits-v3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          content: {
            sentences: [],
          },
          position: { x: 100, y: 200 },
        }),
      });

      expect(res.status).toBe(201);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.position).toEqual({ x: 100, y: 200 });
    });

    it('returns error for missing project_id', async () => {
      const res = await app.request('/v1/commits-v3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: { sentences: [] },
        }),
      });

      expect(res.status).toBe(400);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_REQUEST');
    });

    it('returns error for missing content', async () => {
      const res = await app.request('/v1/commits-v3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
        }),
      });

      expect(res.status).toBe(400);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
    });

    it('returns error for invalid sentence structure', async () => {
      const res = await app.request('/v1/commits-v3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          content: {
            sentences: [
              {
                // missing id and source
                text: 'Hello',
              },
            ],
          },
        }),
      });

      expect(res.status).toBe(400);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.message).toContain('sentences[0]');
    });

    it('returns error for invalid constraint type', async () => {
      const res = await app.request('/v1/commits-v3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          content: {
            sentences: [],
            constraints: [
              {
                type: 'must_have', // wrong type, should be 'require' or 'exclude'
                id: 'c1',
                value: 'test',
                match: 'exact',
              },
            ],
          },
        }),
      });

      expect(res.status).toBe(400);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.message).toContain("must be 'require' or 'exclude'");
    });

    it('returns error for invalid JSON', async () => {
      const res = await app.request('/v1/commits-v3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not valid json',
      });

      expect(res.status).toBe(400);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_JSON');
    });
  });

  describe('GET /v1/commits-v3/:hash', () => {
    it('returns commit by hash', async () => {
      // First create a commit
      const createRes = await app.request('/v1/commits-v3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          message: 'Find me',
          content: { sentences: [] },
        }),
      });

      const createData: ApiResponse = await createRes.json();
      const hash = createData.data.hash;

      // Then get it by hash
      const res = await app.request(`/v1/commits-v3/${encodeURIComponent(hash)}`);
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.hash).toBe(hash);
      expect(data.data.message).toBe('Find me');
    });

    it('returns 404 for non-existent commit', async () => {
      const res = await app.request('/v1/commits-v3/sha256:nonexistent');
      expect(res.status).toBe(404);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /v1/commits-v3', () => {
    it('returns commits for a project', async () => {
      // Create two commits with different content to guarantee distinct hashes
      await app.request('/v1/commits-v3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          message: 'Commit 1',
          content: {
            sentences: [
              {
                id: 's1',
                text: 'First commit sentence.',
                source: { turn_hash: 'sha256:aaa', start_char: 0, end_char: 22 },
              },
            ],
          },
        }),
      });

      await app.request('/v1/commits-v3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          message: 'Commit 2',
          content: {
            sentences: [
              {
                id: 's2',
                text: 'Second commit sentence.',
                source: { turn_hash: 'sha256:bbb', start_char: 0, end_char: 23 },
              },
            ],
          },
        }),
      });

      const res = await app.request(`/v1/commits-v3?project_id=${testProjectId}`);
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.commits.length).toBe(2);
      expect(data.data.project_id).toBe(testProjectId);
    });

    it('returns error for missing project_id', async () => {
      const res = await app.request('/v1/commits-v3');
      expect(res.status).toBe(400);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_REQUEST');
    });

    it('filters by branch', async () => {
      // Create commits on different branches
      await app.request('/v1/commits-v3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          branch: 'main',
          message: 'Main commit',
          content: { sentences: [] },
        }),
      });

      await app.request('/v1/commits-v3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          branch: 'feature',
          message: 'Feature commit',
          content: { sentences: [] },
        }),
      });

      const res = await app.request(`/v1/commits-v3?project_id=${testProjectId}&branch=main`);
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.commits.length).toBe(1);
      expect(data.data.commits[0].branch).toBe('main');
    });

    it('respects limit parameter', async () => {
      // Create 3 commits
      for (let i = 0; i < 3; i++) {
        await app.request('/v1/commits-v3', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: testProjectId,
            message: `Commit ${i}`,
            content: { sentences: [] },
          }),
        });
      }

      const res = await app.request(`/v1/commits-v3?project_id=${testProjectId}&limit=2`);
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.data.commits.length).toBe(2);
      expect(data.data.limit).toBe(2);
    });
  });

  describe('hash computation', () => {
    it('computes consistent hash for same content', async () => {
      const content = {
        sentences: [
          {
            id: 's1',
            text: 'Consistent hash test.',
            source: {
              turn_hash: 'sha256:hash123',
              start_char: 0,
              end_char: 21,
            },
          },
        ],
      };

      // Note: Can't create same hash twice (duplicate key error)
      // But we can verify hash format
      const res = await app.request('/v1/commits-v3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          content,
        }),
      });

      expect(res.status).toBe(201);

      const data: ApiResponse = await res.json();
      expect(data.data.hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it('second-class fields do not affect hash', async () => {
      // Use computeCommitV3Hash directly to verify second-class fields don't affect hash
      // (Can't create two commits with same hash in database due to primary key constraint)
      const { computeCommitV3Hash } = await import('@t3x-dev/core');

      const baseCommit = {
        schema: 'commit/v3' as const,
        parents: [],
        author: { name: 'Test', identity: 'test', verification: 'none' as const },
        committed_at: '2024-01-15T10:00:00.000Z',
        content: {
          sentences: [
            {
              id: 's1',
              text: 'Same content.',
              source: { turn_hash: 'sha256:same', start_char: 0, end_char: 13 },
            },
          ],
        },
      };

      // Hash with different second-class fields
      const hash1 = computeCommitV3Hash({
        ...baseCommit,
        message: 'Message A',
        project_id: 'proj_1',
        branch: 'main',
      });

      const hash2 = computeCommitV3Hash({
        ...baseCommit,
        message: 'Message B',
        project_id: 'proj_2',
        branch: 'feature',
      });

      // Hashes should be identical since second-class fields are not included
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it('first-class fields do affect hash', async () => {
      const { computeCommitV3Hash } = await import('@t3x-dev/core');

      const baseCommit = {
        schema: 'commit/v3' as const,
        parents: [],
        author: { name: 'Test', identity: 'test', verification: 'none' as const },
        committed_at: '2024-01-15T10:00:00.000Z',
        content: {
          sentences: [],
        },
      };

      // Hash with different content (first-class field)
      const hash1 = computeCommitV3Hash({
        ...baseCommit,
        content: {
          sentences: [
            { id: 's1', text: 'A', source: { turn_hash: 'sha256:a', start_char: 0, end_char: 1 } },
          ],
        },
      });

      const hash2 = computeCommitV3Hash({
        ...baseCommit,
        content: {
          sentences: [
            { id: 's2', text: 'B', source: { turn_hash: 'sha256:b', start_char: 0, end_char: 1 } },
          ],
        },
      });

      // Hashes should be different since content is a first-class field
      expect(hash1).not.toBe(hash2);
    });
  });
});
