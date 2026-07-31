import type { ApiKey } from '@t3x-dev/core';
import { type AnyDB, insertProject } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

let mockDB: AnyDB;
vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

import { transitionPolicyBindingRoutes } from '../routes/transition-policy-bindings.openapi';

function policy() {
  return {
    schema: 't3x.dev/acceptance-policy/v1',
    version: 1,
    authorization: {
      decide: { actors: { mode: 'any' } },
      override: { actors: { mode: 'any' } },
      allowSelfApproval: false,
    },
    claims: {
      intent: {
        allowedModes: ['unspecified'],
        minimumEvidence: 0,
        humanConfirmation: 'not_required',
      },
      rationale: {
        allowedModes: ['unspecified'],
        minimumEvidence: 0,
        humanConfirmation: 'not_required',
      },
    },
    checks: {
      replay: {
        issuers: { mode: 'any' },
        tools: { mode: 'any' },
        environments: { mode: 'any' },
      },
      validation: {
        requirement: 'optional',
        issuers: { mode: 'any' },
        tools: { mode: 'any' },
        environments: { mode: 'any' },
        profiles: { mode: 'any' },
        schemas: { mode: 'any' },
        contexts: { mode: 'any' },
      },
      humanConfirmation: { issuers: { mode: 'any' } },
    },
    override: {
      allowClaimFailures: false,
      allowFailedValidation: false,
      allowMissingHumanConfirmation: false,
      allowMissingValidation: false,
    },
  };
}

function agentKey(projectId: string): ApiKey {
  return {
    id: 'ak_policy_agent',
    key_prefix: 't3xk_pol',
    key_hash: 'hash',
    name: 'Policy agent',
    project_id: projectId,
    user_id: null,
    principal_kind: 'agent',
    transition_scopes: ['transition:decide:accept'],
    created_at: '2026-07-31T00:00:00.000Z',
    last_used_at: null,
    revoked_at: null,
  };
}

describe('Transition policy binding routes', () => {
  let cleanup: () => Promise<void>;
  let projectId: string;

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;
    projectId = (await insertProject(mockDB, testData.project({ name: 'Policy API' }))).projectId;
  });

  afterAll(async () => cleanup());

  it('binds, reads, and removes a server-selected policy in local admin mode', async () => {
    const app = new Hono();
    app.route('/', transitionPolicyBindingRoutes);
    const path = `/v1/projects/${projectId}/transition-policy-binding`;
    const put = await app.request(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ref_name: 'feature/device',
        uri: 't3x://policies/device/v1',
        policy: policy(),
      }),
    });
    expect(put.status).toBe(200);
    const created = (await put.json()) as {
      data: { resource: { digest: string }; updated_by: unknown };
    };
    expect(created.data.resource.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(created.data.updated_by).toEqual({ kind: 'human', id: 'human:local-user' });

    const get = await app.request(`${path}?ref_name=${encodeURIComponent('feature/device')}`);
    expect(get.status).toBe(200);
    expect((await get.json()) as unknown).toMatchObject({
      data: { ref_name: 'feature/device', resource: created.data.resource },
    });

    const remove = await app.request(`${path}?ref_name=${encodeURIComponent('feature/device')}`, {
      method: 'DELETE',
    });
    expect(remove.status).toBe(200);
    const missing = await app.request(`${path}?ref_name=${encodeURIComponent('feature/device')}`);
    expect(missing.status).toBe(404);
  });

  it('rejects actor or digest fields supplied by the caller', async () => {
    const app = new Hono();
    app.route('/', transitionPolicyBindingRoutes);
    const res = await app.request(`/v1/projects/${projectId}/transition-policy-binding`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ref_name: 'main',
        uri: 't3x://policies/main/v1',
        policy: policy(),
        actor: { kind: 'service', id: 'service:spoofed' },
        policy_digest: `sha256:${'0'.repeat(64)}`,
      }),
    });
    expect(res.status).toBe(400);
  });

  it('does not let an agent administer policy even when it has Decision scope', async () => {
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('apiKey', agentKey(projectId));
      await next();
    });
    app.route('/', transitionPolicyBindingRoutes);
    const res = await app.request(`/v1/projects/${projectId}/transition-policy-binding`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref_name: 'main', uri: 't3x://policies/main/v1', policy: policy() }),
    });
    expect(res.status).toBe(403);
  });
});
