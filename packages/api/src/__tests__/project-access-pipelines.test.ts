import type { AnyDB } from '@t3x-dev/storage';
import { insertConversation, insertProject, insertTurn } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB } from './setup';

let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

import { autopilotRoutes } from '../routes/autopilot.openapi';
import { curateRoutes } from '../routes/curate.openapi';
import { turnRoutes } from '../routes/turns.openapi';

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
  app.route('/', turnRoutes);
  app.route('/', autopilotRoutes);
  app.route('/', curateRoutes);
  return app;
}

describe('project ownership on mutation and pipeline routes', () => {
  let cleanup: () => Promise<void>;
  let otherProjectId: string;
  let conversationId: string;

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    otherProjectId = (
      await insertProject(mockDB, { name: 'Other pipeline project', ownerId: 'user_other' })
    ).projectId;
    conversationId = (
      await insertConversation(mockDB, {
        projectId: otherProjectId,
        title: 'Private pipeline conversation',
      })
    ).conversationId;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('blocks cross-project turn list, create, read, chain, and context', async () => {
    const turn = await insertTurn(mockDB, {
      projectId: otherProjectId,
      conversationId,
      role: 'user',
      content: 'private turn',
    });
    const app = createAuthenticatedApp('user_owner');
    const hash = encodeURIComponent(turn.turnHash);

    expect((await app.request(`/v1/turns?conversation_id=${conversationId}`)).status).toBe(403);
    expect(
      (
        await app.request('/v1/turns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: otherProjectId,
            conversation_id: conversationId,
            role: 'user',
            content: 'unauthorized',
          }),
        })
      ).status
    ).toBe(403);
    expect((await app.request(`/v1/turns/${hash}`)).status).toBe(403);
    expect((await app.request(`/v1/turns/${hash}/chain`)).status).toBe(403);
    expect((await app.request(`/v1/turns/${hash}/context`)).status).toBe(403);
  });

  it('blocks cross-project autopilot configuration and adaptive reads', async () => {
    const app = createAuthenticatedApp('user_owner');

    expect((await app.request(`/v1/projects/${otherProjectId}/autopilot/config`)).status).toBe(403);
    expect(
      (
        await app.request(`/v1/projects/${otherProjectId}/autopilot/config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: true }),
        })
      ).status
    ).toBe(403);
    expect((await app.request(`/v1/projects/${otherProjectId}/autopilot/adaptive`)).status).toBe(
      403
    );
  });

  it('blocks cross-project curation before provider work', async () => {
    const app = createAuthenticatedApp('user_owner');

    const response = await app.request('/v1/curate/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: otherProjectId,
        source_text: 'private source',
        bridge_id: 'summary',
        intent: 'private',
        cosine: 0.5,
      }),
    });
    expect(response.status).toBe(403);
  });
});
