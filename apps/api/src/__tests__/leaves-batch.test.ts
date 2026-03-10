/**
 * Batch Generation Route Tests
 *
 * Integration tests for POST /v1/commits/{hash}/leaves/batch endpoint.
 */

import { createCommitV4, insertProject } from '@t3x-dev/storage';
import type { PGLiteDB } from '@t3x-dev/storage/pglite';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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

describe('Batch Generation Routes', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let testCommitHash: string;
  const app = new Hono();
  app.route('/', leavesRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    // Create a test project
    const project = await insertProject(mockDB, testData.project({ name: 'Batch Test Project' }));
    testProjectId = project.projectId;

    // Create a real V4 commit for testing
    const commit = await createCommitV4(mockDB, {
      author: { type: 'human', name: 'test-user' },
      sentences: [
        { id: 's1', text: 'Test sentence for batch generation.' },
        { id: 's2', text: 'Another test sentence.' },
      ],
      project_id: testProjectId,
      message: 'Test commit for batch',
      branch: 'main',
    });
    testCommitHash = commit.hash;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('POST /v1/commits/{hash}/leaves/batch', () => {
    it('creates multiple leaves with skip_generation=true', async () => {
      const res = await app.request(
        `/v1/commits/${encodeURIComponent(testCommitHash)}/leaves/batch`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: testProjectId,
            leaves: [
              { type: 'tweet', title: 'Tweet 1' },
              { type: 'weibo', title: 'Weibo 1' },
              { type: 'email', title: 'Email 1' },
            ],
            skip_generation: true,
          }),
        }
      );

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.results).toHaveLength(3);
      expect(data.data.summary.total).toBe(3);
      expect(data.data.summary.succeeded).toBe(3);
      expect(data.data.summary.failed).toBe(0);

      // Verify each leaf was created
      expect(data.data.results[0].leaf.id).toMatch(/^leaf_/);
      expect(data.data.results[0].leaf.type).toBe('tweet');
      expect(data.data.results[0].leaf.title).toBe('Tweet 1');
      expect(data.data.results[0].leaf.output).toBeNull(); // No generation
      expect(data.data.results[0].error).toBeNull();

      expect(data.data.results[1].leaf.type).toBe('weibo');
      expect(data.data.results[2].leaf.type).toBe('email');
    });

    it('creates leaves with constraints and config', async () => {
      const res = await app.request(
        `/v1/commits/${encodeURIComponent(testCommitHash)}/leaves/batch`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: testProjectId,
            leaves: [
              {
                type: 'article',
                title: 'Article with Constraints',
                constraints: [
                  {
                    type: 'require',
                    match_mode: 'exact',
                    value: 'important keyword',
                  },
                ],
                config: {
                  max_tokens: 1000,
                },
              },
            ],
            skip_generation: true,
          }),
        }
      );

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.results[0].leaf.constraints).toHaveLength(1);
      expect(data.data.results[0].leaf.constraints[0].id).toMatch(/^cst_/);
      expect(data.data.results[0].leaf.constraints[0].value).toBe('important keyword');
      expect(data.data.results[0].leaf.config.max_tokens).toBe(1000);
    });

    it('creates all 8 leaf types in one batch', async () => {
      const res = await app.request(
        `/v1/commits/${encodeURIComponent(testCommitHash)}/leaves/batch`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: testProjectId,
            leaves: [
              { type: 'tweet' },
              { type: 'weibo' },
              { type: 'wechat' },
              { type: 'email' },
              { type: 'article' },
              { type: 'slack' },
            ],
            skip_generation: true,
          }),
        }
      );

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.results).toHaveLength(6);
      expect(data.data.summary.succeeded).toBe(6);

      // Verify each type
      const types = data.data.results.map((r: ApiResponse) => r.leaf.type);
      expect(types).toContain('tweet');
      expect(types).toContain('weibo');
      expect(types).toContain('wechat');
      expect(types).toContain('email');
      expect(types).toContain('article');
      expect(types).toContain('slack');
    });

    it('returns 400 for empty leaves array', async () => {
      const res = await app.request(
        `/v1/commits/${encodeURIComponent(testCommitHash)}/leaves/batch`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: testProjectId,
            leaves: [],
            skip_generation: true,
          }),
        }
      );

      expect(res.status).toBe(400);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
    });

    it('returns 400 for more than 10 leaves', async () => {
      const tooManyLeaves = Array(11)
        .fill(null)
        .map((_, i) => ({ type: 'tweet', title: `Tweet ${i}` }));

      const res = await app.request(
        `/v1/commits/${encodeURIComponent(testCommitHash)}/leaves/batch`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: testProjectId,
            leaves: tooManyLeaves,
            skip_generation: true,
          }),
        }
      );

      expect(res.status).toBe(400);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
    });

    it('returns 404 for non-existent commit', async () => {
      const res = await app.request('/v1/commits/sha256:nonexistent_commit/leaves/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          leaves: [{ type: 'tweet' }],
          skip_generation: true,
        }),
      });

      expect(res.status).toBe(404);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('COMMIT_NOT_FOUND');
    });

    it('returns 400 for invalid leaf type', async () => {
      const res = await app.request(
        `/v1/commits/${encodeURIComponent(testCommitHash)}/leaves/batch`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: testProjectId,
            leaves: [{ type: 'invalid_type' }],
            skip_generation: true,
          }),
        }
      );

      expect(res.status).toBe(400);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
    });

    it('returns 400 for missing project_id', async () => {
      const res = await app.request(
        `/v1/commits/${encodeURIComponent(testCommitHash)}/leaves/batch`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leaves: [{ type: 'tweet' }],
            skip_generation: true,
          }),
        }
      );

      expect(res.status).toBe(400);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
    });

    it('defaults skip_generation to false', async () => {
      // When ANTHROPIC_API_KEY is not set and skip_generation is not provided,
      // it should return an error about generation not configured
      const res = await app.request(
        `/v1/commits/${encodeURIComponent(testCommitHash)}/leaves/batch`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: testProjectId,
            leaves: [{ type: 'tweet' }],
            // skip_generation not provided, defaults to false
          }),
        }
      );

      // Since ANTHROPIC_API_KEY is not set in test environment,
      // this should return 400 with GENERATION_NOT_CONFIGURED
      expect(res.status).toBe(400);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('GENERATION_NOT_CONFIGURED');
    });

    it('returns correct summary for single leaf', async () => {
      const res = await app.request(
        `/v1/commits/${encodeURIComponent(testCommitHash)}/leaves/batch`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: testProjectId,
            leaves: [{ type: 'slack', title: 'Single Leaf' }],
            skip_generation: true,
          }),
        }
      );

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.summary).toEqual({
        total: 1,
        succeeded: 1,
        failed: 0,
      });
    });

    it('all created leaves belong to the same commit', async () => {
      const res = await app.request(
        `/v1/commits/${encodeURIComponent(testCommitHash)}/leaves/batch`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: testProjectId,
            leaves: [
              { type: 'tweet', title: 'Same Commit 1' },
              { type: 'weibo', title: 'Same Commit 2' },
            ],
            skip_generation: true,
          }),
        }
      );

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.data.results[0].leaf.commit_hash).toBe(testCommitHash);
      expect(data.data.results[1].leaf.commit_hash).toBe(testCommitHash);
    });
  });
});
