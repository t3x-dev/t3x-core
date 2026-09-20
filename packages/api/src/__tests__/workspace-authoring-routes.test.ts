import type { ApiKey } from '@t3x-dev/core';
import { insertBranch, insertProject, upsertWorkspaceDraft } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { workspaceAuthoringRoutes } from '../routes/workspace-authoring.openapi';
import { grantTestScopedCredentialProjectAccess, setupTestDB } from './setup';

const runtime = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('../lib/db', () => ({ getDB: async () => runtime.db }));

describe('Workspace authoring HTTP boundary', () => {
  let setup: Awaited<ReturnType<typeof setupTestDB>>;
  let projectId: string;
  const app = new Hono().route('/', workspaceAuthoringRoutes);
  let url: string;
  beforeAll(async () => {
    setup = await setupTestDB();
    runtime.db = setup.db;
    projectId = (await insertProject(setup.db, { name: 'Authoring HTTP' })).projectId;
    await insertBranch(setup.db, { projectId, name: 'main' });
    await upsertWorkspaceDraft(setup.db, {
      project_id: projectId,
      workspace_id: 'ws',
      title: 'Draft',
      target_branch: 'main',
      workspace_state: { targetBranch: 'main' },
    });
    url = `/v1/projects/${projectId}/workspaces/ws/authoring`;
  });
  afterAll(async () => {
    await setup?.cleanup();
  });
  function credential(scopes: ApiKey['transition_scopes'], boundProject = projectId): ApiKey {
    return {
      id: `authoring_${scopes.join('_')}_${boundProject}`,
      key_prefix: 'test',
      key_hash: 'test',
      name: 'authoring test',
      project_id: boundProject,
      user_id: null,
      principal_kind: 'agent',
      transition_scopes: scopes,
      created_at: '2026-09-01T00:00:00.000Z',
      last_used_at: null,
      revoked_at: null,
    };
  }
  async function authenticated(apiKey: ApiKey) {
    await grantTestScopedCredentialProjectAccess(setup.db, apiKey);
    const instance = new Hono();
    instance.use('*', async (c, next) => {
      c.set('apiKey', apiKey);
      await next();
    });
    return instance.route('/', workspaceAuthoringRoutes);
  }
  it('requires exact project authority and separate inspect/propose scopes', async () => {
    const reader = await authenticated(credential(['transition:inspect']));
    // Scope checks precede any authoring-state read.
    expect(
      (
        await reader.request(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            request_id: 'unauthorized',
            expected_workspace_revision: 1,
            expected_ref_head: null,
          }),
        })
      ).status
    ).toBe(403);
    const other = (await insertProject(setup.db, { name: 'Another tenant' })).projectId;
    const outsider = await authenticated(
      credential(['transition:inspect', 'transition:propose'], other)
    );
    expect((await outsider.request(url)).status).toBe(403);
    const writer = await authenticated(credential(['transition:propose']));
    expect((await writer.request(url)).status).toBe(403);
  });
  const post = (target: string, body: unknown) =>
    app.request(target, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  it('initializes idempotently, publishes an action, then recovers it through a separate read', async () => {
    const init = { request_id: 'init', expected_workspace_revision: 1, expected_ref_head: null };
    expect((await post(url, init)).status).toBe(200);
    expect((await post(url, init)).status).toBe(200);
    const request = {
      request_id: 'edit',
      expected_workspace_revision: 2,
      expected_revision: 0,
      expected_ref_head: null,
      operations: [{ set: { path: 'name', value: 'T3X' } }],
    };
    const saved = await post(`${url}/actions`, request);
    expect(saved.status).toBe(200);
    expect((await saved.json()).data.action.actor).toEqual({
      kind: 'human',
      id: 'human:local-user',
    });
    expect((await (await post(`${url}/actions`, request)).json()).data.kind).toBe('reused');
    const view = await (await app.request(url)).json();
    expect(view.data.selected.cards[0].after).toBe('T3X');
    expect(view.data.compositionRevision).toBe(1);
    expect((await post(`${url}/actions`, { ...request, request_id: 'stale' })).status).toBe(409);
    expect(
      (await post(`${url}/actions`, { ...request, actor: { id: 'forged', kind: 'human' } })).status
    ).toBe(400);
  });
});
