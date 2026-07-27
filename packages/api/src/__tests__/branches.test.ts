/**
 * Branches Route Tests
 */

import type { AnyDB } from '@t3x-dev/storage';
import { insertProject } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

// biome-ignore lint/suspicious/noExplicitAny: test helper
type ApiResponse = any;

let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

import { branchRoutes } from '../routes/branches.openapi';

describe('Branches Routes', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  const app = new Hono();
  app.route('/', branchRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    const project = await insertProject(mockDB, testData.project({ name: 'Branches Test' }));
    testProjectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  // =========================================================================
  // GET /v1/branches
  // =========================================================================
  describe('GET /v1/branches', () => {
    it('returns 400 without project_id', async () => {
      const res = await app.request('/v1/branches');
      expect(res.status).toBe(400);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_REQUEST');
    });

    it('backfills main for a project with no registered branches', async () => {
      const res = await app.request(`/v1/branches?project_id=${testProjectId}`);
      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.branches).toEqual([
        expect.objectContaining({ name: 'main', is_current: true }),
      ]);
    });

    it('returns branches after creation', async () => {
      // Create a branch first
      await app.request('/v1/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: testProjectId, name: 'listed-feature' }),
      });

      const res = await app.request(`/v1/branches?project_id=${testProjectId}`);
      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.data.branches.map((branch: { name: string }) => branch.name)).toEqual(
        expect.arrayContaining(['main', 'listed-feature'])
      );
    });
  });

  // =========================================================================
  // POST /v1/branches
  // =========================================================================
  describe('POST /v1/branches', () => {
    it('creates a new branch', async () => {
      const res = await app.request('/v1/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          name: 'feature-test',
          description: 'A test branch',
        }),
      });

      expect(res.status).toBe(201);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('feature-test');
      expect(data.data.description).toBe('A test branch');
      expect(data.data.branch_id).toBeDefined();
    });

    it('returns 400 for missing fields', async () => {
      const res = await app.request('/v1/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: testProjectId }),
      });

      expect(res.status).toBe(400);
      const data: ApiResponse = await res.json();
      expect(data.error.code).toBe('INVALID_REQUEST');
    });

    it('returns 404 for non-existent project', async () => {
      const res = await app.request('/v1/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: 'proj_nonexistent', name: 'test' }),
      });

      expect(res.status).toBe(404);
      const data: ApiResponse = await res.json();
      expect(data.error.code).toBe('NOT_FOUND');
    });

    it('returns the existing branch for an identical create intent', async () => {
      const res = await app.request('/v1/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: testProjectId, name: 'feature-test' }),
      });

      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('feature-test');
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await app.request('/v1/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      });

      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // GET /v1/branches/current
  // =========================================================================
  describe('GET /v1/branches/current', () => {
    it('returns 400 without project_id', async () => {
      const res = await app.request('/v1/branches/current');
      expect(res.status).toBe(400);
    });

    it('returns current branch after switching', async () => {
      // Switch to main
      await app.request('/v1/branches/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: testProjectId, branch_name: 'main' }),
      });

      const res = await app.request(`/v1/branches/current?project_id=${testProjectId}`);
      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('main');
      expect(data.data.is_current).toBe(true);
    });
  });

  // =========================================================================
  // POST /v1/branches/switch
  // =========================================================================
  describe('POST /v1/branches/switch', () => {
    it('switches to existing branch', async () => {
      const res = await app.request('/v1/branches/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: testProjectId, branch_name: 'feature-test' }),
      });

      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('feature-test');
    });

    it('returns 404 for non-existent branch', async () => {
      const res = await app.request('/v1/branches/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: testProjectId, branch_name: 'no-such-branch' }),
      });

      expect(res.status).toBe(404);
    });

    it('creates branch when create_if_missing is true', async () => {
      const res = await app.request('/v1/branches/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          branch_name: 'auto-created',
          create_if_missing: true,
        }),
      });

      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.data.name).toBe('auto-created');
    });

    it('repairs and switches to main when it is missing', async () => {
      const project = await insertProject(mockDB, testData.project({ name: 'Missing Main' }));

      const res = await app.request('/v1/branches/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: project.projectId, branch_name: 'main' }),
      });

      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.data).toMatchObject({ name: 'main', is_current: true });
    });

    it('returns 400 for missing fields', async () => {
      const res = await app.request('/v1/branches/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: testProjectId }),
      });

      expect(res.status).toBe(400);
    });
  });
});
