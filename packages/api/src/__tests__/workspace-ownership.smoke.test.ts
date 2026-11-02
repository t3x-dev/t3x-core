import { createClient } from '@t3x-dev/api-client';
import { createYOpsState } from '@t3x-dev/core';
import type { AnyDB } from '@t3x-dev/storage';
import {
  createApiKey,
  createPostgresCollaborationLifecycleUnitOfWork,
  createUser,
  findWorkspaceDraft,
  insertBranch,
  insertProject,
  revokeApiKey,
} from '@t3x-dev/storage';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRateLimitStore, setupTestDB } from './setup';

let testDb: AnyDB;
vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(testDb)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

import { createApp } from '../app';
import { replayEventsSince } from '../lib/event-replay';
import { commitRepositoryYOpsState } from '../lib/repository-state-transition';

const keyA = 't3xk_workspace_test_a_0123456789abcdef';
const keyAMcp = 't3xk_workspace_test_a_mcp_0123456789ab';
const keyB = 't3xk_workspace_test_b_0123456789abcdef';

describe('principal-private Workspace boundary', () => {
  const originalAuthDisabled = process.env.AUTH_DISABLED;
  const { app } = createApp({ skipLocalAuth: true, rateLimitStore: createTestRateLimitStore() });
  let cleanup: () => Promise<void>;
  let projectId: string;
  let testAId: string;
  let testBId: string;
  let mcpKeyId: string;

  beforeAll(async () => {
    const setup = await setupTestDB();
    testDb = setup.db;
    cleanup = setup.cleanup;
    const testA = await createUser(testDb, {
      email: 'test-a@workspace.example.test',
      name: 'test-a',
    });
    const testB = await createUser(testDb, {
      email: 'test-b@workspace.example.test',
      name: 'test-b',
    });
    testAId = testA.id;
    testBId = testB.id;
    const project = await insertProject(testDb, {
      name: 'Two principal Workspace test',
      ownerId: testA.id,
    });
    projectId = project.projectId;
    if (!project.namespaceId) throw new Error('Test project has no canonical namespace');
    await insertBranch(testDb, { projectId, name: 'main' });
    await createPostgresCollaborationLifecycleUnitOfWork(testDb).transaction((tx) =>
      tx.upsertProjectGrant({
        namespaceId: project.namespaceId!,
        projectId,
        principal: { kind: 'human', principal_id: testB.id },
        role: 'editor',
        expiresAt: null,
      })
    );
    await createApiKey(testDb, {
      name: 'test-a Web',
      userId: testA.id,
      keyValue: keyA,
      transitionScopes: ['transition:inspect', 'transition:propose'],
    });
    mcpKeyId = (
      await createApiKey(testDb, {
        name: 'test-a MCP',
        userId: testA.id,
        keyValue: keyAMcp,
        principalKind: 'service',
        projectId,
        transitionScopes: ['transition:inspect', 'transition:propose'],
      })
    ).id;
    await createApiKey(testDb, {
      name: 'test-b Web',
      userId: testB.id,
      keyValue: keyB,
      transitionScopes: ['transition:inspect', 'transition:propose'],
    });
  });

  afterAll(async () => {
    if (originalAuthDisabled === undefined) delete process.env.AUTH_DISABLED;
    else process.env.AUTH_DISABLED = originalAuthDisabled;
    await cleanup();
  });

  beforeEach(() => {
    process.env.AUTH_DISABLED = 'false';
  });

  const request = (path: string, key: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${key}`);
    return app.request(path, { ...init, headers });
  };

  const mcpApiClient = () =>
    createClient({
      baseUrl: 'http://t3x.test/api',
      headers: { Authorization: `Bearer ${keyAMcp}` },
      fetch: (input, init) => app.fetch(new Request(input, init)),
    });

  const saveWorkspace = (workspaceId: string, key: string, title: string) =>
    request(`/api/v1/projects/${projectId}/workspaces/${workspaceId}`, key, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        workspace: {
          id: workspaceId,
          projectId,
          title,
          status: 'draft',
          targetBranch: 'main',
          sourceBundle: [],
          schemaBindings: [],
          yopsDraft: { id: `draft:${workspaceId}`, operations: [] },
          outputTargets: [],
        },
      }),
    });

  it('lets test-a and test-b own distinct private Workspaces on the same ref', async () => {
    expect((await saveWorkspace('workspace-a', keyA, 'A private draft')).status).toBe(200);
    expect((await saveWorkspace('workspace-b', keyB, 'B private draft')).status).toBe(200);

    const storedA = await findWorkspaceDraft(testDb, projectId, 'workspace-a');
    const storedB = await findWorkspaceDraft(testDb, projectId, 'workspace-b');
    expect(storedA).toMatchObject({
      owner_principal_kind: 'human',
      owner_principal_id: testAId,
      target_branch: 'main',
    });
    expect(storedB).toMatchObject({
      owner_principal_kind: 'human',
      owner_principal_id: testBId,
      target_branch: 'main',
    });

    const listA = await (await request(`/api/v1/projects/${projectId}/workspaces`, keyA)).json();
    const listB = await (await request(`/api/v1/projects/${projectId}/workspaces`, keyB)).json();
    expect(listA.data.workspaces.map((item: { id: string }) => item.id)).toEqual(['workspace-a']);
    expect(listB.data.workspaces.map((item: { id: string }) => item.id)).toEqual(['workspace-b']);
  });

  it('lets test-a Web and MCP credentials read one Draft but hides it from test-b', async () => {
    await expect(mcpApiClient().workspaces.get(projectId, 'workspace-a')).resolves.toMatchObject({
      workspace: { id: 'workspace-a', title: 'A private draft' },
    });
    const initialized = await request(
      `/api/v1/projects/${projectId}/workspaces/workspace-a/authoring`,
      keyA,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          request_id: 'test-a-web-initialize',
          expected_workspace_revision: 1,
          expected_ref_head: null,
        }),
      }
    );
    expect(initialized.status, await initialized.clone().text()).toBe(200);
    const initializedView = (await initialized.json()).data;
    await expect(
      mcpApiClient().workspaces.authoring.publish(projectId, 'workspace-a', {
        request_id: 'test-a-mcp-edit',
        expected_workspace_revision: initializedView.workspaceRevision,
        expected_revision: initializedView.compositionRevision,
        expected_ref_head: null,
        operations: [{ set: { path: 'product/title', value: 'Shared A Draft' } }],
      })
    ).resolves.toMatchObject({ kind: 'published', compositionRevision: 1 });
    const webView = await (
      await request(`/api/v1/projects/${projectId}/workspaces/workspace-a/authoring`, keyA)
    ).json();
    expect(webView.data.current).toMatchObject({ product: { title: 'Shared A Draft' } });
    expect(webView.data.selected.action.actor).toEqual({
      kind: 'service',
      id: `service:api-key:${mcpKeyId}`,
      delegator: { kind: 'human', id: `user:${testAId}` },
    });
    for (const target of [
      `/api/v1/projects/${projectId}/workspaces/workspace-a`,
      `/api/v1/projects/${projectId}/workspaces/workspace-a/authoring`,
    ]) {
      const response = await request(target, keyB);
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toMatchObject({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Workspace not found' },
      });
    }
  });

  it('blocks test-b write, reconcile, Review and Commit before Draft metadata is read', async () => {
    const attempts: Array<[string, string, unknown]> = [
      [
        'PATCH',
        `/api/v1/projects/${projectId}/workspaces/workspace-a`,
        { workspace: { id: 'workspace-a', title: 'stolen', targetBranch: 'main' } },
      ],
      [
        'POST',
        `/api/v1/projects/${projectId}/workspaces/workspace-a/authoring/reconciliation`,
        { request_id: 'steal-sync', expected_workspace_revision: 1, expected_ref_head: null },
      ],
      [
        'POST',
        `/api/v1/projects/${projectId}/workspaces/workspace-a/authoring/reconciliation/preparations`,
        { expected_workspace_revision: 1, expected_ref_head: null },
      ],
      [
        'POST',
        `/api/v1/projects/${projectId}/workspaces/workspace-a/authoring/reconciliation/decisions`,
        {
          request_id: 'steal-decision',
          expected_workspace_revision: 1,
          expected_ref_head: null,
          preparation_digest: `sha256:${'0'.repeat(64)}`,
          action: 'discard',
        },
      ],
      [
        'POST',
        `/api/v1/projects/${projectId}/workspaces/workspace-a/transition/review`,
        { content: { trees: [], relations: [] } },
      ],
      [
        'POST',
        `/api/v1/projects/${projectId}/workspaces/workspace-a/commit`,
        { content: { trees: [], relations: [] }, message: 'steal' },
      ],
    ];
    for (const [method, path, body] of attempts) {
      const response = await request(path, keyB, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(404);
    }
    expect(
      (await findWorkspaceDraft(testDb, projectId, 'workspace-a'))?.workspace_state?.title
    ).toBe('A private draft');
  });

  it('notifies both principals when test-b advances main and lets test-a explicitly adopt through Web and MCP', async () => {
    const advanced = await commitRepositoryYOpsState({
      db: testDb,
      projectId,
      refName: 'main',
      expectedHead: null,
      target: createYOpsState({ branchStatus: 'advanced-by-test-b' }),
      actor: { kind: 'human', id: `user:${testBId}` },
    });
    const events = await replayEventsSince(testDb, { sinceId: 0n, projectId });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'branch.advanced',
          payload: expect.objectContaining({
            ref_name: 'main',
            previous_head: null,
            head: advanced.commitDigest,
          }),
        }),
      ])
    );

    const webView = await (
      await request(`/api/v1/projects/${projectId}/workspaces/workspace-a/authoring`, keyA)
    ).json();
    expect(webView.data).toMatchObject({
      current: { product: { title: 'Shared A Draft' } },
      synchronization: { required: true, currentRefHead: advanced.commitDigest },
    });
    const preparePath = `/api/v1/projects/${projectId}/workspaces/workspace-a/authoring/reconciliation/preparations`;
    const preparedResponse = await request(preparePath, keyA, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        expected_workspace_revision: webView.data.workspaceRevision,
        expected_ref_head: advanced.commitDigest,
      }),
    });
    expect(preparedResponse.status, await preparedResponse.clone().text()).toBe(200);
    const preparation = (await preparedResponse.json()).data;
    expect(preparation).toMatchObject({
      baseHead: null,
      currentRefHead: advanced.commitDigest,
      ours: { product: { title: 'Shared A Draft' } },
      theirs: { branchStatus: 'advanced-by-test-b' },
      merged: {
        product: { title: 'Shared A Draft' },
        branchStatus: 'advanced-by-test-b',
      },
      conflicts: [],
    });
    expect((await request(preparePath, keyB, { method: 'POST' })).status).toBe(404);

    await expect(
      mcpApiClient().workspaces.authoring.decideReconciliation(projectId, 'workspace-a', {
        request_id: 'test-a-mcp-adopt-branch',
        expected_workspace_revision: preparation.workspaceRevision,
        expected_ref_head: advanced.commitDigest,
        preparation_digest: preparation.preparationDigest,
        action: 'adopt',
      })
    ).resolves.toMatchObject({ kind: 'reconciled' });
    const synchronized = await (
      await request(`/api/v1/projects/${projectId}/workspaces/workspace-a/authoring`, keyA)
    ).json();
    expect(synchronized.data).toMatchObject({
      current: {
        product: { title: 'Shared A Draft' },
        branchStatus: 'advanced-by-test-b',
      },
      basis: { refHead: advanced.commitDigest },
      synchronization: { required: false, currentRefHead: advanced.commitDigest },
    });
    const stored = await findWorkspaceDraft(testDb, projectId, 'workspace-a');
    expect((stored?.workspace_state?.authoringReconciliations as unknown[]).at(-1)).toMatchObject({
      outcome: 'adopt',
      preparationDigest: preparation.preparationDigest,
      actor: {
        kind: 'service',
        id: `service:api-key:${mcpKeyId}`,
        delegator: { kind: 'human', id: `user:${testAId}` },
      },
    });
  });

  it('observes MCP credential revocation at the next request boundary', async () => {
    await expect(mcpApiClient().workspaces.get(projectId, 'workspace-a')).resolves.toBeTruthy();
    await revokeApiKey(testDb, mcpKeyId);
    await expect(mcpApiClient().workspaces.get(projectId, 'workspace-a')).rejects.toThrow(
      /401|Invalid API key/
    );
  });
});
