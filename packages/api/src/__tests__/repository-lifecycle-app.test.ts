import {
  type AnyDB,
  createApiKey,
  createUser,
  deleteProject,
  findProjectByIdIncludingDeleted,
  insertPersonalNamespace,
  insertProject,
} from '@t3x-dev/storage';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestRateLimitStore, setupTestDB } from './setup';

let db: AnyDB;
vi.mock('../lib/db', () => ({ getDB: () => Promise.resolve(db) }));

import { createApp } from '../app';

const ownerKey = 't3xk_lifecycle_app_owner_0123456789abcdef';
const outsiderKey = 't3xk_lifecycle_app_other_0123456789abcdef';
type Mode = 'local' | 'authenticated';
const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('repository lifecycle through the complete application', () => {
  const originalAuth = process.env.AUTH_DISABLED;
  let setup: Awaited<ReturnType<typeof setupTestDB>>;
  let namespaceId: string;
  const namespace = 'lifecycle-app';
  const { app } = createApp({ skipLocalAuth: true, rateLimitStore: createTestRateLimitStore() });

  beforeAll(async () => {
    setup = await setupTestDB();
    db = setup.db;
    const owner = await createUser(db, { email: 'lifecycle-owner@example.test' });
    const outsider = await createUser(db, { email: 'lifecycle-outsider@example.test' });
    namespaceId = (await insertPersonalNamespace(db, { slug: namespace, ownerUserId: owner.id }))
      .namespaceId;
    await createApiKey(db, { name: 'Lifecycle owner', userId: owner.id, keyValue: ownerKey });
    await createApiKey(db, {
      name: 'Lifecycle outsider',
      userId: outsider.id,
      keyValue: outsiderKey,
    });
  });

  afterAll(async () => {
    if (originalAuth === undefined) delete process.env.AUTH_DISABLED;
    else process.env.AUTH_DISABLED = originalAuth;
    await setup?.cleanup();
  });

  function request(mode: Mode, path: string, init?: RequestInit, key = ownerKey) {
    process.env.AUTH_DISABLED = mode === 'local' ? 'true' : 'false';
    const headers = new Headers(init?.headers);
    if (mode === 'authenticated') headers.set('Authorization', `Bearer ${key}`);
    return app.request(`/api/v1${path}`, { ...init, headers });
  }

  it.each<Mode>([
    'local',
    'authenticated',
  ])('restores a listed deleted repository in %s mode', async (mode) => {
    const p = await insertProject(db, { name: `Restore-${mode}`, namespaceId });
    await deleteProject(db, p.projectId);
    const list = await request(mode, `/projects?namespace=${namespace}&status=deleted`);
    expect((await list.json()).data.projects).toContainEqual(
      expect.objectContaining({
        project_id: p.projectId,
        can_restore: true,
      })
    );
    const restored = await request(mode, `/projects/${p.projectId}/restore`, { method: 'POST' });
    expect(restored.status).toBe(200);
    expect((await restored.json()).data.project_id).toBe(p.projectId);
    expect((await request(mode, `/projects/${p.projectId}`)).status).toBe(200);
    expect((await request(mode, `/repositories/${namespace}/${p.name}`)).status).toBe(200);
  });

  it.each<Mode>([
    'local',
    'authenticated',
  ])('permanently deletes a listed repository and releases its aliases in %s mode', async (mode) => {
    const originalName = `Purge-old-${mode}`;
    const currentName = `Purge-current-${mode}`;
    const p = await insertProject(db, { name: originalName, namespaceId });
    expect(
      (await request(mode, `/projects/${p.projectId}`, json('PUT', { name: currentName }))).status
    ).toBe(200);
    expect((await request(mode, `/projects/${p.projectId}`, { method: 'DELETE' })).status).toBe(
      200
    );
    const list = await request(mode, `/projects?namespace=${namespace}&status=deleted`);
    expect((await list.json()).data.projects).toContainEqual(
      expect.objectContaining({
        project_id: p.projectId,
        can_permanently_delete: true,
      })
    );
    const purged = await request(
      mode,
      `/projects/${p.projectId}?permanent=true&only_if_deleted=true`,
      { method: 'DELETE' }
    );
    expect(purged.status).toBe(200);
    expect(await findProjectByIdIncludingDeleted(db, p.projectId)).toBeNull();
    expect(
      (await request(mode, `/projects/${p.projectId}/restore`, { method: 'POST' })).status
    ).toBe(404);
    for (const name of [originalName, currentName]) {
      const available = await request(mode, `/repository-name?namespace=${namespace}&name=${name}`);
      expect((await available.json()).data.available).toBe(true);
      const replacement = await request(mode, '/projects', json('POST', { name, namespace }));
      expect(replacement.status).toBe(201);
      expect((await replacement.json()).data.project_id).not.toBe(p.projectId);
    }
  });

  it('keeps deleted repositories inaccessible to ordinary reads, edits and soft deletes', async () => {
    const p = await insertProject(db, { name: 'Still-deleted', namespaceId });
    await deleteProject(db, p.projectId);
    for (const mode of ['local', 'authenticated'] as const) {
      for (const [path, init] of [
        [`/projects/${p.projectId}`, undefined],
        [`/projects/${p.projectId}?permanent=true`, undefined],
        [`/projects/${p.projectId}/branches?permanent=true`, undefined],
        [`/projects/${p.projectId}/restore`, undefined],
        [`/projects/${p.projectId}?permanent=true`, json('PUT', { name: 'Wrong' })],
        [`/projects/${p.projectId}?permanent=false`, { method: 'DELETE' }],
        [`/projects/${p.projectId}/restore`, { method: 'DELETE' }],
      ] as const) {
        expect((await request(mode, path, init)).status).toBe(404);
      }
    }
    expect((await findProjectByIdIncludingDeleted(db, p.projectId))?.deletedAt).not.toBeNull();
  });

  it('still denies lifecycle operations without management authority', async () => {
    const p = await insertProject(db, { name: 'Private-deleted', namespaceId });
    await deleteProject(db, p.projectId);
    expect(
      (
        await request(
          'authenticated',
          `/projects/${p.projectId}/restore`,
          { method: 'POST' },
          outsiderKey
        )
      ).status
    ).toBe(403);
    expect(
      (
        await request(
          'authenticated',
          `/projects/${p.projectId}?permanent=true`,
          { method: 'DELETE' },
          outsiderKey
        )
      ).status
    ).toBe(403);
    expect((await findProjectByIdIncludingDeleted(db, p.projectId))?.deletedAt).not.toBeNull();
  });
});
