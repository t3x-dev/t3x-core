import type { ApiKey } from '@t3x-dev/core';
import type { AnyDB } from '@t3x-dev/storage';
import {
  collaborationInvitations,
  insertPersonalNamespace,
  insertProject,
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

import { collaborationInvitationRoutes } from '../routes/collaboration-invitations.openapi';

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
  app.route('/', collaborationInvitationRoutes);
  return app;
}

describe('collaboration invitation commands', () => {
  let cleanup: () => Promise<void>;
  let namespaceId: string;
  let projectId: string;

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;
    await mockDB.insert(users).values([
      {
        id: 'user_invitation_route_owner',
        email: 'owner@example.com',
        emailVerified: true,
      },
      {
        id: 'user_invitation_route_recipient',
        email: 'recipient@example.com',
        emailVerified: true,
      },
      {
        id: 'user_invitation_route_username_recipient',
        username: 'test-b3',
      },
      {
        id: 'user_invitation_route_outsider',
        email: 'outsider@example.com',
        emailVerified: true,
      },
    ]);
    const namespace = await insertPersonalNamespace(mockDB, {
      slug: 'invitation-routes',
      ownerUserId: 'user_invitation_route_owner',
    });
    namespaceId = namespace.namespaceId;
    projectId = (
      await insertProject(mockDB, {
        name: 'Invitation route project',
        ownerId: 'user_invitation_route_owner',
        namespaceId,
      })
    ).projectId;
  });

  afterAll(async () => cleanup());

  it('delivers a token once and atomically materializes recipient authority', async () => {
    const owner = appFor('user_invitation_route_owner');
    const created = await owner.request(`/v1/namespaces/${namespaceId}/invitations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: {
          user_id: null,
          email: 'Recipient@Example.com',
        },
        role: 'editor',
        expires_at: '2099-01-01T00:00:00.000Z',
      }),
    });
    expect(created.status).toBe(201);
    const payload = await created.json();
    expect(payload).toMatchObject({
      success: true,
      data: {
        invitation: { recipient: { email: 'recipient@example.com' }, role: 'editor' },
        delivery: { mode: 'manual' },
        mutation: { kind: 'invitation.create' },
      },
    });
    const token = payload.data.delivery.token as string;
    expect(token).toMatch(/^t3xi_v1_/);
    expect(JSON.stringify(payload)).not.toContain('token_hash');

    const [stored] = await mockDB
      .select({ tokenHash: collaborationInvitations.tokenHash })
      .from(collaborationInvitations)
      .where(eq(collaborationInvitations.invitationId, payload.data.invitation.invitation_id));
    expect(stored.tokenHash).toMatch(/^sha256:/);
    expect(stored.tokenHash).not.toContain(token);

    const recipient = appFor('user_invitation_route_recipient');
    const accept = () =>
      recipient.request('/v1/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
    const accepted = await accept();
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toMatchObject({
      data: {
        authority: { kind: 'namespace_membership', membership: { role: 'editor' } },
        mutation: { kind: 'invitation.accept' },
      },
    });
    expect((await accept()).status).toBe(409);
  });

  it('rejects a recipient mismatch without materializing authority', async () => {
    const owner = appFor('user_invitation_route_owner');
    const created = await owner.request(`/v1/projects/${projectId}/invitations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { user_id: null, email: 'recipient@example.com' },
        role: 'viewer',
        expires_at: '2099-01-01T00:00:00.000Z',
      }),
    });
    const payload = await created.json();
    const mismatch = await appFor('user_invitation_route_outsider').request(
      '/v1/invitations/accept',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: payload.data.delivery.token }),
      }
    );
    expect(mismatch.status).toBe(403);
    expect(await mismatch.json()).toMatchObject({
      error: { details: { reason: 'INVITATION_RECIPIENT_MISMATCH' } },
    });
  });

  it('resolves a project invitation username to the stable user id', async () => {
    const owner = appFor('user_invitation_route_owner');
    const create = () =>
      owner.request(`/v1/projects/${projectId}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { username: 'TEST-B3' },
          role: 'editor',
          expires_at: '2099-01-01T00:00:00.000Z',
        }),
      });
    const created = await create();

    expect(created.status, await created.clone().text()).toBe(201);
    const payload = await created.json();
    expect(payload.data.invitation.recipient).toEqual({
      user_id: 'user_invitation_route_username_recipient',
      email: null,
    });
    expect(payload.data.delivery).toEqual({ mode: 'inbox', token: null });
    const duplicate = await create();
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({
      error: {
        code: 'HASH_CONFLICT',
        message: 'This user already has a pending invitation. Revoke it before creating a new one.',
      },
    });
    const accepted = await appFor('user_invitation_route_username_recipient').request(
      `/v1/invitations/${payload.data.invitation.invitation_id}/accept`,
      { method: 'POST' }
    );
    expect(accepted.status, await accepted.clone().text()).toBe(200);
  });

  it('lets the exact recipient decline an inbox invitation', async () => {
    const created = await appFor('user_invitation_route_owner').request(
      `/v1/projects/${projectId}/invitations`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { user_id: 'user_invitation_route_outsider', email: null },
          role: 'viewer',
          expires_at: '2099-01-01T00:00:00.000Z',
        }),
      }
    );
    const invitationId = (await created.json()).data.invitation.invitation_id as string;
    const declined = await appFor('user_invitation_route_outsider').request(
      `/v1/invitations/${invitationId}/decline`,
      { method: 'POST' }
    );
    expect(declined.status).toBe(200);
    expect(await declined.json()).toMatchObject({
      data: { kind: 'invitation.revoke', outcome: 'applied' },
    });
  });

  it('revokes an exact invitation idempotently and denies outsiders', async () => {
    const owner = appFor('user_invitation_route_owner');
    const created = await owner.request(`/v1/projects/${projectId}/invitations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { user_id: null, email: 'revoke@example.com' },
        role: 'viewer',
        expires_at: '2099-01-01T00:00:00.000Z',
      }),
    });
    const invitationId = (await created.json()).data.invitation.invitation_id as string;
    expect(
      (
        await appFor('user_invitation_route_outsider').request(`/v1/invitations/${invitationId}`, {
          method: 'DELETE',
        })
      ).status
    ).toBe(403);

    const revoke = () => owner.request(`/v1/invitations/${invitationId}`, { method: 'DELETE' });
    expect(await (await revoke()).json()).toMatchObject({ data: { outcome: 'applied' } });
    expect(await (await revoke()).json()).toMatchObject({ data: { outcome: 'unchanged' } });
  });
});
