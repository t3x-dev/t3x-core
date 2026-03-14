/**
 * Merge API Routes Tests
 *
 * Tests for POST /v1/merge/prepare and POST /v1/merge/execute
 */

import { createCommitV4, insertProject } from '@t3x-dev/storage';
import type { AnyDB } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from '../setup';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiResponse = any;

// Mock the database module before importing routes
let mockDB: AnyDB;

vi.mock('../../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// Import routes after mocking
import { mergeRoutes } from '../../routes/merge';

describe('Merge Routes', () => {
  let cleanup: () => Promise<void>;
  const app = new Hono();
  app.route('/', mergeRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  let testProjectId: string;

  beforeEach(async () => {
    // Create test project
    const project = await insertProject(mockDB, testData.project());
    testProjectId = project.projectId;
  });

  // Helper to create test commits (V4 format)
  const createTestCommit = async (sentences: Array<{ id: string; text: string }>) => {
    const commit = await createCommitV4(
      mockDB,
      {
        parents: [],
        author: { type: 'human', name: 'Test User' },
        sentences: sentences.map((s) => ({
          id: s.id,
          text: s.text,
        })),
        project_id: testProjectId,
        message: 'Test commit',
        branch: 'main',
      },
      { strictParents: false }
    );
    return commit;
  };

  // ============================================================================
  // POST /v1/merge/prepare Tests
  // ============================================================================

  describe('POST /v1/merge/prepare', () => {
    it('returns Merge2WayResult for valid commits', async () => {
      // Setup: create two commits
      const sourceCommit = await createTestCommit([
        { id: 's1', text: 'Budget is $3000' },
        { id: 's2', text: 'Use React framework' },
      ]);

      const targetCommit = await createTestCommit([
        { id: 't1', text: 'Budget is $5000' },
        { id: 't2', text: 'Use React framework' },
      ]);

      const res = await app.request('/v1/merge/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_hash: sourceCommit.hash,
          target_hash: targetCommit.hash,
        }),
      });

      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveProperty('identical');
      expect(json.data).toHaveProperty('similarPairs');
      expect(json.data).toHaveProperty('onlyInSource');
      expect(json.data).toHaveProperty('onlyInTarget');
    });

    it('returns identical sentences', async () => {
      const sourceCommit = await createTestCommit([{ id: 's1', text: 'Same sentence' }]);

      const targetCommit = await createTestCommit([{ id: 't1', text: 'Same sentence' }]);

      const res = await app.request('/v1/merge/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_hash: sourceCommit.hash,
          target_hash: targetCommit.hash,
        }),
      });

      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      expect(json.data.identical).toHaveLength(1);
      expect(json.data.identical[0].text).toBe('Same sentence');
    });

    it('returns similar pairs for similar sentences', async () => {
      const sourceCommit = await createTestCommit([{ id: 's1', text: 'Budget is $3000' }]);

      const targetCommit = await createTestCommit([{ id: 't1', text: 'Budget is $5000' }]);

      const res = await app.request('/v1/merge/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_hash: sourceCommit.hash,
          target_hash: targetCommit.hash,
        }),
      });

      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      expect(json.data.similarPairs.length).toBeGreaterThan(0);
      expect(json.data.similarPairs[0]).toHaveProperty('source');
      expect(json.data.similarPairs[0]).toHaveProperty('target');
      expect(json.data.similarPairs[0]).toHaveProperty('wordDiff');
    });

    it('returns 404 for missing source commit', async () => {
      const targetCommit = await createTestCommit([{ id: 't1', text: 'Test' }]);

      const res = await app.request('/v1/merge/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_hash: 'sha256:nonexistent',
          target_hash: targetCommit.hash,
        }),
      });

      expect(res.status).toBe(404);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 for missing target commit', async () => {
      const sourceCommit = await createTestCommit([{ id: 's1', text: 'Test' }]);

      const res = await app.request('/v1/merge/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_hash: sourceCommit.hash,
          target_hash: 'sha256:nonexistent',
        }),
      });

      expect(res.status).toBe(404);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('NOT_FOUND');
    });
  });

  // ============================================================================
  // POST /v1/merge/execute Tests
  // ============================================================================

  describe('POST /v1/merge/execute', () => {
    it('creates merge commit with 2 parents', async () => {
      const sourceCommit = await createTestCommit([{ id: 's1', text: 'Source sentence' }]);

      const targetCommit = await createTestCommit([{ id: 't1', text: 'Target sentence' }]);

      // Prepare first
      const prepareRes = await app.request('/v1/merge/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_hash: sourceCommit.hash,
          target_hash: targetCommit.hash,
        }),
      });

      const prepareJson: ApiResponse = await prepareRes.json();
      const prepared = prepareJson.data;

      // Resolve all similarPairs (if any)
      if (prepared.similarPairs.length > 0) {
        for (const pair of prepared.similarPairs) {
          pair.resolution = 'source';
        }
      }

      // Execute merge - V4 API requires project_id
      const res = await app.request('/v1/merge/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_hash: sourceCommit.hash,
          target_hash: targetCommit.hash,
          project_id: testProjectId,
          prepared,
          message: 'Merge test',
        }),
      });

      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.hash).toBeDefined();
      expect(json.data.parents).toHaveLength(2);
      expect(json.data.parents[0]).toBe(sourceCommit.hash);
      expect(json.data.parents[1]).toBe(targetCommit.hash);
    });

    it('returns 400 for unresolved pairs', async () => {
      const sourceCommit = await createTestCommit([{ id: 's1', text: 'Budget is $3000' }]);

      const targetCommit = await createTestCommit([{ id: 't1', text: 'Budget is $5000' }]);

      // V4: No sourceConstraints, targetConstraints
      const prepared = {
        identical: [],
        similarPairs: [
          {
            source: { id: 's1', text: 'Budget is $3000' },
            target: { id: 't1', text: 'Budget is $5000' },
            wordDiff: [],
            resolution: undefined, // Not resolved!
          },
        ],
        onlyInSource: [],
        onlyInTarget: [],
      };

      const res = await app.request('/v1/merge/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_hash: sourceCommit.hash,
          target_hash: targetCommit.hash,
          project_id: testProjectId,
          prepared,
          message: 'Merge',
        }),
      });

      expect(res.status).toBe(400);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('UNRESOLVED_PAIRS');
    });

    it('updates branch pointer when branch specified', async () => {
      const sourceCommit = await createTestCommit([{ id: 's1', text: 'Test' }]);

      const targetCommit = await createTestCommit([{ id: 't1', text: 'Test' }]);

      // V4: DiffableSentence only needs id + text
      const prepared = {
        identical: [
          {
            id: 's1',
            text: 'Test',
          },
        ],
        similarPairs: [],
        onlyInSource: [],
        onlyInTarget: [],
      };

      const res = await app.request('/v1/merge/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_hash: sourceCommit.hash,
          target_hash: targetCommit.hash,
          project_id: testProjectId,
          prepared,
          message: 'Merge',
          branch: 'main',
        }),
      });

      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.branch).toBe('main');
    });
  });
});
