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
          user_id: 'user_invitation_route_recipient',
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
        recipient: { user_id: 'user_invitation_route_recipient', email: null },
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
