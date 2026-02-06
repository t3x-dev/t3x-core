/**
 * Runs Route Tests
 */

import { deleteRun, insertProject, insertRun, listRuns } from '@t3x/storage';
import type { PGLiteDB } from '@t3x/storage/pglite';
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
