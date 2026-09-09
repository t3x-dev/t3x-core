import type { ApiKey } from '@t3x-dev/core';
import type { AnyDB } from '@t3x-dev/storage';
import { createMaterial, ensureMainBranch, insertProject } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { grantTestMachineProjectAccess, setupTestDB } from './setup';

let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

import { generationRoutes } from '../routes/chat.openapi';
import { contextRoutes } from '../routes/context.openapi';
import { knowledgeGraphRoutes } from '../routes/knowledge-graph.openapi';
import { materialsRoutes } from '../routes/materials.openapi';
import { searchRoutes } from '../routes/search.openapi';

function createAuthenticatedApp(userId: string) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    // biome-ignore lint/suspicious/noExplicitAny: test context fixture
    (c as any).set('apiKey', {
      id: `ak_${userId}`,
      user_id: userId,
      project_id: null,
      principal_kind: 'human',
      key_prefix: 't3xk_test',
      name: 'test',
    });
    return next();
  });
  app.route('/', generationRoutes);
  app.route('/', contextRoutes);
  app.route('/', knowledgeGraphRoutes);
  app.route('/', materialsRoutes);
  app.route('/', searchRoutes);
  return app;
}

function createProjectAgentApp(projectId: string) {
  const app = new Hono();
  const apiKey: ApiKey = {
    id: 'ak_project_agent',
    key_hash: 'hash_project_agent',
    user_id: null,
    project_id: projectId,
    principal_kind: 'agent',
    transition_scopes: ['transition:inspect'],
    key_prefix: 't3xk_agent',
    name: 'project agent',
    created_at: '2026-08-31T00:00:00.000Z',
    last_used_at: null,
    revoked_at: null,
  };
  app.use('*', async (c, next) => {
    await grantTestMachineProjectAccess(mockDB, apiKey);
    // biome-ignore lint/suspicious/noExplicitAny: test context fixture
    (c as any).set('apiKey', apiKey);
    return next();
  });
  app.route('/', generationRoutes);
  app.route('/', contextRoutes);
  app.route('/', knowledgeGraphRoutes);
  app.route('/', materialsRoutes);
  app.route('/', searchRoutes);
  return app;
}

function createLocalApp() {
  const app = new Hono();
  app.route('/', generationRoutes);
  app.route('/', contextRoutes);
  app.route('/', knowledgeGraphRoutes);
  app.route('/', materialsRoutes);
  app.route('/', searchRoutes);
  return app;
}

async function expectForbidden(response: Response) {
  expect(response.status).toBe(403);
  await expect(response.json()).resolves.toMatchObject({
    success: false,
    error: { code: 'FORBIDDEN', message: 'Access denied' },
  });
}

async function expectProjectNotFound(response: Response) {
  expect(response.status).toBe(404);
  await expect(response.json()).resolves.toMatchObject({
    success: false,
    error: { code: 'NOT_FOUND' },
  });
}

