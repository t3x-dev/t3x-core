import type { AnyDB } from '@t3x-dev/storage';
import { insertPersonalNamespace, insertProject, users } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { projectRoutes } from '../routes/projects.openapi';
import { repositoryPathRoutes } from '../routes/repository-paths.openapi';
import { setupTestDB } from './setup';

let db: AnyDB;
vi.mock('../lib/db', () => ({ getDB: () => Promise.resolve(db) }));

function appFor(userId?: string) {
  const app = new Hono();
  if (userId)
    app.use('*', async (c, next) => {
      c.set('apiKey', {
        id: `key_${userId}`,
        user_id: userId,
        principal_kind: 'human',
        project_id: null,
      });
      await next();
    });
  app.route('/', repositoryPathRoutes);
  app.route('/', projectRoutes);
  return app;
}
const jsonRequest = (method: string, body: unknown) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('repository addresses HTTP contract', () => {
  let cleanup: () => Promise<void>;
  let id: string;
  const original = process.env.AUTH_DISABLED;
  beforeAll(async () => {
    process.env.AUTH_DISABLED = 'false';
    const setup = await setupTestDB();
    db = setup.db;
    cleanup = setup.cleanup;
    await db.insert(users).values([
      { id: 'names-owner', emailVerified: true },
      { id: 'names-outsider', emailVerified: true },
    ]);
    const ns = await insertPersonalNamespace(db, { slug: 'api-paths', ownerUserId: 'names-owner' });
    const p = await insertProject(db, { name: 'Old-Name', namespaceId: ns.namespaceId });
    id = p.projectId;
    // This project will fall outside the old front-end's first 50 rows.
    for (let i = 0; i < 51; i++)
      await insertProject(db, { name: `Later-${i}`, namespaceId: ns.namespaceId });
  });
  afterAll(async () => {
    if (original === undefined) delete process.env.AUTH_DISABLED;
    else process.env.AUTH_DISABLED = original;
    await cleanup?.();
  });

  it('checks normalization separately from availability without disclosing another project', async () => {
    const app = appFor('names-owner');
    const res = await app.request('/v1/repository-name?namespace=api-paths&name=My%20%20Project');
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({
      name: 'My-Project',
      valid: true,
      available: true,
      canonical_path: '/api-paths/My-Project',
    });
    const occupied = await app.request('/v1/repository-name?namespace=api-paths&name=old-name');
    expect((await occupied.json()).data).toMatchObject({
      valid: true,
      available: false,
      code: 'NAME_OCCUPIED',
    });
    const own = await app.request(
      `/v1/repository-name?namespace=api-paths&name=old-name&project_id=${id}`
    );
    expect((await own.json()).data.available).toBe(true);
    for (const name of ['NEW', 'settings', '项目', '---', '', 'a'.repeat(101)]) {
      const invalid = await app.request(
        `/v1/repository-name?namespace=api-paths&name=${encodeURIComponent(name)}`
      );
      expect((await invalid.json()).data).toMatchObject({
        valid: false,
        available: false,
        canonical_path: null,
      });
    }
  });

  it('resolves beyond 50 records and canonicalizes case, without bypassing authorization', async () => {
    const response = await appFor('names-owner').request('/v1/repositories/API-PATHS/old-name');
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({
      project_id: id,
      namespace: 'api-paths',
      canonical_path: '/api-paths/Old-Name',
      redirect: true,
    });
    for (const app of [appFor('names-outsider'), appFor()]) {
      const denied = await app.request('/v1/repositories/api-paths/Old-Name');
      expect(denied.status).toBe(403);
      expect(await denied.text()).not.toContain(id);
      expect(
        (await app.request('/v1/repository-name?namespace=api-paths&name=Old-Name')).status
      ).toBe(403);
      expect(
        (
          await app.request(
            `/v1/repository-name?namespace=api-paths&name=Old-Name&project_id=${id}`
          )
        ).status
      ).toBe(403);
    }
  });

  it('persists confirmed names, maps conflicts to 409 and redirects all aliases directly', async () => {
    const app = appFor('names-owner');
    const created = await app.request(
      '/v1/projects',
      jsonRequest('POST', { name: ' Release 2026101500000 ', namespace: 'api-paths' })
    );
    expect(created.status).toBe(201);
    expect((await created.json()).data).toMatchObject({
      name: 'Release-2026101500000',
      canonical_path: '/api-paths/Release-2026101500000',
    });
    for (const name of ['Middle', 'Current_Name']) {
      const renamed = await app.request(`/v1/projects/${id}`, jsonRequest('PUT', { name }));
      expect(renamed.status).toBe(200);
      expect((await renamed.json()).data.canonical_path).toBe(`/api-paths/${name}`);
    }
    for (const name of ['Old-Name', 'Middle']) {
      const result = await app.request(`/v1/repositories/api-paths/${name}`);
      expect((await result.json()).data).toMatchObject({
        project_id: id,
        canonical_path: '/api-paths/Current_Name',
        redirect: true,
      });
    }
    const conflict = await app.request(
      `/v1/projects/${id}`,
      jsonRequest('PUT', { name: 'later-0', metadata: { shouldRollback: true } })
    );
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).error.code).toBe('NAME_OCCUPIED');
    const unchanged = await app.request(`/v1/projects/${id}`);
    expect((await unchanged.json()).data).toMatchObject({ name: 'Current_Name', metadata: null });
  });
});
