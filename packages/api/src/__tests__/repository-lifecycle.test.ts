import {
  type AnyDB,
  deleteProject,
  insertPersonalNamespace,
  insertProject,
  users,
} from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ProjectLifecyclePolicyDeniedError } from '../lib/project-lifecycle-policy';
import { projectRoutes } from '../routes/projects.openapi';
import { repositoryPathRoutes } from '../routes/repository-paths.openapi';
import { setupTestDB } from './setup';

let db: AnyDB;
vi.mock('../lib/db', () => ({ getDB: () => Promise.resolve(db) }));

function appFor(principal?: string, scope?: string, kind = 'human', denyRestore = false) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    if (principal)
      c.set('apiKey', {
        id: principal,
        user_id: kind === 'human' ? principal : null,
        principal_kind: kind,
        project_id: scope ?? null,
      });
    if (denyRestore)
      c.set('projectLifecyclePolicy', {
        execute: () => {
          throw new ProjectLifecyclePolicyDeniedError(
            'RESTORE_DENIED',
            'Restore admission denied',
            409
          );
        },
      });
    await next();
  });
  app.route('/', repositoryPathRoutes);
  app.route('/', projectRoutes);
  return app;
}

const json = (method: string, body: unknown) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('repository deletion, restoration and name reuse', () => {
  let setup: Awaited<ReturnType<typeof setupTestDB>>;
  let namespaceId: string;
  const originalAuth = process.env.AUTH_DISABLED;
  beforeAll(async () => {
    process.env.AUTH_DISABLED = 'false';
    setup = await setupTestDB();
    db = setup.db;
    await db.insert(users).values({ id: 'lifecycle-owner', emailVerified: true });
    namespaceId = (
      await insertPersonalNamespace(db, { slug: 'lifecycle', ownerUserId: 'lifecycle-owner' })
    ).namespaceId;
  });
  afterAll(async () => {
    if (originalAuth === undefined) delete process.env.AUTH_DISABLED;
    else process.env.AUTH_DISABLED = originalAuth;
    await setup?.cleanup();
  });

  it('rejects permanent deletion from a stale deleted list after another actor restores the repository', async () => {
    const app = appFor('lifecycle-owner');
    const p = await insertProject(db, { name: 'RestoredBeforePurge', namespaceId });
    await deleteProject(db, p.projectId);
    expect(
      (await app.request(`/v1/projects/${p.projectId}/restore`, { method: 'POST' })).status
    ).toBe(200);
    const url = `/v1/projects/${p.projectId}?permanent=true&only_if_deleted=true`;
    const stale = await app.request(url, { method: 'DELETE' });
    expect(stale.status).toBe(409);
    expect((await stale.json()).error.code).toBe('REPOSITORY_STATE_CHANGED');
    expect((await app.request(`/v1/projects/${p.projectId}`)).status).toBe(200);
    await deleteProject(db, p.projectId);
    expect((await app.request(url, { method: 'DELETE' })).status).toBe(200);
    const name = await app.request(
      '/v1/repository-name?namespace=lifecycle&name=RestoredBeforePurge'
    );
    expect((await name.json()).data.available).toBe(true);
  });

  it('keeps aliases through soft deletion and restore, then releases them for a new identity', async () => {
    const app = appFor('lifecycle-owner');
    const p = await insertProject(db, { name: 'Old', namespaceId });
    expect(
      (await app.request(`/v1/projects/${p.projectId}`, json('PUT', { name: 'Current' }))).status
    ).toBe(200);
    expect((await app.request(`/v1/projects/${p.projectId}`, { method: 'DELETE' })).status).toBe(
      200
    );
    const deleted = await app.request('/v1/projects?status=deleted&namespace=lifecycle');
    expect(deleted.status).toBe(200);
    const deletedData = (await deleted.json()).data;
    expect(deletedData.status).toBe('deleted');
    expect(deletedData.projects).toEqual([
      expect.objectContaining({
        project_id: p.projectId,
        name: 'Current',
        deleted_at: expect.any(String),
        can_restore: true,
        can_permanently_delete: true,
      }),
    ]);
    const active = await app.request('/v1/projects?namespace=lifecycle');
    expect((await active.json()).data.projects).toEqual([]);
    for (const name of ['Old', 'Current']) {
      expect((await app.request(`/v1/repositories/lifecycle/${name}`)).status).toBe(404);
      const check = await app.request(`/v1/repository-name?namespace=lifecycle&name=${name}`);
      expect((await check.json()).data.available).toBe(false);
      expect(
        (await app.request('/v1/projects', json('POST', { name, namespace: 'lifecycle' }))).status
      ).toBe(409);
    }
    const restored = await app.request(`/v1/projects/${p.projectId}/restore`, { method: 'POST' });
    expect(restored.status).toBe(200);
    expect((await restored.json()).data.project_id).toBe(p.projectId);
    for (const name of ['Old', 'Current']) {
      const address = await app.request(`/v1/repositories/lifecycle/${name}`);
      expect((await address.json()).data.project_id).toBe(p.projectId);
    }
    expect((await app.request(`/v1/projects/${p.projectId}`, { method: 'DELETE' })).status).toBe(
      200
    );
    expect(
      (await app.request(`/v1/projects/${p.projectId}?permanent=true`, { method: 'DELETE' })).status
    ).toBe(200);
    expect(
      (await app.request(`/v1/projects/${p.projectId}/restore`, { method: 'POST' })).status
    ).toBe(404);
    for (const name of ['Old', 'Current']) {
      const check = await app.request(`/v1/repository-name?namespace=lifecycle&name=${name}`);
      expect((await check.json()).data.available).toBe(true);
      const created = await app.request(
        '/v1/projects',
        json('POST', { name, namespace: 'lifecycle' })
      );
      expect(created.status).toBe(201);
      const replacement = (await created.json()).data;
      expect(replacement.project_id).not.toBe(p.projectId);
      const address = await app.request(`/v1/repositories/lifecycle/${name}`);
      expect((await address.json()).data.project_id).toBe(replacement.project_id);
    }
  });

  it('filters management authority before pagination and enforces it again on mutations', async () => {
    const a = await insertProject(db, { name: 'Managed-A', namespaceId });
    const b = await insertProject(db, { name: 'Managed-B', namespaceId });
    await deleteProject(db, a.projectId);
    await deleteProject(db, b.projectId);
    for (const [id, role, status] of [
      ['viewer', 'viewer', 'active'],
      ['editor', 'editor', 'active'],
      ['admin', 'admin', 'active'],
      ['revoked', 'admin', 'revoked'],
    ]) {
      await setup.sql`INSERT INTO namespace_memberships(membership_id, namespace_id, principal_kind, principal_id, role, status, revoked_at)
        VALUES (${`lifecycle-${id}`}, ${namespaceId}, 'human', ${id}, ${role}, ${status}, ${status === 'revoked' ? new Date() : null})`;
    }
    for (const id of ['guest', 'expired', 'revoked']) {
      await setup.sql`INSERT INTO project_grants(grant_id, project_id, namespace_id, principal_kind, principal_id, role, status, created_at, expires_at)
        VALUES (${`grant-${id}`}, ${a.projectId}, ${namespaceId}, 'human', ${id}, 'admin', 'active', ${new Date(0)}, ${id === 'expired' ? new Date(1000) : null})`;
    }
    for (const id of ['viewer', 'editor', 'outsider', 'expired', 'revoked']) {
      const app = appFor(id);
      const list = await app.request('/v1/projects?status=deleted&limit=1');
      expect(list.status).toBe(200);
      const listData = (await list.json()).data;
      expect(listData.status).toBe('deleted');
      expect(listData.projects).toEqual([]);
      expect(
        (await app.request(`/v1/projects/${a.projectId}/restore`, { method: 'POST' })).status
      ).toBe(403);
      expect(
        (await app.request(`/v1/projects/${a.projectId}?permanent=true`, { method: 'DELETE' }))
          .status
      ).toBe(403);
    }
    const guest = await appFor('guest').request('/v1/projects?status=deleted&limit=1');
    expect(
      (await guest.json()).data.projects.map((p: { project_id: string }) => p.project_id)
    ).toEqual([a.projectId]);
    const scoped = await appFor('admin', a.projectId).request('/v1/projects?status=deleted');
    expect(
      (await scoped.json()).data.projects.map((p: { project_id: string }) => p.project_id)
    ).toEqual([a.projectId]);
    const first = (
      await (await appFor('admin').request('/v1/projects?status=deleted&cursor=&limit=1')).json()
    ).data;
    expect(first.status).toBe('deleted');
    expect(first.items).toHaveLength(1);
    expect(first.has_more).toBe(true);
    const second = (
      await (
        await appFor('admin').request(
          `/v1/projects?status=deleted&limit=1&cursor=${encodeURIComponent(first.next_cursor)}`
        )
      ).json()
    ).data;
    expect(second.items).toHaveLength(1);
    expect(second.has_more).toBe(false);
    expect(
      new Set([...first.items, ...second.items].map((p: { project_id: string }) => p.project_id))
    ).toEqual(new Set([a.projectId, b.projectId]));
    expect((await appFor().request('/v1/projects?status=deleted')).status).toBe(403);
    expect((await appFor('admin').request('/v1/projects?status=all')).status).toBe(400);
  });

  it('requires exact project scope for machine management lists', async () => {
    const p = await insertProject(db, { name: 'Machine', namespaceId });
    await deleteProject(db, p.projectId);
    await setup.sql`INSERT INTO namespace_memberships(membership_id, namespace_id, principal_kind, principal_id, role, status)
      VALUES ('machine-membership', ${namespaceId}, 'service', 'machine', 'admin', 'active')`;
    const unscoped = await appFor('machine', undefined, 'service').request(
      '/v1/projects?status=deleted'
    );
    expect((await unscoped.json()).data.projects).toEqual([]);
    const scoped = await appFor('machine', p.projectId, 'service').request(
      '/v1/projects?status=deleted'
    );
    expect((await scoped.json()).data.projects).toEqual([
      expect.objectContaining({ project_id: p.projectId, can_restore: true }),
    ]);
  });

  it('keeps data and claims when restore admission is denied', async () => {
    const p = await insertProject(db, { name: 'Denied-Restore', namespaceId });
    await deleteProject(db, p.projectId);
    const denied = await appFor('lifecycle-owner', undefined, 'human', true).request(
      `/v1/projects/${p.projectId}/restore`,
      { method: 'POST' }
    );
    expect(denied.status).toBe(409);
    expect((await denied.json()).error.code).toBe('RESTORE_DENIED');
    const check = await appFor('lifecycle-owner').request(
      '/v1/repository-name?namespace=lifecycle&name=Denied-Restore'
    );
    expect((await check.json()).data.available).toBe(false);
    expect((await appFor('lifecycle-owner').request(`/v1/projects/${p.projectId}`)).status).toBe(
      404
    );
  });
});