describe('project ownership on query and generation surfaces', () => {
  let cleanup: () => Promise<void>;
  let ownerProjectId: string;
  let ownerMaterialId: string;
  let otherProjectId: string;
  let otherMaterialId: string;

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;
    ownerProjectId = (
      await insertProject(mockDB, { name: 'Owner query project', ownerId: 'user_owner' })
    ).projectId;
    await ensureMainBranch(mockDB, ownerProjectId);
    ownerMaterialId = (
      await createMaterial(mockDB, {
        project_id: ownerProjectId,
        source_type: 'document',
        title: 'Owner material',
        content_text: 'owner-visible',
        content_hash: 'owner-query-material-hash',
        metadata: {},
        token_estimate: 1,
      })
    ).id;
    otherProjectId = (
      await insertProject(mockDB, { name: 'Other query project', ownerId: 'user_other' })
    ).projectId;
    await ensureMainBranch(mockDB, otherProjectId);
    otherMaterialId = (
      await createMaterial(mockDB, {
        project_id: otherProjectId,
        source_type: 'document',
        title: 'Private material',
        content_text: 'private',
        content_hash: 'private-query-material-hash',
        metadata: {},
        token_estimate: 1,
      })
    ).id;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('blocks project context and search reads', async () => {
    const app = createAuthenticatedApp('user_owner');

    await expectForbidden(await app.request(`/v1/projects/${otherProjectId}/context`));
    await expectForbidden(
      await app.request('/v1/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: otherProjectId, query: 'private' }),
      })
    );
  });

  it('blocks every cross-project knowledge graph surface', async () => {
    const app = createAuthenticatedApp('user_owner');
    const base = `/v1/projects/${otherProjectId}/knowledge-graph`;

    await expectForbidden(await app.request(`${base}/build`, { method: 'POST' }));
    await expectForbidden(await app.request(`${base}/nodes`));
    await expectForbidden(await app.request(`${base}/nodes/private-node`));
    await expectForbidden(await app.request(`${base}/nodes/private-node/neighbors`));
    await expectForbidden(await app.request(`${base}/search?q=private`));
    await expectForbidden(await app.request(base, { method: 'DELETE' }));
  });

  it('blocks material listing, detail, archive, and upload before parsing files', async () => {
    const app = createAuthenticatedApp('user_owner');
    const base = `/v1/projects/${otherProjectId}/materials`;

    await expectForbidden(await app.request(base));
    await expectForbidden(await app.request(`${base}/${otherMaterialId}`));
    await expectForbidden(await app.request(`${base}/${otherMaterialId}`, { method: 'DELETE' }));
    await expectForbidden(await app.request(`${base}/document`, { method: 'POST' }));
  });

  it('blocks non-streaming and streaming chat before provider resolution', async () => {
    const app = createAuthenticatedApp('user_owner');
    const body = JSON.stringify({
      project_id: otherProjectId,
      messages: [{ role: 'user', content: 'private billing target' }],
    });

    await expectForbidden(
      await app.request('/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
    );
    await expectForbidden(
      await app.request('/v1/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
    );
  });

  it('keeps owner reads available across the protected query surfaces', async () => {
    const app = createAuthenticatedApp('user_owner');

    const context = await app.request(`/v1/projects/${ownerProjectId}/context`);
    expect(context.status).toBe(200);
    await expect(context.json()).resolves.toMatchObject({
      success: true,
      data: { commit_hash: null, trees: [] },
    });

    const search = await app.request('/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: ownerProjectId, query: 'owner-visible' }),
    });
    expect(search.status).toBe(200);
    await expect(search.json()).resolves.toMatchObject({
      success: true,
      data: { nodes: [], count: 0 },
    });

    const graph = await app.request(`/v1/projects/${ownerProjectId}/knowledge-graph/nodes`);
    expect(graph.status).toBe(200);
    await expect(graph.json()).resolves.toMatchObject({
      success: true,
      data: { nodes: [], count: 0 },
    });

    const materials = await app.request(`/v1/projects/${ownerProjectId}/materials`);
    expect(materials.status).toBe(200);
    const materialsBody = (await materials.json()) as {
      data: Array<{ id: string; title: string }>;
    };
    expect(materialsBody.data).toContainEqual(
      expect.objectContaining({ id: ownerMaterialId, title: 'Owner material' })
    );

    const material = await app.request(
      `/v1/projects/${ownerProjectId}/materials/${ownerMaterialId}`
    );
    expect(material.status).toBe(200);
    await expect(material.json()).resolves.toMatchObject({
      success: true,
      data: { id: ownerMaterialId, content_text: 'owner-visible' },
    });
  });

  it('keeps AUTH_DISABLED local development access available', async () => {
    const app = createLocalApp();

    expect((await app.request(`/v1/projects/${otherProjectId}/context`)).status).toBe(200);
    expect((await app.request(`/v1/projects/${otherProjectId}/materials`)).status).toBe(200);
  });

  it('allows a project agent only on its bound project', async () => {
    const app = createProjectAgentApp(ownerProjectId);

    expect((await app.request(`/v1/projects/${ownerProjectId}/context`)).status).toBe(200);
    await expectForbidden(await app.request(`/v1/projects/${otherProjectId}/context`));
    await expectForbidden(await app.request(`/v1/projects/${otherProjectId}/materials`));
  });

  it('returns project-not-found before query, provider, or graph work starts', async () => {
    const app = createAuthenticatedApp('user_owner');
    const missingProjectId = 'proj_missing_query_surface';

    await expectProjectNotFound(await app.request(`/v1/projects/${missingProjectId}/context`));
    await expectProjectNotFound(
      await app.request(`/v1/projects/${missingProjectId}/knowledge-graph/nodes`)
    );
    await expectProjectNotFound(await app.request(`/v1/projects/${missingProjectId}/materials`));
    await expectProjectNotFound(
      await app.request('/v1/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: missingProjectId, query: 'missing' }),
      })
    );
    await expectProjectNotFound(
      await app.request('/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: missingProjectId,
          messages: [{ role: 'user', content: 'do not invoke a provider' }],
        }),
      })
    );
  });
});
