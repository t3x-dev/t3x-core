/**
 * Runs Route Tests
 */

import type { AnyDB } from '@t3x-dev/storage';
import { deleteRun, getRun, insertProject, insertRun, listRuns } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateId, setupTestDB, testData } from './setup';

type ApiResponse = Record<string, unknown>;

let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// Mock fetch for Runner service calls
const mockFetchFn = vi.fn();
vi.stubGlobal('fetch', mockFetchFn);

import { comparisonsRoutes } from '../routes/comparisons.openapi';
import { runsRoutes } from '../routes/runs.openapi';

describe('Runs Routes', () => {
  const originalRunnerServiceToken = process.env.RUNNER_SERVICE_TOKEN;
  let cleanup: () => Promise<void>;
  let projectId: string;
  const app = new Hono();
  app.route('/', runsRoutes);
  app.route('/', comparisonsRoutes);

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
    if (originalRunnerServiceToken === undefined) delete process.env.RUNNER_SERVICE_TOKEN;
    else process.env.RUNNER_SERVICE_TOKEN = originalRunnerServiceToken;
  });

  beforeEach(async () => {
    process.env.RUNNER_SERVICE_TOKEN = 'runner-test-secret';
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
      expect(mockFetchFn).toHaveBeenCalledWith(
        expect.stringContaining('/runs'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer runner-test-secret' }),
          body: expect.stringContaining(`"project_id":"${projectId}"`),
        })
      );
    });

    it('rejects a run without project scope', async () => {
      const res = await app.request('/v1/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      expect(mockFetchFn).not.toHaveBeenCalled();
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
      expect((data.error as Record<string, unknown>).code).toBe('INVALID_REQUEST');
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

    it('prepares two configurations from Runner callbacks and saves their project comparison', async () => {
      const other = await insertProject(
        mockDB,
        testData.project({ name: 'Other evaluation project' })
      );
      const model = 'actual-runner-model';
      const versions = ['v1', 'v2'] as const;
      const headers = { 'Content-Type': 'application/json' };
      const post = (path: string, body: unknown, runner = false) =>
        app.request(path, {
          method: 'POST',
          headers: runner ? { ...headers, Authorization: 'Bearer runner-test-secret' } : headers,
          body: JSON.stringify(body),
        });
      const runIds: string[] = [];
      for (const prompt_version of versions) {
        const runnerId = `runner-${prompt_version}`;
        mockFetchFn.mockResolvedValueOnce(
          Response.json({ success: true, data: { runner_run_id: runnerId } })
        );
        const created = await post('/v1/runs', {
          project_id: projectId,
          leaf: { id: `quick-${prompt_version}`, type: 'eval', content: 'Weather test' },
          workflow: { type: 'n8n', webhook_id: 'https://workflow.example.test/eval' },
          metadata: { prompt_version, test_case: 'weather-query' },
        });
        expect(created.status).toBe(200);
        const {
          data: { run_id },
        } = (await created.json()) as { data: { run_id: string } };
        runIds.push(run_id);
        const ingest = await post(
          '/v1/runs/ingest',
          {
            run_id,
            runner_run_id: runnerId,
            status: prompt_version === 'v1' ? 'failed' : 'completed',
            metadata: { model },
            run_report: { eval_result: { passed: prompt_version === 'v2', score: 0.8 } },
          },
          true
        );
        expect(ingest.status).toBe(200);
      }

      await insertRun(mockDB, {
        run_id: 'other-project-sample',
        project_id: other.projectId,
        status: 'completed',
        metadata_json: JSON.stringify({ model, prompt_version: 'v1' }),
      });
      const control = { model, prompt_version: 'v1' };
      const treatment = { model, prompt_version: 'v2' };
      const configs = await app.request(`/v1/runs/configurations?project_id=${projectId}`);
      await expect(configs.json()).resolves.toMatchObject({
        data: {
          configurations: expect.arrayContaining([
            expect.objectContaining({ ...control, run_count: 1 }),
            expect.objectContaining({ ...treatment, run_count: 1 }),
          ]),
        },
      });
      const result = await post('/v1/runs/compare', { project_id: projectId, control, treatment });
      expect(result.status).toBe(200);
      const comparison = (await result.json()) as { data: Record<string, unknown> };
      expect(comparison.data).toMatchObject({
        control: { ...control, run_count: 1, pass_count: 0 },
        treatment: { ...treatment, run_count: 1, pass_count: 1 },
      });

      const saved = await post('/v1/comparisons', {
        project_id: projectId,
        title: 'Weather v1 versus v2',
        control_config: control,
        treatment_config: treatment,
        control_run_ids: [runIds[0]],
        treatment_run_ids: [runIds[1]],
        result_snapshot: comparison.data,
      });
      expect(saved.status).toBe(201);
      const {
        data: { comparison_id },
      } = (await saved.json()) as { data: { comparison_id: string } };
      const history = await app.request(`/v1/comparisons?project_id=${projectId}`);
      await expect(history.json()).resolves.toMatchObject({
        data: [{ comparison_id, project_id: projectId, control_run_ids: [runIds[0]] }],
      });
      const snapshot = `/v1/comparisons/${comparison_id}`;
      const wrongProject = `${snapshot}?project_id=${other.projectId}`;
      expect((await app.request(wrongProject)).status).toBe(404);
      expect((await app.request(wrongProject, { method: 'DELETE' })).status).toBe(404);
      const read = await app.request(`${snapshot}?project_id=${projectId}`);
      await expect(read.json()).resolves.toMatchObject({
        data: { comparison_id, project_id: projectId, result_snapshot: comparison.data },
      });
    });
  });
});
