import type { AnyDB } from '@t3x-dev/storage';
import { insertProject } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDB } from './setup';

let mockDB: AnyDB;

const commitSpies = vi.hoisted(() => ({
  listProjectIds: vi.fn(),
  getCommit: vi.fn(),
}));

vi.mock('@t3x-dev/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@t3x-dev/storage')>();
  return {
    ...actual,
    listTransitionCommitProjectIds: commitSpies.listProjectIds,
  };
});

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

vi.mock('../lib/repository-state-transition', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/repository-state-transition')>();
  return {
    ...actual,
    getRepositorySemanticCommit: commitSpies.getCommit,
  };
});

import { checkRoutes } from '../routes/check.openapi';
import { diffRoutes } from '../routes/diff.openapi';
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
  app.route('/', diffRoutes);
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
    commitSpies.listProjectIds.mockReset();
    commitSpies.getCommit.mockReset();
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

  it('blocks both commit-diff surfaces before loading cross-project commit state', async () => {
    const app = createAuthenticatedApp('user_owner');
    const payload = JSON.stringify({
      project_id: otherProjectId,
      base_commit_hash: 'sha256:private-base',
      target_commit_hash: 'sha256:private-target',
    });

    await expectForbidden(
      await app.request('/v1/diff/two-way', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      })
    );
    await expectForbidden(
      await app.request('/v1/diff/frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      })
    );
    expect(commitSpies.listProjectIds).not.toHaveBeenCalled();
    expect(commitSpies.getCommit).not.toHaveBeenCalled();
  });

  it('loads commit state only through an authorized project membership', async () => {
    const app = createAuthenticatedApp('user_owner');
    commitSpies.listProjectIds.mockResolvedValue([ownerProjectId]);
    commitSpies.getCommit.mockImplementation(
      async (_db: AnyDB, digest: string, projectId: string | undefined) => ({
        digest,
        projectId,
        schema: 't3x/commit/v2',
        parents: [],
        actor: { kind: 'human', id: 'user_owner' },
        recordedAt: '2026-08-11T00:00:00.000Z',
        intent: null,
        rationale: null,
        evidence: [],
        semanticContent: { trees: [], relations: [] },
      })
    );
    const payload = JSON.stringify({
      base_commit_hash: 'sha256:owner-base',
      target_commit_hash: 'sha256:owner-target',
    });

    const twoWay = await app.request('/v1/diff/two-way', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    expect(twoWay.status).toBe(200);

    const frame = await app.request('/v1/diff/frame', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    expect(frame.status).toBe(200);
    expect(commitSpies.getCommit).toHaveBeenCalledTimes(4);
    for (const call of commitSpies.getCommit.mock.calls) {
      expect(call[2]).toBe(ownerProjectId);
    }
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
