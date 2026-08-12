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
import { deleteProject, findProjectById, findProjects, insertProject } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDB } from './setup';

type ApiResponse = Record<string, unknown> & {
  success: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
};

let mockDB: AnyDB;
const originalOperatorUserIds = process.env.T3X_OPERATOR_USER_IDS;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

import { importRoutes } from '../routes/import.openapi';
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
        project_id: null,
        principal_kind: 'human',
        key_prefix: 'test',
        name: 'test',
      });
      return next();
    });
  }
  app.route('/', projectRoutes);
  app.route('/', importRoutes);
  return app;
}

function createAppWithProjectAgent(projectId: string | null) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    // biome-ignore lint/suspicious/noExplicitAny: test mock access
    (c as any).set('apiKey', {
      id: 'ak_agent',
      user_id: null,
      project_id: projectId,
      principal_kind: 'agent',
      transition_scopes: ['transition:inspect'],
      key_prefix: 't3xk_age',
      name: 'Project agent',
    });
    return next();
  });
  app.route('/', projectRoutes);
  app.route('/', importRoutes);
  return app;
}

function createAppWithProjectUser(userId: string, projectId: string) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    // biome-ignore lint/suspicious/noExplicitAny: test mock access
    (c as any).set('apiKey', {
      id: 'ak_project_user',
      user_id: userId,
      project_id: projectId,
      principal_kind: 'human',
      transition_scopes: [],
      key_prefix: 't3xk_hum',
      name: 'Project-bound human',
    });
    return next();
  });
  app.route('/', projectRoutes);
  return app;
}

function cfpack(name: string) {
  return {
    version: '2.0.0',
    project: {
      project_id: 'project_exported',
      name,
      created_at: '2026-08-11T00:00:00.000Z',
    },
    conversations: [],
    turns: [],
    leaves: [],
    pins: [],
    meta: {
      exported_at: '2026-08-11T00:00:00.000Z',
      exported_by: 'project-access-test',
      format_version: '2.0.0',
    },
  };
}

