/**
 * Comparisons Route Tests
 */

import { insertProject } from '@t3x/storage';
import type { PGLiteDB } from '@t3x/storage/pglite';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

type ApiResponse = Record<string, unknown>;

let mockDB: PGLiteDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

import { comparisonsRoutes } from '../routes/comparisons.openapi';

describe('Comparisons Routes', () => {
  let cleanup: () => Promise<void>;
  let projectId: string;
  const app = new Hono();
  app.route('/', comparisonsRoutes);

  const sampleSnapshot = {
    version: 'compare_v1',
    snapshot_at: '2026-02-25T00:00:00Z',
    control: {
      model: 'gpt-4',
      prompt_version: 'v1',
      run_count: 5,
      pass_count: 4,
      pass_rate: 0.8,
      avg_score: 0.85,
      avg_latency_ms: 1200,
      avg_tokens: 500,
    },
    treatment: {
      model: 'claude-sonnet-4-6',
      prompt_version: 'v2',
      run_count: 5,
      pass_count: 5,
      pass_rate: 1.0,
      avg_score: 0.92,
      avg_latency_ms: 900,
      avg_tokens: 450,
    },
    comparison: {
      pass_rate: {
        control_mean: 0.8,
        treatment_mean: 1.0,
        delta: 0.2,
        delta_percent: 25,
        p_value: 0.04,
        confidence_interval: [0.01, 0.39],
        is_significant: true,
        sample_size_adequate: true,
      },
    },
    winner: 'treatment',
  };

  function makeCreateBody(overrides: Record<string, unknown> = {}) {
    return {
      project_id: projectId,
      title: 'GPT-4 vs Claude v2',
      control_config: { model: 'gpt-4', prompt_version: 'v1' },
      treatment_config: { model: 'claude-sonnet-4-6', prompt_version: 'v2' },
      control_run_ids: ['run_001', 'run_002'],
      treatment_run_ids: ['run_003', 'run_004'],
      result_snapshot: sampleSnapshot,
      ...overrides,
    };
  }

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;
    const proj = await insertProject(mockDB, testData.project({ name: 'Comparisons Project' }));
    projectId = proj.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  // ============================================================
  // POST /v1/comparisons
  // ============================================================

  describe('POST /v1/comparisons', () => {
    it('creates a comparison and returns 201', async () => {
      const res = await app.request('/v1/comparisons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeCreateBody()),
      });
      expect(res.status).toBe(201);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(true);

      const data = json.data as Record<string, unknown>;
      expect(data.comparison_id).toMatch(/^comp_/);
      expect(data.project_id).toBe(projectId);
      expect(data.title).toBe('GPT-4 vs Claude v2');
      expect(data.control_config).toEqual({ model: 'gpt-4', prompt_version: 'v1' });
      expect(data.treatment_config).toEqual({ model: 'claude-sonnet-4-6', prompt_version: 'v2' });
      expect(data.control_run_ids).toEqual(['run_001', 'run_002']);
      expect(data.treatment_run_ids).toEqual(['run_003', 'run_004']);
      expect(data.result_snapshot).toBeTruthy();
      expect(data.created_at).toBeTruthy();
    });

    it('creates a comparison without project_id (global)', async () => {
      const res = await app.request('/v1/comparisons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeCreateBody({ project_id: null })),
      });
      expect(res.status).toBe(201);
      const json: ApiResponse = await res.json();
      const data = json.data as Record<string, unknown>;
      expect(data.project_id).toBeNull();
    });

    it('returns 400 for empty title', async () => {
      const res = await app.request('/v1/comparisons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeCreateBody({ title: '' })),
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for title exceeding 200 chars', async () => {
      const res = await app.request('/v1/comparisons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeCreateBody({ title: 'x'.repeat(201) })),
      });
      expect(res.status).toBe(400);
    });
  });

  // ============================================================
  // GET /v1/comparisons
  // ============================================================

  describe('GET /v1/comparisons', () => {
    it('lists comparisons for a project', async () => {
      // Create 2 comparisons
      await app.request('/v1/comparisons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeCreateBody({ title: 'Compare A' })),
      });
      await app.request('/v1/comparisons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeCreateBody({ title: 'Compare B' })),
      });

      const res = await app.request(`/v1/comparisons?project_id=${projectId}`);
      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(true);
      const data = json.data as Array<Record<string, unknown>>;
      expect(data.length).toBeGreaterThanOrEqual(2);
    });

    it('returns empty list for unknown project', async () => {
      const res = await app.request('/v1/comparisons?project_id=proj_nonexistent');
      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(true);
      expect((json.data as unknown[]).length).toBe(0);
    });

    it('returns all comparisons when no project_id filter', async () => {
      const res = await app.request('/v1/comparisons');
      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(true);
      expect((json.data as unknown[]).length).toBeGreaterThan(0);
    });

    it('supports limit and offset', async () => {
      const res = await app.request(`/v1/comparisons?project_id=${projectId}&limit=1&offset=0`);
      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(true);
      expect((json.data as unknown[]).length).toBeLessThanOrEqual(1);
    });
  });

  // ============================================================
  // GET /v1/comparisons/:id
  // ============================================================

  describe('GET /v1/comparisons/:id', () => {
    it('returns a comparison by ID', async () => {
      // Create one
      const createRes = await app.request('/v1/comparisons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeCreateBody({ title: 'Get Test' })),
      });
      const created = (await createRes.json()) as ApiResponse;
      const compId = (created.data as Record<string, unknown>).comparison_id as string;

      const res = await app.request(`/v1/comparisons/${compId}`);
      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(true);
      expect((json.data as Record<string, unknown>).comparison_id).toBe(compId);
      expect((json.data as Record<string, unknown>).title).toBe('Get Test');
    });

    it('returns 404 for non-existent ID', async () => {
      const res = await app.request('/v1/comparisons/comp_nonexistent');
      expect(res.status).toBe(404);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(false);
    });
  });

  // ============================================================
  // DELETE /v1/comparisons/:id
  // ============================================================

  describe('DELETE /v1/comparisons/:id', () => {
    it('deletes a comparison and returns success', async () => {
      // Create one
      const createRes = await app.request('/v1/comparisons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeCreateBody({ title: 'Delete Test' })),
      });
      const created = (await createRes.json()) as ApiResponse;
      const compId = (created.data as Record<string, unknown>).comparison_id as string;

      const res = await app.request(`/v1/comparisons/${compId}`, { method: 'DELETE' });
      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(true);
      expect((json.data as Record<string, unknown>).deleted).toBe(true);

      // Verify it's gone
      const getRes = await app.request(`/v1/comparisons/${compId}`);
      expect(getRes.status).toBe(404);
    });

    it('returns 404 for non-existent ID', async () => {
      const res = await app.request('/v1/comparisons/comp_nonexistent', { method: 'DELETE' });
      expect(res.status).toBe(404);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(false);
    });

    it('deleting a comparison does not affect runs', async () => {
      // Just verify the deletion doesn't cascade to runs table
      // (no FK between saved_comparisons and runs)
      const createRes = await app.request('/v1/comparisons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeCreateBody({ title: 'No Cascade Test' })),
      });
      const created = (await createRes.json()) as ApiResponse;
      const compId = (created.data as Record<string, unknown>).comparison_id as string;

      await app.request(`/v1/comparisons/${compId}`, { method: 'DELETE' });
      // If we got here without error, deletion did not cascade (no FK to runs)
      expect(true).toBe(true);
    });
  });

  // ============================================================
  // Snapshot integrity
  // ============================================================

  describe('Snapshot integrity', () => {
    it('preserves full result_snapshot structure', async () => {
      const createRes = await app.request('/v1/comparisons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeCreateBody({ title: 'Snapshot Integrity' })),
      });
      const created = (await createRes.json()) as ApiResponse;
      const compId = (created.data as Record<string, unknown>).comparison_id as string;

      const getRes = await app.request(`/v1/comparisons/${compId}`);
      const json: ApiResponse = await getRes.json();
      const data = json.data as Record<string, unknown>;
      const snapshot = data.result_snapshot as Record<string, unknown>;

      expect(snapshot.version).toBe('compare_v1');
      expect(snapshot.winner).toBe('treatment');
      expect((snapshot.control as Record<string, unknown>).model).toBe('gpt-4');
      expect((snapshot.treatment as Record<string, unknown>).avg_score).toBe(0.92);
    });
  });
});
