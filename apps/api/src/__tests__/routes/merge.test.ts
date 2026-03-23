/**
 * Merge API Routes Tests
 *
 * Tests for POST /v1/merge/prepare and POST /v1/merge/execute
 * Updated for frame-level merge (FrameMergeResult / FrameMergeDecision)
 */

import type { AnyDB } from '@t3x-dev/storage';
import { createCommit, insertProject } from '@t3x-dev/storage';
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
import { mergeRoutes } from '../../routes/merge.openapi';

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

  // Helper to create test commits (frame-based format)
  const createTestCommit = async (
    frames: Array<{ id: string; type: string; slots: Record<string, unknown> }>
  ) => {
    const commit = await createCommit(mockDB, {
      parents: [],
      author: { type: 'human', name: 'Test User' },
      content: {
        frames: frames.map((f) => ({
          id: f.id,
          type: f.type,
          slots: f.slots,
        })),
        relations: [],
      },
      project_id: testProjectId,
      message: 'Test commit',
      branch: 'main',
    });
    return commit;
  };

  // ============================================================================
  // POST /v1/merge/prepare Tests
  // ============================================================================

  describe('POST /v1/merge/prepare', () => {
    it('returns FrameMergeResult for valid commits', async () => {
      // Setup: create two commits with different frames
      const sourceCommit = await createTestCommit([
        { id: 'f_001', type: 'budget', slots: { amount: '$3000' } },
        { id: 'f_002', type: 'tech_stack', slots: { framework: 'React' } },
      ]);

      const targetCommit = await createTestCommit([
        { id: 'f_001', type: 'budget', slots: { amount: '$5000' } },
        { id: 'f_002', type: 'tech_stack', slots: { framework: 'React' } },
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
      expect(json.data).toHaveProperty('autoKept');
      expect(json.data).toHaveProperty('conflicts');
      expect(json.data).toHaveProperty('onlyInSource');
      expect(json.data).toHaveProperty('onlyInTarget');
      expect(json.data).toHaveProperty('relationsOnlyInSource');
      expect(json.data).toHaveProperty('relationsOnlyInTarget');
      expect(json.data).toHaveProperty('relationsInBoth');
    });

    it('returns autoKept for identical frames', async () => {
      const sourceCommit = await createTestCommit([
        { id: 'f_001', type: 'budget', slots: { amount: '$3000' } },
      ]);

      const targetCommit = await createTestCommit([
        { id: 'f_001', type: 'budget', slots: { amount: '$3000' } },
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
      expect(json.data.autoKept).toHaveLength(1);
      expect(json.data.autoKept[0].id).toBe('f_001');
    });

    it('returns conflicts for frames with different slots', async () => {
      const sourceCommit = await createTestCommit([
        { id: 'f_001', type: 'budget', slots: { amount: '$3000' } },
      ]);

      const targetCommit = await createTestCommit([
        { id: 'f_001', type: 'budget', slots: { amount: '$5000' } },
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
      expect(json.data.conflicts.length).toBeGreaterThan(0);
      expect(json.data.conflicts[0]).toHaveProperty('frameId');
      expect(json.data.conflicts[0]).toHaveProperty('sourceFrame');
      expect(json.data.conflicts[0]).toHaveProperty('targetFrame');
      expect(json.data.conflicts[0]).toHaveProperty('slotConflicts');
    });

    it('returns 404 for missing source commit', async () => {
      const targetCommit = await createTestCommit([
        { id: 'f_001', type: 'test', slots: { text: 'Test' } },
      ]);

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
      const sourceCommit = await createTestCommit([
        { id: 'f_001', type: 'test', slots: { text: 'Test' } },
      ]);

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
      const sourceCommit = await createTestCommit([
        { id: 'f_001', type: 'info', slots: { text: 'Source info' } },
      ]);

      const targetCommit = await createTestCommit([
        { id: 'f_002', type: 'info', slots: { text: 'Target info' } },
      ]);

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

      // Build decisions: keep all frames from both sides
      const decisions = {
        conflictResolutions: {} as Record<string, string>,
        keepFromSource: prepared.onlyInSource.map((f: ApiResponse) => f.id),
        keepFromTarget: prepared.onlyInTarget.map((f: ApiResponse) => f.id),
        keepRelationsFromSource: true,
        keepRelationsFromTarget: true,
      };

      // Resolve any conflicts
      for (const conflict of prepared.conflicts) {
        decisions.conflictResolutions[conflict.frameId] = 'source';
      }

      // Execute merge
      const res = await app.request('/v1/merge/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_hash: sourceCommit.hash,
          target_hash: targetCommit.hash,
          prepared,
          decisions,
          message: 'Merge test',
        }),
      });

      expect(res.status).toBe(201);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.hash).toBeDefined();
      expect(json.data.parents).toHaveLength(2);
      expect(json.data.parents[0]).toBe(sourceCommit.hash);
      expect(json.data.parents[1]).toBe(targetCommit.hash);
    });

    it('returns 400 for unresolved conflicts', async () => {
      const sourceCommit = await createTestCommit([
        { id: 'f_001', type: 'budget', slots: { amount: '$3000' } },
      ]);

      const targetCommit = await createTestCommit([
        { id: 'f_001', type: 'budget', slots: { amount: '$5000' } },
      ]);

      // Prepare
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

      // Decisions with NO conflict resolutions
      const decisions = {
        conflictResolutions: {},
        keepFromSource: [],
        keepFromTarget: [],
        keepRelationsFromSource: true,
        keepRelationsFromTarget: true,
      };

      const res = await app.request('/v1/merge/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_hash: sourceCommit.hash,
          target_hash: targetCommit.hash,
          prepared,
          decisions,
          message: 'Merge',
        }),
      });

      expect(res.status).toBe(400);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('UNRESOLVED_CONFLICTS');
    });

    it('updates branch pointer when branch specified', async () => {
      const sourceCommit = await createTestCommit([
        { id: 'f_001', type: 'info', slots: { text: 'Test' } },
      ]);

      const targetCommit = await createTestCommit([
        { id: 'f_001', type: 'info', slots: { text: 'Test' } },
      ]);

      // Prepare
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

      const decisions = {
        conflictResolutions: {},
        keepFromSource: [],
        keepFromTarget: [],
        keepRelationsFromSource: true,
        keepRelationsFromTarget: true,
      };

      const res = await app.request('/v1/merge/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_hash: sourceCommit.hash,
          target_hash: targetCommit.hash,
          prepared,
          decisions,
          message: 'Merge',
          branch: 'main',
        }),
      });

      expect(res.status).toBe(201);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.branch).toBe('main');
    });
  });
});