describe('Project Access Control (#508)', () => {
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;
  });

  afterAll(async () => {
    if (originalOperatorUserIds === undefined) delete process.env.T3X_OPERATOR_USER_IDS;
    else process.env.T3X_OPERATOR_USER_IDS = originalOperatorUserIds;
    await cleanup();
  });

  beforeEach(async () => {
    delete process.env.T3X_OPERATOR_USER_IDS;
    const existingProjects = await findProjects(mockDB, {});
    for (const project of existingProjects) {
      await deleteProject(mockDB, project.projectId);
    }
  });

  // ─── findProjects owner_id filtering ─────────────────────────────

  describe('LIST /v1/projects — owner filtering', () => {
    it('authenticated user sees only their owned projects', async () => {
      // Create: 1 owned by userA, 1 owned by userB, 1 legacy unowned project.
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
      expect(names).not.toContain('Public Project');
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

    it('project-scoped agent cannot create a project outside its binding', async () => {
      const bound = await insertProject(mockDB, { name: 'Agent bound project' });
      const app = createAppWithProjectAgent(bound.projectId);

      const res = await app.request('/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Escaped project' }),
      });

      expect(res.status).toBe(403);
      expect((await findProjects(mockDB, {})).map((project) => project.name)).toEqual([
        'Agent bound project',
      ]);
    });

    it('global agent cannot create an unowned project', async () => {
      const app = createAppWithProjectAgent(null);

      const res = await app.request('/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Global agent project' }),
      });

      expect(res.status).toBe(403);
      expect(await findProjects(mockDB, {})).toEqual([]);
    });
  });

  describe('POST /v1/import/cfpack — imported project ownership', () => {
    it('assigns the authenticated user as owner of the imported project', async () => {
      const app = createAppWithUser('user_aaa');
      const res = await app.request('/v1/import/cfpack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfpack('Owned import')),
      });

      expect(res.status).toBe(200);
      const payload: ApiResponse = await res.json();
      const projectId = (payload.data as Record<string, unknown>).project_id as string;
      expect((await findProjectById(mockDB, projectId))?.ownerId).toBe('user_aaa');
    });

    it('project-scoped agent cannot import a new project', async () => {
      const bound = await insertProject(mockDB, { name: 'Agent import boundary' });
      const app = createAppWithProjectAgent(bound.projectId);

      const res = await app.request('/v1/import/cfpack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfpack('Escaped import')),
      });

      expect(res.status).toBe(403);
      expect((await findProjects(mockDB, {})).map((project) => project.name)).toEqual([
        'Agent import boundary',
      ]);
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

    it('legacy unowned project is inaccessible until claimed', async () => {
      const project = await insertProject(mockDB, { name: 'Legacy unowned' });
      const app = createAppWithUser('user_bbb');

      const res = await app.request(`/v1/projects/${project.projectId}`);
      expect(res.status).toBe(403);
    });

    it('AUTH_DISABLED can access any project', async () => {
      const project = await insertProject(mockDB, { name: 'Owned', ownerId: 'user_aaa' });
      const app = createAppWithUser(); // no userId

      const res = await app.request(`/v1/projects/${project.projectId}`);
      expect(res.status).toBe(200);
    });

    it('project-scoped agents can access only their bound project', async () => {
      const bound = await insertProject(mockDB, { name: 'Agent bound project' });
      const other = await insertProject(mockDB, { name: 'Other public project' });
      const app = createAppWithProjectAgent(bound.projectId);

      expect((await app.request(`/v1/projects/${bound.projectId}`)).status).toBe(200);
      expect((await app.request(`/v1/projects/${other.projectId}`)).status).toBe(403);
    });

    it('global machine credentials cannot access any project', async () => {
      const project = await insertProject(mockDB, { name: 'No global machine access' });
      const app = createAppWithProjectAgent(null);

      expect((await app.request(`/v1/projects/${project.projectId}`)).status).toBe(403);
    });

    it('project-bound human credentials can access only their exact project', async () => {
      const bound = await insertProject(mockDB, { name: 'Bound legacy project' });
      const other = await insertProject(mockDB, { name: 'Other legacy project' });
      const app = createAppWithProjectUser('user_reviewer', bound.projectId);

      expect((await app.request(`/v1/projects/${bound.projectId}`)).status).toBe(200);
      expect((await app.request(`/v1/projects/${other.projectId}`)).status).toBe(403);
    });

    it('non-existent project returns 404', async () => {
      const app = createAppWithUser('user_aaa');
      const res = await app.request('/v1/projects/proj_nonexistent');
      expect(res.status).toBe(404);
    });
  });

  describe('legacy unowned project recovery', () => {
    it('lets an explicitly configured human operator list and atomically claim projects', async () => {
      process.env.T3X_OPERATOR_USER_IDS = 'user_operator';
      const legacy = await insertProject(mockDB, { name: 'Legacy unowned' });
      const alreadyOwned = await insertProject(mockDB, {
        name: 'Already owned',
        ownerId: 'user_other',
      });
      const app = createAppWithUser('user_operator');

      const listRes = await app.request('/v1/projects/unowned');
      expect(listRes.status).toBe(200);
      const listed: ApiResponse = await listRes.json();
      const projects = (listed.data as { projects: Array<{ project_id: string }> }).projects;
      expect(projects.map((project) => project.project_id)).toEqual([legacy.projectId]);

      const claimRes = await app.request('/v1/projects/claim-unowned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_ids: [legacy.projectId, alreadyOwned.projectId] }),
      });
      expect(claimRes.status).toBe(200);
      const claimed: ApiResponse = await claimRes.json();
      expect(
        (claimed.data as { projects: Array<{ project_id: string }> }).projects.map(
          (project) => project.project_id
        )
      ).toEqual([legacy.projectId]);
      expect((await findProjectById(mockDB, legacy.projectId))?.ownerId).toBe('user_operator');
      expect((await findProjectById(mockDB, alreadyOwned.projectId))?.ownerId).toBe('user_other');
      expect((await app.request(`/v1/projects/${legacy.projectId}`)).status).toBe(200);
    });

    it('rejects ordinary authenticated users', async () => {
      const legacy = await insertProject(mockDB, { name: 'Legacy unowned' });
      const app = createAppWithUser('user_member');

      expect((await app.request('/v1/projects/unowned')).status).toBe(403);
      expect(
        (
          await app.request('/v1/projects/claim-unowned', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project_ids: [legacy.projectId] }),
          })
        ).status
      ).toBe(403);
      expect((await findProjectById(mockDB, legacy.projectId))?.ownerId).toBeNull();
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
