/**
 * Project Access Control Tests (#508)
 *
 * Tests the multi-tenancy isolation model:
 * - owner_id filtering on findProjects
 * - assertProjectAccess for GET/PUT/DELETE
 * - createProject auto-sets owner_id
 * - AUTH_DISABLED mode (no userId) sees everything
 */

import type { AnyDB } from '@t3x-dev/storage';
import { deleteProject, findProjects, insertProject } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDB } from './setup';

type ApiResponse = Record<string, unknown> & {
  success: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
};

let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// Import routes after mocking
import { projectRoutes } from '../routes/projects.openapi';

/**
 * Helper: create a Hono app that sets apiKey context to simulate an authenticated user.
 */
function createAppWithUser(userId?: string) {
  const app = new Hono();
  if (userId) {
    app.use('*', async (c, next) => {
      // biome-ignore lint/suspicious/noExplicitAny: test mock access
      (c as any).set('apiKey', {
        id: 'ak_test',
        user_id: userId,
        key_prefix: 'test',
        name: 'test',
      });
      return next();
    });
  }
  app.route('/', projectRoutes);
  return app;
}

describe('Project Access Control (#508)', () => {
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    const existingProjects = await findProjects(mockDB, {});
    for (const project of existingProjects) {
      await deleteProject(mockDB, project.projectId);
    }
  });

  // ─── findProjects owner_id filtering ─────────────────────────────

  describe('LIST /v1/projects — owner filtering', () => {
    it('authenticated user sees own projects + public (owner_id=NULL)', async () => {
      // Create: 1 owned by userA, 1 owned by userB, 1 public (no owner)
      await insertProject(mockDB, { name: 'User A Project', ownerId: 'user_aaa' });
      await insertProject(mockDB, { name: 'User B Project', ownerId: 'user_bbb' });
      await insertProject(mockDB, { name: 'Public Project' });

      const app = createAppWithUser('user_aaa');
      const res = await app.request('/v1/projects');
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);

      const projects = (data.data as Record<string, unknown>).projects as Array<{ name: string }>;
      const names = projects.map((p) => p.name);
      expect(names).toContain('User A Project');
      expect(names).toContain('Public Project');
      expect(names).not.toContain('User B Project');
    });

    it('AUTH_DISABLED (no userId) sees all projects', async () => {
      await insertProject(mockDB, { name: 'Owned Project', ownerId: 'user_aaa' });
      await insertProject(mockDB, { name: 'Public Project' });

      const app = createAppWithUser(); // no userId
      const res = await app.request('/v1/projects');
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      const projects = (data.data as Record<string, unknown>).projects as Array<{ name: string }>;
      expect(projects.length).toBe(2);
    });
  });

  // ─── createProject auto-sets owner_id ─────────────────────────────

  describe('POST /v1/projects — auto-set owner_id', () => {
    it('authenticated user creates project with owner_id', async () => {
      const app = createAppWithUser('user_aaa');
      const res = await app.request('/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'My Project' }),
      });
      expect(res.status).toBe(201);

      const data: ApiResponse = await res.json();
      const projectId = (data.data as Record<string, unknown>).project_id as string;

      // Verify in DB that owner_id is set
      const [dbProject] = await findProjects(mockDB, { owner_id: 'user_aaa' });
      expect(dbProject).toBeDefined();
      expect(dbProject.projectId).toBe(projectId);
      expect(dbProject.ownerId).toBe('user_aaa');
    });

    it('AUTH_DISABLED creates project with owner_id=NULL', async () => {
      const app = createAppWithUser(); // no userId
      const res = await app.request('/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Public Project' }),
      });
      expect(res.status).toBe(201);

      const allProjects = await findProjects(mockDB, {});
      expect(allProjects[0].ownerId).toBeNull();
    });
  });

  // ─── assertProjectAccess ──────────────────────────────────────────

  describe('GET /v1/projects/{id} — access control', () => {
    it('owner can access own project', async () => {
      const project = await insertProject(mockDB, { name: 'My Project', ownerId: 'user_aaa' });
      const app = createAppWithUser('user_aaa');

      const res = await app.request(`/v1/projects/${project.projectId}`);
      expect(res.status).toBe(200);
    });

    it('non-owner gets 403', async () => {
      const project = await insertProject(mockDB, { name: 'Not Yours', ownerId: 'user_aaa' });
      const app = createAppWithUser('user_bbb');

      const res = await app.request(`/v1/projects/${project.projectId}`);
      expect(res.status).toBe(403);

      const data: ApiResponse = await res.json();
      expect(data.error?.code).toBe('FORBIDDEN');
    });

    it('public project (owner_id=NULL) accessible by anyone', async () => {
      const project = await insertProject(mockDB, { name: 'Public' });
      const app = createAppWithUser('user_bbb');

      const res = await app.request(`/v1/projects/${project.projectId}`);
      expect(res.status).toBe(200);
    });

    it('AUTH_DISABLED can access any project', async () => {
      const project = await insertProject(mockDB, { name: 'Owned', ownerId: 'user_aaa' });
      const app = createAppWithUser(); // no userId

      const res = await app.request(`/v1/projects/${project.projectId}`);
      expect(res.status).toBe(200);
    });

    it('non-existent project returns 404', async () => {
      const app = createAppWithUser('user_aaa');
      const res = await app.request('/v1/projects/proj_nonexistent');
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /v1/projects/{id} — access control', () => {
    it('owner can delete own project', async () => {
      const project = await insertProject(mockDB, { name: 'Delete Me', ownerId: 'user_aaa' });
      const app = createAppWithUser('user_aaa');

      const res = await app.request(`/v1/projects/${project.projectId}`, { method: 'DELETE' });
      expect(res.status).toBe(200);
    });

    it('non-owner cannot delete', async () => {
      const project = await insertProject(mockDB, { name: 'Protected', ownerId: 'user_aaa' });
      const app = createAppWithUser('user_bbb');

      const res = await app.request(`/v1/projects/${project.projectId}`, { method: 'DELETE' });
      expect(res.status).toBe(403);
    });
  });

  describe('PUT /v1/projects/{id} — access control', () => {
    it('owner can update own project', async () => {
      const project = await insertProject(mockDB, { name: 'Original', ownerId: 'user_aaa' });
      const app = createAppWithUser('user_aaa');

      const res = await app.request(`/v1/projects/${project.projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' }),
      });
      expect(res.status).toBe(200);
    });

    it('non-owner cannot update', async () => {
      const project = await insertProject(mockDB, { name: 'Protected', ownerId: 'user_aaa' });
      const app = createAppWithUser('user_bbb');

      const res = await app.request(`/v1/projects/${project.projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Hacked' }),
      });
      expect(res.status).toBe(403);
    });
  });
});
