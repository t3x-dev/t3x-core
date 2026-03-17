/**
 * Diff + Export Route Tests
 *
 * Diff: Tests V4 commit path (Jaccard, no embedding needed) + validation
 * Export: Tests cfpack and ledger endpoints
 */

import { createCommitV4, insertConversation, insertProject, insertTurn } from '@t3x-dev/storage';
import type { AnyDB } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

type ApiResponse = any;

let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

import { diffRoutes } from '../routes/diff';
import { exportRoutes } from '../routes/export.openapi';

describe('Diff Routes', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let baseCommitHash: string;
  let targetCommitHash: string;
  const app = new Hono();
  app.route('/', diffRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    const project = await insertProject(mockDB, testData.project({ name: 'Diff Test' }));
    testProjectId = project.projectId;

    // Create V4 commits for testing
    const baseCommit = await createCommitV4(mockDB, {
      parents: [],
      author: { type: 'human', name: 'Test' },
      sentences: [
        { id: 's_1', text: 'The budget is three thousand dollars' },
        { id: 's_2', text: 'The deadline is next Friday' },
        { id: 's_3', text: 'Unique to base' },
      ],
      project_id: testProjectId,
    });
    baseCommitHash = baseCommit.hash;

    const targetCommit = await createCommitV4(mockDB, {
      parents: [baseCommitHash],
      author: { type: 'human', name: 'Test' },
      sentences: [
        { id: 's_4', text: 'The budget is five thousand dollars' },
        { id: 's_5', text: 'The deadline is next Friday' },
        { id: 's_6', text: 'Unique to target' },
      ],
      project_id: testProjectId,
    });
    targetCommitHash = targetCommit.hash;
  });

  afterAll(async () => {
    await cleanup();
  });

  // =========================================================================
  // POST /v1/diff/two-way (V4 commit path)
  // =========================================================================
  describe('POST /v1/diff/two-way', () => {
    it('diffs V4 commits using Jaccard (no embedding needed)', async () => {
      const res = await app.request('/v1/diff/two-way', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base_commit_hash: baseCommitHash,
          target_commit_hash: targetCommitHash,
        }),
      });

      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.method).toBe('jaccard');
      expect(data.data.segmentDiffs).toBeDefined();
      expect(data.data.stats).toBeDefined();

      // Should find identical, modified, removed, added segments
      const diffs = data.data.segmentDiffs;
      const types = diffs.map((d: any) => d.diffType);
      expect(types).toContain('same'); // "The deadline is next Friday"
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await app.request('/v1/diff/two-way', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 for missing parameters', async () => {
      const res = await app.request('/v1/diff/two-way', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent commit', async () => {
      const res = await app.request('/v1/diff/two-way', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base_commit_hash: 'sha256:nonexistent',
          target_commit_hash: targetCommitHash,
        }),
      });

      // When neither V4 nor V3 found, returns 404
      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // POST /v1/diff/three-way (validation only)
  // =========================================================================
  describe('POST /v1/diff/three-way', () => {
    it('returns 400 for missing parameters', async () => {
      const res = await app.request('/v1/diff/three-way', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await app.request('/v1/diff/three-way', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      });

      expect(res.status).toBe(400);
    });
  });
});

describe('Export Routes', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  const app = new Hono();
  app.route('/', exportRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    const project = await insertProject(mockDB, testData.project({ name: 'Export Test' }));
    testProjectId = project.projectId;

    // Create conversation with turns
    const conv = await insertConversation(mockDB, {
      projectId: testProjectId,
      title: 'Export Conv',
    });
    await insertTurn(mockDB, {
      projectId: testProjectId,
      conversationId: conv.conversationId,
      role: 'user',
      content: 'Export test message',
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  // =========================================================================
  // GET /v1/export/cfpack
  // =========================================================================
  describe('GET /v1/export/cfpack', () => {
    it('exports project as cfpack', async () => {
      const res = await app.request(`/v1/export/cfpack?project_id=${testProjectId}`);
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/vnd.t3x.cfpack+json');
      expect(res.headers.get('Content-Disposition')).toContain('.cfpack');

      const cfpack = await res.json();
      expect(cfpack.version).toBe('1.0.0');
      expect(cfpack.project.project_id).toBe(testProjectId);
      expect(cfpack.turns.length).toBeGreaterThanOrEqual(1);
      expect(cfpack.hash).toBeDefined();
      expect(cfpack.hash.algorithm).toBe('sha256-jcs-v1');
    });

    it('returns 400 without project_id', async () => {
      const res = await app.request('/v1/export/cfpack');
      expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent project', async () => {
      const res = await app.request('/v1/export/cfpack?project_id=proj_nonexistent');
      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // GET /v1/export/ledger
  // =========================================================================
  describe('GET /v1/export/ledger', () => {
    it('exports project as JSONL ledger', async () => {
      const res = await app.request(`/v1/export/ledger?project_id=${testProjectId}`);
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/x-ndjson');
      expect(res.headers.get('Content-Disposition')).toContain('.jsonl');

      const text = await res.text();
      const lines = text.trim().split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(1);

      // First line should be project
      const projectLine = JSON.parse(lines[0]);
      expect(projectLine.type).toBe('project');
      expect(projectLine.project_id).toBe(testProjectId);

      // Should contain conversation and turn entries
      const types = lines.map((l: string) => JSON.parse(l).type);
      expect(types).toContain('conversation');
      expect(types).toContain('turn');
    });

    it('returns 400 without project_id', async () => {
      const res = await app.request('/v1/export/ledger');
      expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent project', async () => {
      const res = await app.request('/v1/export/ledger?project_id=proj_nonexistent');
      expect(res.status).toBe(404);
    });
  });
});
