import type { ApiKey } from '@t3x-dev/core';
import type { AnyDB } from '@t3x-dev/storage';
import {
  insertPersonalNamespace,
  insertProject,
  namespaceMemberships,
  users,
} from '@t3x-dev/storage';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB } from './setup';

let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

import { collaborationCommandRoutes } from '../routes/collaboration-commands.openapi';

function appFor(userId: string) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    const apiKey: ApiKey = {
      id: `ak_${userId}`,
      user_id: userId,
      project_id: null,
      principal_kind: 'human',
      transition_scopes: [],
      key_prefix: 'test',
      name: 'test',
    };
    c.set('apiKey', apiKey);
    return next();
  });
  app.route('/', collaborationCommandRoutes);
  return app;
}

describe('collaboration member and guest commands', () => {
  let cleanup: () => Promise<void>;
  let namespaceId: string;
  let ownerMembershipId: string;
  let projectId: string;
  let secondProjectId: string;

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;
    await mockDB.insert(users).values([
      { id: 'user_collaboration_command_owner', emailVerified: true },
      { id: 'user_collaboration_command_member', emailVerified: true },
      { id: 'user_collaboration_command_guest', emailVerified: true },
      { id: 'user_collaboration_command_outsider', emailVerified: true },
    ]);
    const namespace = await insertPersonalNamespace(mockDB, {
      slug: 'collaboration-commands',
      ownerUserId: 'user_collaboration_command_owner',
    });
    namespaceId = namespace.namespaceId;
    const projects = await Promise.all([
      insertProject(mockDB, {
        name: 'Collaboration command project',
        ownerId: 'user_collaboration_command_owner',
        namespaceId,
      }),
      insertProject(mockDB, {
        name: 'Collaboration command second project',
        ownerId: 'user_collaboration_command_owner',
        namespaceId,
      }),
    ]);
    projectId = projects[0].projectId;
    secondProjectId = projects[1].projectId;

    const [ownerMembership] = await mockDB
      .select()
      .from(namespaceMemberships)
      .where(eq(namespaceMemberships.principalId, 'user_collaboration_command_owner'))
      .limit(1);
    if (!ownerMembership) throw new Error('owner membership missing');
    ownerMembershipId = ownerMembership.membershipId;
  });

  afterAll(async () => cleanup());

  it('upserts members and preserves the final active owner', async () => {
    const app = appFor('user_collaboration_command_owner');
    const add = await app.request(`/v1/namespaces/${namespaceId}/members`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        principal: { kind: 'human', principal_id: 'user_collaboration_command_member' },
        role: 'editor',
      }),
    });
    expect(add.status).toBe(200);
    expect(await add.json()).toMatchObject({
      success: true,
      data: { member: { role: 'editor' }, mutation: { kind: 'namespace_member.upsert' } },
    });

    const removeOwner = await app.request(
      `/v1/namespaces/${namespaceId}/members/${ownerMembershipId}`,
      { method: 'DELETE' }
    );
    expect(removeOwner.status).toBe(409);
    expect(await removeOwner.json()).toMatchObject({
      error: { details: { reason: 'LAST_OWNER_REQUIRED' } },
    });
  });

  it('grants, revokes, and idempotently re-revokes one exact project guest', async () => {
    const app = appFor('user_collaboration_command_owner');
    const grant = await app.request(`/v1/projects/${projectId}/guests`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        principal: { kind: 'human', principal_id: 'user_collaboration_command_guest' },
        role: 'viewer',
        expires_at: '2099-01-01T00:00:00.000Z',
      }),
    });
    expect(grant.status).toBe(200);
    const grantPayload = await grant.json();
    const grantId = grantPayload.data.guest.grant_id as string;

    const crossProject = await app.request(`/v1/projects/${secondProjectId}/guests/${grantId}`, {
      method: 'DELETE',
    });
    expect(crossProject.status).toBe(404);

    const revoke = () =>
      app.request(`/v1/projects/${projectId}/guests/${grantId}`, { method: 'DELETE' });
    expect(await (await revoke()).json()).toMatchObject({ data: { outcome: 'applied' } });
    expect(await (await revoke()).json()).toMatchObject({ data: { outcome: 'unchanged' } });
  });

  it('rejects expired grants and principals outside the namespace', async () => {
    const owner = appFor('user_collaboration_command_owner');
    const expired = await owner.request(`/v1/projects/${projectId}/guests`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        principal: { kind: 'human', principal_id: 'user_collaboration_command_guest' },
        role: 'viewer',
        expires_at: '2020-01-01T00:00:00.000Z',
      }),
    });
    expect(expired.status).toBe(409);

    const outsider = appFor('user_collaboration_command_outsider');
    expect(
      (
        await outsider.request(`/v1/namespaces/${namespaceId}/members`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            principal: { kind: 'human', principal_id: 'user_collaboration_command_guest' },
            role: 'viewer',
          }),
        })
      ).status
    ).toBe(403);
  });
});
