/**
 * Merge API Routes Tests
 *
 * Tests for POST /v1/merge/prepare and POST /v1/merge/execute
 * Updated for frame-level merge (FrameMergeResult / FrameMergeDecision)
 */

/** biome-ignore-all lint/suspicious/noExplicitAny: route integration tests use broad casts for compact mock assertions */

import type { AnyDB } from '@t3x-dev/storage';
import {
  createCommit,
  createMergeDraft,
  findBranchByName,
  getCommitUnified,
  getMergeDraft,
  insertBranch,
  insertProject,
} from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from '../setup';

type ApiResponse = any;

// Mock the database module before importing routes
let mockDB: AnyDB;

vi.mock('../../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// Mock the webhook dispatcher so route tests stay isolated from background side effects.
const mockDispatch = vi.fn();
vi.mock('../../lib/webhook-dispatcher', () => ({
  webhookDispatcher: {
    dispatch: (...args: unknown[]) => mockDispatch(...args),
  },
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
  let commitCounter = 0;
  const createTestCommit = async (
    frames: Array<{ id: string; type: string; slots: Record<string, unknown> }>
  ) => {
    commitCounter++;
    const commit = await createCommit(mockDB, {
      parents: [],
      author: { type: 'human', name: `Test User ${commitCounter}` },
      content: {
        trees: frames.map((f) => ({
          key: f.id,
          slots: f.slots,
          children: [],
        })),
        relations: [],
      } as any,
      project_id: testProjectId,
      message: `Test commit ${commitCounter}`,
      branch: 'main',
    });
    return commit;
  };

  const createProjectCommit = async (
    projectId: string,
    branch: string,
    frameId: string,
    parents: string[] = []
  ) => {
    commitCounter++;
    return createCommit(mockDB, {
      parents,
      author: { type: 'human', name: `Test User ${commitCounter}` },
      content: {
        trees: [{ key: frameId, slots: { value: frameId }, children: [] }],
        relations: [],
      },
      project_id: projectId,
      message: `Test commit ${commitCounter}`,
      branch,
    });
  };

  const createDraftFixture = async () => {
    await insertBranch(mockDB, { projectId: testProjectId, name: 'main' });
    const targetCommit = await createProjectCommit(testProjectId, 'main', 'target_frame');

    await insertBranch(mockDB, {
      projectId: testProjectId,
      name: 'feature',
      parentBranch: 'main',
    });
    const sourceCommit = await createProjectCommit(testProjectId, 'feature', 'source_frame', [
      targetCommit.hash,
    ]);

    return { sourceCommit, targetCommit };
  };

  const postMergeDraft = (
    sourceHash: string,
    targetHash: string,
    branches: { source_branch?: string; target_branch?: string } = {}
  ) =>
    app.request('/v1/merge/drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: testProjectId,
        source_hash: sourceHash,
        target_hash: targetHash,
        ...branches,
      }),
    });

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
      expect(json.data.autoKept[0]).toBe('f_001');
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
      expect(json.data.conflicts[0]).toHaveProperty('path');
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

    it('does not expose merge data from a target commit in another project', async () => {
      const sourceCommit = await createTestCommit([
        { id: 'source', type: 'test', slots: { text: 'Source' } },
      ]);
      const foreignProject = await insertProject(mockDB, testData.project());
      const foreignTarget = await createProjectCommit(
        foreignProject.projectId,
        'main',
        'foreign_secret'
      );

      const res = await app.request('/v1/merge/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_hash: sourceCommit.hash, target_hash: foreignTarget.hash }),
      });

      expect(res.status).toBe(400);
      const json: ApiResponse = await res.json();
      expect(json).toMatchObject({ success: false, error: { code: 'INVALID_REQUEST' } });
      expect(json).not.toHaveProperty('data');
    });
  });

  // ============================================================================
  // POST /v1/merge/execute Tests
  // ============================================================================

  describe('POST /v1/merge/execute', () => {
    it('creates merge commit with 2 parents', async () => {
      const targetCommit = await createProjectCommit(testProjectId, 'main', 'target_info');
      const sourceCommit = await createProjectCommit(testProjectId, 'feature', 'source_info', [
        targetCommit.hash,
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

      // Build decisions: keep all paths from both sides
      const decisions = {
        conflictResolutions: {} as Record<string, string>,
        keepFromSource: prepared.onlyInSource,
        keepFromTarget: prepared.onlyInTarget,
        keepRelationsFromSource: true,
        keepRelationsFromTarget: true,
      };

      // Resolve any conflicts
      for (const conflict of prepared.conflicts) {
        decisions.conflictResolutions[conflict.path] = 'source';
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
      expect(json.data.parents).toEqual([targetCommit.hash, sourceCommit.hash]);
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
      await insertBranch(mockDB, { projectId: testProjectId, name: 'main' });
      const targetCommit = await createProjectCommit(testProjectId, 'main', 'shared');
      const sourceCommit = await createProjectCommit(testProjectId, 'feature', 'shared', [
        targetCommit.hash,
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
      const mainBranch = await findBranchByName(mockDB, testProjectId, 'main');
      expect(mainBranch?.headCommitHash).toBe(json.data.hash);
    });
  });

  // ============================================================================
  // POST /v1/merge/drafts Tests
  // ============================================================================

  describe('POST /v1/merge/drafts', () => {
    it('reuses pending drafts only within the same branch context', async () => {
      const { sourceCommit, targetCommit } = await createDraftFixture();
      const existing = await createMergeDraft(mockDB, {
        projectId: testProjectId,
        sourceHash: sourceCommit.hash,
        targetHash: targetCommit.hash,
        sourceBranch: 'feature',
        targetBranch: 'release',
        prepared: {},
      });

      const res = await postMergeDraft(sourceCommit.hash, targetCommit.hash, {
        source_branch: 'feature',
        target_branch: 'main',
      });
      const json: ApiResponse = await res.json();

      expect(res.status).toBe(201);
      expect(json.data.targetBranch).toBe('main');
      expect(json.data.draftId).not.toBe(existing.draftId);

      const repeated = await postMergeDraft(sourceCommit.hash, targetCommit.hash, {
        source_branch: 'feature',
        target_branch: 'main',
      });
      const repeatedJson: ApiResponse = await repeated.json();

      expect(repeated.status).toBe(200);
      expect(repeatedJson.data.draftId).toBe(json.data.draftId);
    });

    it('rejects commits that do not belong to the requested project', async () => {
      const sourceCommit = await createProjectCommit(testProjectId, 'feature', 'source_frame');
      const otherProject = await insertProject(
        mockDB,
        testData.project({ name: 'Other merge project' })
      );
      const targetCommit = await createProjectCommit(
        otherProject.projectId,
        'main',
        'foreign_target'
      );

      const res = await postMergeDraft(sourceCommit.hash, targetCommit.hash);
      const json: ApiResponse = await res.json();

      expect(res.status).toBe(400);
      expect(json.error.code).toBe('INVALID_REQUEST');
    });
  });

  // ============================================================================
  // POST /v1/merge/drafts/:id/commit Tests
  // ============================================================================

  describe('POST /v1/merge/drafts/:id/commit', () => {
    it('persists target-first merge parents', async () => {
      const { sourceCommit, targetCommit } = await createDraftFixture();
      const draftRes = await postMergeDraft(sourceCommit.hash, targetCommit.hash, {
        source_branch: 'feature',
        target_branch: 'main',
      });
      expect(draftRes.status).toBe(201);
      const draftJson: ApiResponse = await draftRes.json();

      const res = await app.request(`/v1/merge/drafts/${draftJson.data.draftId}/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Merge feature into main' }),
      });

      expect(res.status).toBe(201);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.parents).toEqual([targetCommit.hash, sourceCommit.hash]);
      expect(json.data.branch).toBe('main');

      const persisted = await getCommitUnified(mockDB, json.data.hash);
      expect(persisted?.parents).toEqual([targetCommit.hash, sourceCommit.hash]);
      expect(persisted?.branch).toBe('main');
    });

    it('rejects a commit branch that differs from the draft target branch', async () => {
      const { sourceCommit, targetCommit } = await createDraftFixture();
      const draftRes = await postMergeDraft(sourceCommit.hash, targetCommit.hash, {
        source_branch: 'feature',
        target_branch: 'main',
      });
      const draftJson: ApiResponse = await draftRes.json();

      const res = await app.request(`/v1/merge/drafts/${draftJson.data.draftId}/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Wrong target', branch: 'feature' }),
      });

      expect(res.status).toBe(400);
      const json: ApiResponse = await res.json();
      expect(json).toMatchObject({ success: false, error: { code: 'INVALID_REQUEST' } });
    });

    it('keeps the draft pending when its target is no longer the branch head', async () => {
      const { sourceCommit, targetCommit } = await createDraftFixture();
      const draftRes = await postMergeDraft(sourceCommit.hash, targetCommit.hash);
      const draftJson: ApiResponse = await draftRes.json();
      await createProjectCommit(testProjectId, 'main', 'new_target', [targetCommit.hash]);

      const res = await app.request(`/v1/merge/drafts/${draftJson.data.draftId}/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Must not merge stale target' }),
      });

      expect(res.status).toBe(409);
      const json: ApiResponse = await res.json();
      expect(json).toMatchObject({ success: false, error: { code: 'BRANCH_NOT_HEAD' } });
      expect((await getMergeDraft(mockDB, draftJson.data.draftId))?.status).toBe('pending');
    });
  });
});
