import type { AnyDB } from '@t3x-dev/storage';
import {
  createApiKey,
  createUser,
  findProjectById,
  insertProject,
  revokeApiKey,
} from '@t3x-dev/storage';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDB } from './setup';

let testDb: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(testDb)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

import { createApp } from '../app';

type ErrorBody = {
  success: false;
  error: { code: string; message: string };
};

type ProjectListBody = {
  success: true;
  data: { projects: Array<{ project_id: string; name: string }> };
};

type ProjectBody = {
  success: true;
  data: { project_id: string; name: string };
};

const ownerKeyValue = 't3xk_smoke_owner_0123456789abcdef';
const otherKeyValue = 't3xk_smoke_other_0123456789abcdef';
const agentKeyValue = 't3xk_smoke_agent_0123456789abcdef';
const revocableKeyValue = 't3xk_smoke_revocable_0123456789ab';

describe('authenticated application boundary smoke', () => {
  const originalAuthDisabled = process.env.AUTH_DISABLED;
  let cleanup: () => Promise<void>;
  let ownerUserId: string;
  let ownerProjectId: string;
  let otherProjectId: string;
  let revocableKeyId: string;
  const { app } = createApp({ skipLocalAuth: true });

  beforeAll(async () => {
    const setup = await setupTestDB();
    testDb = setup.db;
    cleanup = setup.cleanup;

    const owner = await createUser(testDb, {
      email: 'auth-smoke-owner@example.test',
      name: 'Auth Smoke Owner',
    });
    const other = await createUser(testDb, {
      email: 'auth-smoke-other@example.test',
      name: 'Auth Smoke Other',
    });
    ownerUserId = owner.id;

    ownerProjectId = (
      await insertProject(testDb, { name: 'Owner private project', ownerId: owner.id })
    ).projectId;
    otherProjectId = (
      await insertProject(testDb, { name: 'Other private project', ownerId: other.id })
    ).projectId;

    await createApiKey(testDb, {
      name: 'Owner smoke key',
      userId: owner.id,
      keyValue: ownerKeyValue,
    });
    await createApiKey(testDb, {
      name: 'Other smoke key',
      userId: other.id,
      keyValue: otherKeyValue,
    });
    await createApiKey(testDb, {
      name: 'Project agent smoke key',
      projectId: ownerProjectId,
      principalKind: 'agent',
      keyValue: agentKeyValue,
    });
    revocableKeyId = (
      await createApiKey(testDb, {
        name: 'Revocable smoke key',
        userId: owner.id,
        keyValue: revocableKeyValue,
      })
    ).id;
  });

  afterAll(async () => {
    if (originalAuthDisabled === undefined) {
      delete process.env.AUTH_DISABLED;
    } else {
      process.env.AUTH_DISABLED = originalAuthDisabled;
    }
    await cleanup();
  });

  beforeEach(() => {
    process.env.AUTH_DISABLED = 'false';
  });

  function authorizedRequest(path: string, keyValue: string, init?: RequestInit) {
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${keyValue}`);
    return app.request(path, { ...init, headers });
  }

  async function expectAuthError(response: Response, status: 401 | 403, code: string) {
    expect(response.status).toBe(status);
    const body = (await response.json()) as ErrorBody;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe(code);
  }

  it('fails closed for missing, malformed, and unknown credentials', async () => {
    await expectAuthError(await app.request('/api/v1/projects'), 401, 'UNAUTHORIZED');
    await expectAuthError(
      await app.request('/api/v1/projects', {
        headers: { Authorization: 'Basic dXNlcjpwYXNz' },
      }),
      401,
      'UNAUTHORIZED'
    );
    await expectAuthError(
      await authorizedRequest('/api/v1/projects', 't3xk_unknown_smoke_key'),
      401,
      'UNAUTHORIZED'
    );
  });

  it('authenticates real keys and isolates project lists and direct reads', async () => {
    const ownerListResponse = await authorizedRequest('/api/v1/projects?limit=100', ownerKeyValue);
    expect(ownerListResponse.status).toBe(200);
    const ownerList = (await ownerListResponse.json()) as ProjectListBody;
    const ownerIds = ownerList.data.projects.map((project) => project.project_id);
    expect(ownerIds).toContain(ownerProjectId);
    expect(ownerIds).not.toContain(otherProjectId);

    const otherListResponse = await authorizedRequest('/api/v1/projects?limit=100', otherKeyValue);
    expect(otherListResponse.status).toBe(200);
    const otherList = (await otherListResponse.json()) as ProjectListBody;
    const otherIds = otherList.data.projects.map((project) => project.project_id);
    expect(otherIds).toContain(otherProjectId);
    expect(otherIds).not.toContain(ownerProjectId);

    expect(
      (await authorizedRequest(`/api/v1/projects/${ownerProjectId}`, ownerKeyValue)).status
    ).toBe(200);
    await expectAuthError(
      await authorizedRequest(`/api/v1/projects/${otherProjectId}`, ownerKeyValue),
      403,
      'FORBIDDEN'
    );
  });

  it('derives project ownership from the authenticated principal, not request data', async () => {
    const response = await authorizedRequest('/api/v1/projects', ownerKeyValue, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Credential-owned project',
        owner_id: 'user_spoofed',
      }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as ProjectBody;
    const stored = await findProjectById(testDb, body.data.project_id);
    expect(stored?.ownerId).toBe(ownerUserId);
  });

  it('enforces a project-scoped agent key at the assembled application boundary', async () => {
    expect(
      (await authorizedRequest(`/api/v1/projects/${ownerProjectId}`, agentKeyValue)).status
    ).toBe(200);
    await expectAuthError(
      await authorizedRequest(`/api/v1/projects/${otherProjectId}`, agentKeyValue),
      403,
      'FORBIDDEN'
    );
    await expectAuthError(
      await authorizedRequest('/api/v1/projects', agentKeyValue, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Agent-created project' }),
      }),
      403,
      'FORBIDDEN'
    );
  });

  it('rejects a previously valid key immediately after revocation', async () => {
    expect(
      (await authorizedRequest(`/api/v1/projects/${ownerProjectId}`, revocableKeyValue)).status
    ).toBe(200);

    await revokeApiKey(testDb, revocableKeyId);

    await expectAuthError(
      await authorizedRequest(`/api/v1/projects/${ownerProjectId}`, revocableKeyValue),
      401,
      'UNAUTHORIZED'
    );
  });
});
