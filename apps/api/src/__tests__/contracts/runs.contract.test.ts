/**
 * Runs API Contract Tests
 *
 * These tests ensure the API response schema doesn't change unexpectedly.
 * This protects the Runner/n8n integration from breaking due to schema changes.
 *
 * IMPORTANT: If these tests fail after a refactor, you need to update:
 * 1. apps/web/src/lib/api.ts - EngineRunRaw interface and parseEngineRun function
 * 2. apps/runner/src/types.ts - if Runner consumes this API
 */

import { insertRun, deleteRun, listRuns } from '@t3x/storage';
import type { PGLiteDB } from '@t3x/storage/pglite';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDB } from '../setup';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiResponse = any;

// Mock the database module before importing routes
let mockDB: PGLiteDB;

vi.mock('../../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// Import routes after mocking
import { runsRoutes } from '../../routes/runs';

describe('Runs API Contract', () => {
  let cleanup: () => Promise<void>;
  const app = new Hono();
  app.route('/', runsRoutes);

  const testRunId = 'run_contract_test';

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    // Clean up test runs
    const existingRuns = await listRuns(mockDB, {});
    for (const run of existingRuns) {
      await deleteRun(mockDB, run.runId);
    }
  });

  describe('GET /v1/runs - List runs response schema', () => {
    it('returns runs array with camelCase field names', async () => {
      // Insert test run
      await insertRun(mockDB, {
        run_id: testRunId,
        project_id: null,
        runner_run_id: 'runner_test_123',
        commit_ref: null,
        leaf_json: JSON.stringify({ id: 'agent-1', type: 'deploy' }),
        inputs_json: JSON.stringify({ test: true }),
        workflow_json: JSON.stringify({ type: 'n8n', webhook_id: 'test-webhook' }),
        status: 'completed',
        result_json: JSON.stringify({ run_report: { output: 'success' } }),
      });

      const res = await app.request('/v1/runs');
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.runs).toBeInstanceOf(Array);
      expect(data.data.runs.length).toBeGreaterThan(0);

      const run = data.data.runs[0];

      // CRITICAL: These field names must be camelCase
      // If this fails, frontend EngineRunRaw interface needs updating
      expect(run).toHaveProperty('runId');
      expect(run).toHaveProperty('projectId');
      expect(run).toHaveProperty('runnerRunId');
      expect(run).toHaveProperty('commitRef');
      expect(run).toHaveProperty('leafJson');
      expect(run).toHaveProperty('inputsJson');
      expect(run).toHaveProperty('workflowJson');
      expect(run).toHaveProperty('status');
      expect(run).toHaveProperty('resultJson');
      expect(run).toHaveProperty('createdAt');
      expect(run).toHaveProperty('updatedAt');

      // Should NOT have snake_case versions
      expect(run).not.toHaveProperty('run_id');
      expect(run).not.toHaveProperty('project_id');
      expect(run).not.toHaveProperty('runner_run_id');
      expect(run).not.toHaveProperty('leaf_json');
      expect(run).not.toHaveProperty('created_at');
    });

    it('returns correct data types', async () => {
      await insertRun(mockDB, {
        run_id: testRunId,
        project_id: 'proj_123',
        runner_run_id: 'runner_test_123',
        commit_ref: 'abc123',
        leaf_json: JSON.stringify({ id: 'agent-1', type: 'deploy' }),
        inputs_json: JSON.stringify({ test: true }),
        workflow_json: JSON.stringify({ type: 'n8n', webhook_id: 'test-webhook' }),
        status: 'running',
        result_json: null,
      });

      const res = await app.request('/v1/runs');
      const data: ApiResponse = await res.json();
      const run = data.data.runs[0];

      // Type checks
      expect(typeof run.runId).toBe('string');
      expect(run.projectId === null || typeof run.projectId === 'string').toBe(true);
      expect(run.runnerRunId === null || typeof run.runnerRunId === 'string').toBe(true);
      expect(typeof run.leafJson).toBe('string'); // JSON string, not parsed object
      expect(typeof run.status).toBe('string');
      expect(['queued', 'running', 'completed', 'failed']).toContain(run.status);
    });

    it('returns pagination fields', async () => {
      const res = await app.request('/v1/runs?limit=10&offset=0');
      const data: ApiResponse = await res.json();

      expect(data.data).toHaveProperty('runs');
      expect(data.data).toHaveProperty('limit');
      expect(data.data).toHaveProperty('offset');
      expect(typeof data.data.limit).toBe('number');
      expect(typeof data.data.offset).toBe('number');
    });
  });

  describe('GET /v1/runs/:id - Single run response schema', () => {
    it('returns single run with camelCase field names', async () => {
      await insertRun(mockDB, {
        run_id: testRunId,
        project_id: null,
        runner_run_id: 'runner_test_123',
        commit_ref: null,
        leaf_json: JSON.stringify({ id: 'agent-1', type: 'deploy' }),
        inputs_json: JSON.stringify({ test: true }),
        workflow_json: JSON.stringify({ type: 'n8n', webhook_id: 'test-webhook' }),
        status: 'completed',
        result_json: JSON.stringify({ run_report: { output: 'success' } }),
      });

      const res = await app.request(`/v1/runs/${testRunId}`);
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);

      const run = data.data;

      // Same schema as list endpoint
      expect(run).toHaveProperty('runId');
      expect(run).toHaveProperty('leafJson');
      expect(run).toHaveProperty('createdAt');
      expect(run).not.toHaveProperty('run_id');
    });

    it('returns 404 for non-existent run', async () => {
      const res = await app.request('/v1/runs/run_nonexistent');
      expect(res.status).toBe(404);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('NOT_FOUND');
    });
  });

  describe('POST /v1/runs - Create run response schema', () => {
    it('returns created run info with expected fields', async () => {
      const res = await app.request('/v1/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leaf: { id: 'test-agent', type: 'deploy' },
          inputs: { test: true },
          workflow: { type: 'n8n', webhook_id: 'test-webhook' },
        }),
      });

      // May fail if Runner is not available, but schema should be consistent
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('run_id'); // Response uses snake_case for this endpoint
      expect(data.data).toHaveProperty('status');
      expect(typeof data.data.run_id).toBe('string');
      expect(data.data.run_id).toMatch(/^run_/);
    });
  });

  describe('POST /v1/runs/ingest - Ingest callback schema', () => {
    it('accepts valid ingest payload', async () => {
      // First create a run
      await insertRun(mockDB, {
        run_id: testRunId,
        project_id: null,
        runner_run_id: 'runner_test_123',
        commit_ref: null,
        leaf_json: null,
        inputs_json: null,
        workflow_json: null,
        status: 'running',
        result_json: null,
      });

      const res = await app.request('/v1/runs/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          run_id: testRunId,
          runner_run_id: 'runner_test_123',
          status: 'completed',
          run_report: { output: { text: 'hello' }, meta: { latency_ms: 100 } },
          assertions: [],
          evidence_pack: { n8n_output: { text: 'hello' } },
        }),
      });

      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
    });

    it('rejects invalid status values', async () => {
      const res = await app.request('/v1/runs/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          run_id: 'run_test',
          runner_run_id: 'runner_test',
          status: 'invalid_status', // Invalid
        }),
      });

      expect(res.status).toBe(400);
    });
  });
});
