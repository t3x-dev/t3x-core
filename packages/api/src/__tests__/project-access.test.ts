/** Canonical namespace and project authorization integration tests. */

import type { AnyDB, Namespace } from '@t3x-dev/storage';
import {
  deleteProject,
  findPersonalNamespaceByOwner,
  findProjectById,
  findProjects,
  insertPersonalNamespace,
  insertProject,
  namespaceMemberships,
  projectGrants,
} from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDB } from './setup';

type ApiResponse = Record<string, unknown> & {
  success: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
};

let mockDB: AnyDB;
const originalAuthDisabled = process.env.AUTH_DISABLED;
const originalOperatorUserIds = process.env.T3X_OPERATOR_USER_IDS;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

import { importRoutes } from '../routes/import.openapi';
import { projectRoutes } from '../routes/projects.openapi';

function createApp(input?: {
  keyId?: string;
  userId?: string | null;
  projectId?: string | null;
  principalKind?: 'human' | 'agent' | 'service';
}) {
  const app = new Hono();
  if (input) {
    app.use('*', async (c, next) => {
      // biome-ignore lint/suspicious/noExplicitAny: test context mock
      (c as any).set('apiKey', {
        id: input.keyId ?? 'ak_test',
        user_id: input.userId ?? null,
        project_id: input.projectId ?? null,
        principal_kind: input.principalKind ?? 'human',
        transition_scopes: [],
        key_prefix: 'test',
        name: 'test',
      });
      return next();
    });
  }
  app.route('/', projectRoutes);
  app.route('/', importRoutes);
  return app;
}

async function ensurePersonalNamespace(userId: string): Promise<Namespace> {
  return (
    (await findPersonalNamespaceByOwner(mockDB, userId)) ??
    insertPersonalNamespace(mockDB, {
      slug: userId.replaceAll('_', '-').slice(0, 40),
      ownerUserId: userId,
    })
  );
}

async function insertMemberProject(userId: string, name: string, ownerId = userId) {
  const namespace = await ensurePersonalNamespace(userId);
  return insertProject(mockDB, { name, ownerId, namespaceId: namespace.namespaceId });
}

async function grantProject(input: {
  projectId: string;
  namespaceId: string;
  principalId: string;
  principalKind?: 'human' | 'agent' | 'service';
  role?: 'admin' | 'editor' | 'viewer';
  status?: 'active' | 'revoked';
}) {
  const status = input.status ?? 'active';
  await mockDB.insert(projectGrants).values({
    grantId: `grant_${input.principalId}_${input.projectId}`,
    projectId: input.projectId,
    namespaceId: input.namespaceId,
    principalKind: input.principalKind ?? 'human',
    principalId: input.principalId,
    role: input.role ?? 'viewer',
    status,
    revokedAt: status === 'revoked' ? new Date() : null,
  });
}

function cfpack(name: string) {
  return {
    version: '2.0.0',
    project: {
      project_id: 'project_exported',
      name,
      created_at: '2026-08-11T00:00:00.000Z',
    },
    conversations: [],
    turns: [],
    leaves: [],
    pins: [],
    meta: {
      exported_at: '2026-08-11T00:00:00.000Z',
      exported_by: 'project-access-test',
      format_version: '2.0.0',
    },
  };
}

