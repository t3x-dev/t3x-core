import type { ApiKey } from '@t3x-dev/core';
import type { AnyDB } from '@t3x-dev/storage';
import { insertProject } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB } from './setup';

let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

import { projectAccessMiddleware } from '../middleware/project-access';

function humanKey(userId: string): ApiKey {
  return {
    id: `ak_${userId}`,
    key_hash: `hash_${userId}`,
    user_id: userId,
    project_id: null,
    principal_kind: 'human',
    transition_scopes: [],
    key_prefix: 't3xk_test',
    name: 'test human',
    created_at: '2026-08-16T00:00:00.000Z',
    last_used_at: null,
    revoked_at: null,
  };
}

function agentKey(projectId: string | null): ApiKey {
  return {
    id: 'ak_agent',
    key_hash: 'hash_agent',
    user_id: null,
    project_id: projectId,
    principal_kind: 'agent',
    transition_scopes: [],
    key_prefix: 't3xk_test',
    name: 'test agent',
    created_at: '2026-08-16T00:00:00.000Z',
    last_used_at: null,
    revoked_at: null,
  };
}

function createApp(apiKey?: ApiKey) {
  const app = new Hono();
  if (apiKey) {
    app.use('*', async (c, next) => {
      // biome-ignore lint/suspicious/noExplicitAny: test context fixture
      (c as any).set('apiKey', apiKey);
      return next();
    });
  }
  app.use('/v1/projects/:projectId/*', projectAccessMiddleware);
  app.get('/v1/projects/:projectId/probe', (c) => c.json({ success: true }));
  return app;
}

describe('project access middleware adapter', () => {
  let cleanup: () => Promise<void>;
  let ownedProjectId: string;
  let unownedProjectId: string;

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;
    ownedProjectId = (
      await insertProject(mockDB, { name: 'Owned middleware project', ownerId: 'user_owner' })
    ).projectId;
    unownedProjectId = (await insertProject(mockDB, { name: 'Unowned middleware project' }))
      .projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('uses the canonical human ownership and unowned-project policy', async () => {
    const owner = createApp(humanKey('user_owner'));
    const other = createApp(humanKey('user_other'));

    expect((await owner.request(`/v1/projects/${ownedProjectId}/probe`)).status).toBe(200);
    expect((await other.request(`/v1/projects/${ownedProjectId}/probe`)).status).toBe(403);
    expect((await owner.request(`/v1/projects/${unownedProjectId}/probe`)).status).toBe(403);
  });

  it('allows only an exactly bound machine principal', async () => {
    const bound = createApp(agentKey(unownedProjectId));
    const global = createApp(agentKey(null));

    expect((await bound.request(`/v1/projects/${unownedProjectId}/probe`)).status).toBe(200);
    expect((await bound.request(`/v1/projects/${ownedProjectId}/probe`)).status).toBe(403);
    expect((await global.request(`/v1/projects/${ownedProjectId}/probe`)).status).toBe(403);
  });

  it('preserves explicit AUTH_DISABLED access and missing-project errors', async () => {
    const local = createApp();

    expect((await local.request(`/v1/projects/${ownedProjectId}/probe`)).status).toBe(200);
    expect((await local.request('/v1/projects/project_missing/probe')).status).toBe(404);
  });
});
