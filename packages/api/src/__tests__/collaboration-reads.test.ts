import type { ApiKey } from '@t3x-dev/core';
import type { AnyDB } from '@t3x-dev/storage';
import {
  collaborationInvitations,
  insertPersonalNamespace,
  insertProject,
  namespaceMemberships,
  projectGrants,
  users,
} from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB } from './setup';

let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

import { collaborationReadRoutes } from '../routes/collaboration-reads.openapi';

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
  app.route('/', collaborationReadRoutes);
  return app;
}

describe('collaboration read routes', () => {
  let cleanup: () => Promise<void>;
  let namespaceId: string;
  let projectId: string;

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    await mockDB.insert(users).values([
      {
        id: 'user_collaboration_reader_owner',
        username: 'reader-owner',
        email: 'owner@example.com',
        emailVerified: true,
        name: 'Owner',
        avatarUrl: 'https://example.com/owner.png',
      },
      {
        id: 'user_collaboration_reader_guest',
        username: 'grace-guest',
        email: 'guest@example.com',
        emailVerified: true,
        name: 'Guest',
      },
      { id: 'user_collaboration_reader_outsider', username: 'outside-reader' },
    ]);
    const namespace = await insertPersonalNamespace(mockDB, {
      slug: 'collaboration-reader',
      ownerUserId: 'user_collaboration_reader_owner',
      displayName: 'Collaboration Reader',
    });
    namespaceId = namespace.namespaceId;
    const project = await insertProject(mockDB, {
      name: 'Collaboration read project',
      ownerId: 'user_collaboration_reader_owner',
      namespaceId,
    });
    projectId = project.projectId;

    await mockDB.insert(namespaceMemberships).values({
      membershipId: 'nsm_collaboration_reader_editor',
      namespaceId,
      principalKind: 'human',
      principalId: 'user_collaboration_reader_guest',
      role: 'editor',
      status: 'active',
    });
    await mockDB.insert(projectGrants).values({
      grantId: 'grant_collaboration_reader_guest',
      namespaceId,
      projectId,
      principalKind: 'human',
      principalId: 'user_collaboration_reader_guest',
      role: 'viewer',
      status: 'active',
    });
    await mockDB.insert(collaborationInvitations).values([
      {
        invitationId: 'inv_collaboration_reader_namespace',
        namespaceId,
        recipientEmail: 'member@example.com',
        role: 'viewer',
        tokenHash: 'sha256:must-never-leave-storage',
        status: 'pending',
        createdByPrincipalKind: 'human',
        createdByPrincipalId: 'user_collaboration_reader_owner',
        expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      },
      {
        invitationId: 'inv_collaboration_reader_project',
        namespaceId,
        projectId,
        recipientEmail: 'project-guest@example.com',
        role: 'viewer',
        tokenHash: 'sha256:also-must-never-leave-storage',
        status: 'pending',
        createdByPrincipalKind: 'human',
        createdByPrincipalId: 'user_collaboration_reader_owner',
        expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      },
      {
        invitationId: 'inv_collaboration_reader_received',
        namespaceId,
        projectId,
        recipientUserId: 'user_collaboration_reader_guest',
        role: 'editor',
        tokenHash: 'sha256:received-inbox-token',
        status: 'pending',
        createdByPrincipalKind: 'human',
        createdByPrincipalId: 'user_collaboration_reader_owner',
        expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      },
    ]);
  });

  afterAll(async () => cleanup());

  it('lists only the caller current accounts with evaluator-derived actions', async () => {
    const response = await appFor('user_collaboration_reader_owner').request('/v1/namespaces');
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({
      success: true,
      data: {
        version: 1,
        namespaces: [
          {
            namespace: { namespace_id: namespaceId, slug: 'collaboration-reader' },
            current_membership: {
              principal: { kind: 'human', email: 'owner@example.com' },
              role: 'owner',
            },
          },
        ],
      },
    });
    expect(payload.data.namespaces[0].authorized_actions).toContain('namespace:ownership:transfer');
  });

  it('returns safe member, guest, and invitation projections', async () => {
    const app = appFor('user_collaboration_reader_owner');
    const [members, guests, namespaceInvites, projectInvites] = await Promise.all([
      app.request(`/v1/namespaces/${namespaceId}/members`),
      app.request(`/v1/projects/${projectId}/guests`),
      app.request(`/v1/namespaces/${namespaceId}/invitations`),
      app.request(`/v1/projects/${projectId}/invitations`),
    ]);
    expect([members.status, guests.status, namespaceInvites.status, projectInvites.status]).toEqual(
      [200, 200, 200, 200]
    );
    expect(JSON.stringify(await members.json())).toContain('guest@example.com');
    expect(JSON.stringify(await guests.json())).toContain('grant_collaboration_reader_guest');
    const invitationPayloads = JSON.stringify([
      await namespaceInvites.json(),
      await projectInvites.json(),
    ]);
    expect(invitationPayloads).not.toContain('token_hash');
    expect(invitationPayloads).not.toContain('must-never-leave-storage');
    expect(invitationPayloads).toContain('inv_collaboration_reader_namespace');
    expect(invitationPayloads).toContain('inv_collaboration_reader_project');
  });

  it('supports partial collaborator search without exposing private identity fields', async () => {
    const response = await appFor('user_collaboration_reader_owner').request(
      '/v1/users/search?q=grace'
    );
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({
      data: {
        users: [
          {
            user_id: 'user_collaboration_reader_guest',
            username: 'grace-guest',
            display_name: 'Guest',
          },
        ],
      },
    });
    expect(JSON.stringify(payload)).not.toContain('guest@example.com');
  });

  it('resolves recorded user IDs to current public usernames for any signed-in collaborator', async () => {
    const response = await appFor('user_collaboration_reader_owner').request('/v1/users/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids: [
          'user_collaboration_reader_guest',
          'user_collaboration_reader_outsider',
          'user_missing',
        ],
      }),
    });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data.users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          user_id: 'user_collaboration_reader_guest',
          username: 'grace-guest',
        }),
        expect.objectContaining({
          user_id: 'user_collaboration_reader_outsider',
          username: 'outside-reader',
        }),
      ])
    );
    expect(payload.data.users).toHaveLength(2);
    expect(JSON.stringify(payload)).not.toContain('guest@example.com');
  });

  it('requires a signed-in principal to resolve user IDs', async () => {
    const app = new Hono();
    app.route('/', collaborationReadRoutes);
    const response = await app.request('/v1/users/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ['user_collaboration_reader_guest'] }),
    });
    expect(response.status).toBe(403);
  });

  it('lists pending invitations received by the authenticated user', async () => {
    const response = await appFor('user_collaboration_reader_guest').request('/v1/invitations');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        invitations: [
          {
            invitation: { invitation_id: 'inv_collaboration_reader_received', role: 'editor' },
            namespace: { slug: 'collaboration-reader' },
            project: { name: 'Collaboration-read-project' },
          },
        ],
      },
    });
  });

  it('fails closed for a principal outside the namespace', async () => {
    const app = appFor('user_collaboration_reader_outsider');
    expect((await app.request(`/v1/namespaces/${namespaceId}/members`)).status).toBe(403);
    expect((await app.request(`/v1/projects/${projectId}/guests`)).status).toBe(403);
  });
});
