import type { AnyDB } from '@t3x-dev/storage';
import { findNamespaceBySlug, findProjects, namespaceMemberships } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB } from './setup';

let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

import { namespaceRoutes } from '../routes/namespaces.openapi';
import { projectRoutes } from '../routes/projects.openapi';

function createAppWithUser(userId?: string) {
  const app = new Hono();
  if (userId) {
    app.use('*', async (c, next) => {
      // biome-ignore lint/suspicious/noExplicitAny: test context mock
      (c as any).set('apiKey', {
        id: `ak_${userId}`,
        user_id: userId,
        project_id: null,
        principal_kind: 'human',
        transition_scopes: [],
        key_prefix: 'test',
        name: 'test',
      });
      return next();
    });
  }
  app.route('/', namespaceRoutes);
  app.route('/', projectRoutes);
  return app;
}

describe('Namespace persistence and project isolation', () => {
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;
  });

  afterAll(async () => cleanup());

  it('persists a personal namespace and separates it from t3x-dev', async () => {
    const app = createAppWithUser('user_namespace_owner');

    const namespaceResponse = await app.request('/v1/namespaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'personal-space' }),
    });
    expect(namespaceResponse.status).toBe(201);
    expect((await findNamespaceBySlug(mockDB, 'personal-space'))?.ownerUserId).toBe(
      'user_namespace_owner'
    );
    const currentNamespaceResponse = await app.request('/v1/namespaces/me');
    expect(currentNamespaceResponse.status).toBe(200);
    expect(((await currentNamespaceResponse.json()) as { data: { slug: string } }).data.slug).toBe(
      'personal-space'
    );

    const organization = await findNamespaceBySlug(mockDB, 't3x-dev');
    if (!organization) throw new Error('default organization namespace missing');
    await mockDB.insert(namespaceMemberships).values({
      membershipId: 'nsm_namespace_org_editor',
      namespaceId: organization.namespaceId,
      principalKind: 'human',
      principalId: 'user_namespace_owner',
      role: 'editor',
      status: 'active',
    });

    for (const [name, namespace] of [
      ['Personal project', 'personal-space'],
      ['Organization project', 't3x-dev'],
    ]) {
      const response = await app.request('/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, namespace }),
      });
      expect(response.status).toBe(201);
    }

    const personalResponse = await app.request('/v1/projects?namespace=personal-space');
    const personalPayload = (await personalResponse.json()) as {
      data: { projects: Array<{ name: string }> };
    };
    expect(personalPayload.data.projects.map((project) => project.name)).toEqual([
      'Personal project',
    ]);

    const organizationResponse = await app.request('/v1/projects?namespace=t3x-dev');
    const organizationPayload = (await organizationResponse.json()) as {
      data: { projects: Array<{ name: string }> };
    };
    expect(organizationPayload.data.projects.map((project) => project.name)).toEqual([
      'Organization project',
    ]);

    const personalNamespace = await findNamespaceBySlug(mockDB, 'personal-space');
    const storedProjects = await findProjects(mockDB, {
      owner_id: 'user_namespace_owner',
      namespace_id: personalNamespace?.namespaceId,
    });
    expect(storedProjects.map((project) => project.name)).toEqual(['Personal project']);
  });

  it('rejects access from another user', async () => {
    const app = createAppWithUser('user_namespace_other');

    expect((await app.request('/v1/namespaces/me')).status).toBe(404);
    expect((await app.request('/v1/projects?namespace=personal-space')).status).toBe(403);
    const response = await app.request('/v1/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Escaped project', namespace: 'personal-space' }),
    });
    expect(response.status).toBe(403);
  });

  it('returns the same persisted namespace on a local retry', async () => {
    const app = createAppWithUser();
    const request = () =>
      app.request('/v1/namespaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: 'local-space' }),
      });

    expect((await request()).status).toBe(201);
    expect((await request()).status).toBe(200);
  });
});
