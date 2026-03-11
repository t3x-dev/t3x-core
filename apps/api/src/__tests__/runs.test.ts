/**
 * Runs Route Tests
 */

import { deleteRun, getRun, insertProject, insertRun, listRuns } from '@t3x-dev/storage';
import type { PGLiteDB } from '@t3x-dev/storage/pglite';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateId, setupTestDB, testData } from './setup';

type ApiResponse = Record<string, unknown>;

let mockDB: PGLiteDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// Mock fetch for Runner service calls
const mockFetchFn = vi.fn();
vi.stubGlobal('fetch', mockFetchFn);

import { runsRoutes } from '../routes/runs';

describe('Runs Routes', () => {
  let cleanup: () => Promise<void>;
  let projectId: string;
  const app = new Hono();
  app.route('/', runsRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;
    const proj = await insertProject(mockDB, testData.project({ name: 'Runs Project' }));
    projectId = proj.projectId;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await cleanup();
  });

  beforeEach(async () => {
    mockFetchFn.mockReset();
    const runs = await listRuns(mockDB, {});
    for (const r of runs) {
      await deleteRun(mockDB, r.runId);
    }
  });

  describe('GET /v1/runs', () => {
    it('returns empty list', async () => {
      const res = await app.request('/v1/runs');
      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
    });

    it('returns runs after creation', async () => {
      await insertRun(mockDB, {
        run_id: generateId('run'),
        project_id: projectId,
        status: 'completed',
        commit_ref: 'sha256:test',
      });
      const res = await app.request('/v1/runs');
      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
    });
  });

  describe('GET /v1/runs/filters', () => {
    it('returns filter options', async () => {
      const res = await app.request('/v1/runs/filters');
      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
    });
  });

  describe('GET /v1/runs/configurations', () => {
    it('returns configuration stats', async () => {
      const res = await app.request('/v1/runs/configurations');
      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
    });
  });

  describe('GET /v1/runs/:id', () => {
    it('returns 404 for non-existent run', async () => {
      const res = await app.request('/v1/runs/run_nonexistent');
      expect(res.status).toBe(404);
    });

    it('returns run by id', async () => {
      const runId = generateId('run');
      await insertRun(mockDB, {
        run_id: runId,
        project_id: projectId,
        status: 'completed',
        commit_ref: 'sha256:test',
      });
      const res = await app.request(`/v1/runs/${runId}`);
      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
    });
  });

  describe('DELETE /v1/runs/:id', () => {
    it('returns 404 for non-existent run', async () => {
      const res = await app.request('/v1/runs/run_nonexistent', { method: 'DELETE' });
      expect(res.status).toBe(404);
    });

    it('deletes run', async () => {
      const runId = generateId('run');
      await insertRun(mockDB, {
        run_id: runId,
        project_id: projectId,
        status: 'completed',
        commit_ref: 'sha256:test',
      });
      const res = await app.request(`/v1/runs/${runId}`, { method: 'DELETE' });
      expect(res.status).toBe(200);
    });
  });

  describe('POST /v1/runs', () => {
    it('creates a run even with minimal body', async () => {
      // Route is lenient — creates a run and tries to forward to Runner
      mockFetchFn.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ run_id: 'runner_123' }),
      });
      const res = await app.request('/v1/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId }),
      });
      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
    });
  });

  describe('PATCH /v1/runs/:id', () => {
    it('returns 404 for non-existent run', async () => {
      const res = await app.request('/v1/runs/run_nonexistent', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test' }),
      });
      expect(res.status).toBe(404);
    });

    it('returns 400 for empty body', async () => {
      const runId = generateId('run');
      await insertRun(mockDB, {
        run_id: runId,
        project_id: projectId,
        status: 'completed',
      });
      const res = await app.request(`/v1/runs/${runId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const data: ApiResponse = await res.json();
      expect((data.error as Record<string, unknown>).code).toBe('INVALID_REQUEST');
    });

    it('updates title only (partial update)', async () => {
      const runId = generateId('run');
      await insertRun(mockDB, {
        run_id: runId,
        project_id: projectId,
        status: 'completed',
      });
      const res = await app.request(`/v1/runs/${runId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'My Report' }),
      });
      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      const run = await getRun(mockDB, runId);
      expect(run?.title).toBe('My Report');
    });

    it('updates description only', async () => {
      const runId = generateId('run');
      await insertRun(mockDB, {
        run_id: runId,
        project_id: projectId,
        status: 'completed',
      });
      const res = await app.request(`/v1/runs/${runId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: 'Test run for evaluation' }),
      });
      expect(res.status).toBe(200);
      const run = await getRun(mockDB, runId);
      expect(run?.description).toBe('Test run for evaluation');
    });

    it('updates tags only', async () => {
      const runId = generateId('run');
      await insertRun(mockDB, {
        run_id: runId,
        project_id: projectId,
        status: 'completed',
      });
      const res = await app.request(`/v1/runs/${runId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: ['v2', 'prod', 'baseline'] }),
      });
      expect(res.status).toBe(200);
      const run = await getRun(mockDB, runId);
      expect(run?.tags).toEqual(['v2', 'prod', 'baseline']);
    });

    it('updates all fields together', async () => {
      const runId = generateId('run');
      await insertRun(mockDB, {
        run_id: runId,
        project_id: projectId,
        status: 'completed',
      });
      const res = await app.request(`/v1/runs/${runId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Full Report',
          description: 'A complete test report',
          tags: ['final'],
        }),
      });
      expect(res.status).toBe(200);
      const run = await getRun(mockDB, runId);
      expect(run?.title).toBe('Full Report');
      expect(run?.description).toBe('A complete test report');
      expect(run?.tags).toEqual(['final']);
    });

    it('partial update does not clear other fields', async () => {
      const runId = generateId('run');
      await insertRun(mockDB, {
        run_id: runId,
        project_id: projectId,
        status: 'completed',
      });
      // First set title and tags
      await app.request(`/v1/runs/${runId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Keep Me', tags: ['keep'] }),
      });
      // Then update only description
      await app.request(`/v1/runs/${runId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: 'New description' }),
      });
      const run = await getRun(mockDB, runId);
      expect(run?.title).toBe('Keep Me');
      expect(run?.tags).toEqual(['keep']);
      expect(run?.description).toBe('New description');
    });

    it('validates tags count limit', async () => {
      const runId = generateId('run');
      await insertRun(mockDB, {
        run_id: runId,
        project_id: projectId,
        status: 'completed',
      });
      const tooManyTags = Array.from({ length: 21 }, (_, i) => `tag${i}`);
      const res = await app.request(`/v1/runs/${runId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: tooManyTags }),
      });
      expect(res.status).toBe(400);
      const data: ApiResponse = await res.json();
      expect((data.error as Record<string, unknown>).code).toBe('VALIDATION_FAILED');
    });

    it('updates updatedAt on each PATCH', async () => {
      const runId = generateId('run');
      await insertRun(mockDB, {
        run_id: runId,
        project_id: projectId,
        status: 'completed',
      });
      const before = await getRun(mockDB, runId);
      // Wait a small amount so timestamp differs
      await new Promise((r) => setTimeout(r, 50));
      await app.request(`/v1/runs/${runId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Updated' }),
      });
      const after = await getRun(mockDB, runId);
      expect(new Date(after!.updatedAt).getTime()).toBeGreaterThan(
        new Date(before!.updatedAt).getTime()
      );
    });
  });

  describe('POST /v1/runs/compare', () => {
    it('returns 400 for missing run IDs', async () => {
      const res = await app.request('/v1/runs/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });
  });
});