describe('canonical project access', () => {
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;
  });

  afterAll(async () => {
    if (originalAuthDisabled === undefined) delete process.env.AUTH_DISABLED;
    else process.env.AUTH_DISABLED = originalAuthDisabled;
    if (originalOperatorUserIds === undefined) delete process.env.T3X_OPERATOR_USER_IDS;
    else process.env.T3X_OPERATOR_USER_IDS = originalOperatorUserIds;
    await cleanup();
  });

  beforeEach(async () => {
    process.env.AUTH_DISABLED = 'false';
    delete process.env.T3X_OPERATOR_USER_IDS;
    const projects = await findProjects(mockDB, {});
    for (const project of projects) await deleteProject(mockDB, project.projectId);
  });

  it('lists namespace projects and exact guest grants without tenant leakage', async () => {
    const member = await insertMemberProject('user_list_member', 'Member project');
    const other = await insertMemberProject('user_list_other', 'Other project');
    const guest = await insertMemberProject('user_list_guest_owner', 'Guest project');
    if (!guest.namespaceId) throw new Error('project namespace missing');
    await grantProject({
      projectId: guest.projectId,
      namespaceId: guest.namespaceId,
      principalId: 'user_list_member',
    });

    const response = await createApp({ userId: 'user_list_member' }).request('/v1/projects');
    expect(response.status).toBe(200);
    const payload: ApiResponse = await response.json();
    const names = (payload.data?.projects as Array<{ name: string }>).map(
      (project) => project.name
    );
    expect(names).toContain(member.name);
    expect(names).toContain(guest.name);
    expect(names).not.toContain(other.name);
  });

  it('fails closed when an authenticated deployment has no canonical list authority', async () => {
    await insertMemberProject('user_hidden_list', 'Hidden project');

    const response = await createApp().request('/v1/projects');
    expect(response.status).toBe(403);
    expect(((await response.json()) as ApiResponse).error?.code).toBe('FORBIDDEN');
  });

  it('never treats historical owner_id as runtime authority', async () => {
    const foreignNamespace = await ensurePersonalNamespace('user_foreign_namespace');
    const project = await insertProject(mockDB, {
      name: 'Historical provenance only',
      ownerId: 'user_historical_owner',
      namespaceId: foreignNamespace.namespaceId,
    });

    const response = await createApp({ userId: 'user_historical_owner' }).request(
      `/v1/projects/${project.projectId}`
    );
    expect(response.status).toBe(403);
    expect(((await response.json()) as ApiResponse).error?.code).toBe('FORBIDDEN');
  });

  it('enforces the namespace role matrix for read, edit, and delete', async () => {
    const ownerNamespace = await ensurePersonalNamespace('user_role_owner');
    const project = await insertProject(mockDB, {
      name: 'Role matrix project',
      namespaceId: ownerNamespace.namespaceId,
    });
    await mockDB.insert(namespaceMemberships).values([
      {
        membershipId: 'nsm_role_viewer',
        namespaceId: ownerNamespace.namespaceId,
        principalKind: 'human',
        principalId: 'user_role_viewer',
        role: 'viewer',
        status: 'active',
      },
      {
        membershipId: 'nsm_role_editor',
        namespaceId: ownerNamespace.namespaceId,
        principalKind: 'human',
        principalId: 'user_role_editor',
        role: 'editor',
        status: 'active',
      },
    ]);

    const viewer = createApp({ userId: 'user_role_viewer' });
    expect((await viewer.request(`/v1/projects/${project.projectId}`)).status).toBe(200);
    expect(
      (
        await viewer.request(`/v1/projects/${project.projectId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Denied viewer update' }),
        })
      ).status
    ).toBe(403);

    const editor = createApp({ userId: 'user_role_editor' });
    expect(
      (
        await editor.request(`/v1/projects/${project.projectId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Editor update' }),
        })
      ).status
    ).toBe(200);
    expect(
      (await editor.request(`/v1/projects/${project.projectId}`, { method: 'DELETE' })).status
    ).toBe(403);
  });

  it('isolates project grants and rejects revoked grants', async () => {
    const allowed = await insertMemberProject('user_grant_owner', 'Granted project');
    const denied = await insertMemberProject('user_grant_other_owner', 'Other project');
    if (!allowed.namespaceId || !denied.namespaceId) throw new Error('project namespace missing');
    await grantProject({
      projectId: allowed.projectId,
      namespaceId: allowed.namespaceId,
      principalId: 'user_guest_viewer',
    });
    await grantProject({
      projectId: denied.projectId,
      namespaceId: denied.namespaceId,
      principalId: 'user_revoked_viewer',
      status: 'revoked',
    });

    const guest = createApp({ userId: 'user_guest_viewer' });
    expect((await guest.request(`/v1/projects/${allowed.projectId}`)).status).toBe(200);
    expect((await guest.request(`/v1/projects/${denied.projectId}`)).status).toBe(403);
    expect(
      (
        await createApp({ userId: 'user_revoked_viewer' }).request(
          `/v1/projects/${denied.projectId}`
        )
      ).status
    ).toBe(403);
  });

  it('requires both exact project binding and a stored grant for machine credentials', async () => {
    const bound = await insertMemberProject('user_agent_owner', 'Agent bound project');
    const other = await insertMemberProject('user_agent_other_owner', 'Agent other project');
    if (!bound.namespaceId) throw new Error('project namespace missing');
    await grantProject({
      projectId: bound.projectId,
      namespaceId: bound.namespaceId,
      principalKind: 'agent',
      principalId: 'ak_bound_agent',
      role: 'viewer',
    });

    const agent = createApp({
      keyId: 'ak_bound_agent',
      projectId: bound.projectId,
      principalKind: 'agent',
    });
    expect((await agent.request(`/v1/projects/${bound.projectId}`)).status).toBe(200);
    expect((await agent.request(`/v1/projects/${other.projectId}`)).status).toBe(403);
    expect(
      (
        await createApp({
          keyId: 'ak_ungranted_agent',
          projectId: bound.projectId,
          principalKind: 'agent',
        }).request(`/v1/projects/${bound.projectId}`)
      ).status
    ).toBe(403);
  });

  it('keeps the explicit AUTH_DISABLED local bypass', async () => {
    const project = await insertProject(mockDB, { name: 'Local project' });
    process.env.AUTH_DISABLED = 'true';

    expect((await createApp().request(`/v1/projects/${project.projectId}`)).status).toBe(200);
  });

  it('creates and imports projects into the authenticated personal namespace', async () => {
    const namespace = await ensurePersonalNamespace('user_creator');
    const app = createApp({ userId: 'user_creator' });

    const createResponse = await app.request('/v1/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Created project' }),
    });
    expect(createResponse.status).toBe(201);
    const createdId = ((await createResponse.json()) as ApiResponse).data?.project_id as string;
    expect(await findProjectById(mockDB, createdId)).toMatchObject({
      namespaceId: namespace.namespaceId,
      ownerId: 'user_creator',
    });

    const importResponse = await app.request('/v1/import/cfpack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfpack('Imported project')),
    });
    expect(importResponse.status).toBe(200);
    const importedId = ((await importResponse.json()) as ApiResponse).data?.project_id as string;
    expect(await findProjectById(mockDB, importedId)).toMatchObject({
      namespaceId: namespace.namespaceId,
      ownerId: 'user_creator',
    });
  });

  it('migrates operator-claimed legacy projects into canonical authority', async () => {
    process.env.T3X_OPERATOR_USER_IDS = 'user_claim_operator';
    const namespace = await ensurePersonalNamespace('user_claim_operator');
    const legacy = await insertProject(mockDB, { name: 'Legacy claim' });
    const app = createApp({ userId: 'user_claim_operator' });

    const response = await app.request('/v1/projects/claim-unowned', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_ids: [legacy.projectId] }),
    });
    expect(response.status).toBe(200);
    expect(await findProjectById(mockDB, legacy.projectId)).toMatchObject({
      ownerId: 'user_claim_operator',
      namespaceId: namespace.namespaceId,
    });
    expect((await app.request(`/v1/projects/${legacy.projectId}`)).status).toBe(200);
  });
});
