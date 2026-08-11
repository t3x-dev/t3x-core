import type { AnyDB } from '@t3x-dev/storage';
import { insertProject } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDB } from './setup';

let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

const importSpies = vi.hoisted(() => ({
  parseUrl: vi.fn(),
  parseDocument: vi.fn(),
  parsePlatformExport: vi.fn(),
}));

vi.mock('../lib/import', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/import')>();
  return {
    ...actual,
    parseUrl: importSpies.parseUrl,
    parseDocument: importSpies.parseDocument,
    parsePlatformExport: importSpies.parsePlatformExport,
  };
});

import { checkRoutes } from '../routes/check.openapi';
import { extractionFeedbackRoutes } from '../routes/extraction-feedback.openapi';
import { importRoutes } from '../routes/import.openapi';
import { usageRoutes } from '../routes/usage.openapi';

function createAuthenticatedApp(userId: string) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    // biome-ignore lint/suspicious/noExplicitAny: compact authenticated route fixture
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
  app.route('/', checkRoutes);
  app.route('/', extractionFeedbackRoutes);
  app.route('/', importRoutes);
  app.route('/', usageRoutes);
  return app;
}

async function expectForbidden(response: Response) {
  expect(response.status).toBe(403);
  await expect(response.json()).resolves.toMatchObject({
    success: false,
    error: { code: 'FORBIDDEN', message: 'Access denied' },
  });
}

describe('project ownership on remaining HTTP project surfaces', () => {
  let cleanup: () => Promise<void>;
  let ownerProjectId: string;
  let otherProjectId: string;

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;
    ownerProjectId = (
      await insertProject(mockDB, { name: 'Remaining owner project', ownerId: 'user_owner' })
    ).projectId;
    otherProjectId = (
      await insertProject(mockDB, { name: 'Remaining other project', ownerId: 'user_other' })
    ).projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(() => {
    importSpies.parseUrl.mockReset();
    importSpies.parseDocument.mockReset();
    importSpies.parsePlatformExport.mockReset();
  });

  it('blocks cross-project checks, feedback statistics, and usage writes', async () => {
    const app = createAuthenticatedApp('user_owner');

    await expectForbidden(
      await app.request('/v1/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: otherProjectId, text: 'private constraints' }),
      })
    );
    await expectForbidden(
      await app.request(`/v1/projects/${otherProjectId}/extraction-feedback/stats`)
    );
    await expectForbidden(
      await app.request('/v1/usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: otherProjectId,
          endpoint: 'private-endpoint',
          model: 'private-model',
          input_tokens: 1,
          output_tokens: 1,
        }),
      })
    );
  });

  it('blocks URL imports before fetching attacker-selected content', async () => {
    const app = createAuthenticatedApp('user_owner');
    const requests = [
      app.request('/v1/import/url/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com/private', project_id: otherProjectId }),
      }),
      app.request('/v1/import/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com/private', project_id: otherProjectId }),
      }),
      app.request('/v1/import/url/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com/private', project_id: otherProjectId }),
      }),
    ];

    for (const request of requests) await expectForbidden(await request);
    expect(importSpies.parseUrl).not.toHaveBeenCalled();
  });

  it('blocks document imports before reading or parsing uploaded bytes', async () => {
    const app = createAuthenticatedApp('user_owner');
    const form = () => {
      const body = new FormData();
      body.set('project_id', otherProjectId);
      body.set('file', new File(['private'], 'private.txt', { type: 'text/plain' }));
      return body;
    };

    await expectForbidden(
      await app.request('/v1/import/document/preview', { method: 'POST', body: form() })
    );
    await expectForbidden(
      await app.request('/v1/import/document', { method: 'POST', body: form() })
    );
    await expectForbidden(
      await app.request('/v1/import/document/stream', { method: 'POST', body: form() })
    );
    expect(importSpies.parseDocument).not.toHaveBeenCalled();
  });

  it('blocks platform imports before parsing the export', async () => {
    const app = createAuthenticatedApp('user_owner');
    const payload = JSON.stringify({ project_id: otherProjectId, platform_data: '{}' });

    await expectForbidden(
      await app.request('/v1/import/platform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      })
    );
    await expectForbidden(
      await app.request('/v1/import/platform/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      })
    );
    expect(importSpies.parsePlatformExport).not.toHaveBeenCalled();
  });

  it('keeps access to the owner project and AUTH_DISABLED behavior', async () => {
    const owner = createAuthenticatedApp('user_owner');
    const local = new Hono();
    local.route('/', checkRoutes);

    expect(
      (
        await owner.request('/v1/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project_id: ownerProjectId, text: 'owner text' }),
        })
      ).status
    ).toBe(200);
    expect(
      (
        await local.request('/v1/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project_id: otherProjectId, text: 'local text' }),
        })
      ).status
    ).toBe(200);
  });
});
