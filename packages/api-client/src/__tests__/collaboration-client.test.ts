import { describe, expect, it, vi } from 'vitest';
import { type T3xApiError, T3xClient } from '../client.js';

const NOW = '2026-08-31T00:00:00.000Z';
const LATER = '2026-09-07T00:00:00.000Z';
const TOKEN = `t3xi_v1_${'a'.repeat(43)}`;

function mockFetch(data: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    json: () => Promise.resolve(data),
  }) as unknown as typeof fetch;
}

function success(data: unknown) {
  return { success: true, data };
}

function mutation(kind: string) {
  return {
    request_id: 'request_123',
    kind,
    outcome: 'applied',
    evaluated_at: NOW,
  };
}

const human = {
  kind: 'human' as const,
  principal_id: 'user_123',
  display_name: 'Ada',
  email: 'ada@example.com',
  avatar_url: null,
};

const member = {
  membership_id: 'nsm_123',
  namespace_id: 'ns/123',
  principal: human,
  role: 'editor' as const,
  status: 'active' as const,
  created_at: NOW,
  updated_at: NOW,
};

const invitation = {
  invitation_id: 'inv_123',
  target: { kind: 'namespace' as const, namespace_id: 'ns/123', project_id: null },
  recipient: { user_id: null, email: 'invitee@example.com' },
  role: 'viewer' as const,
  status: 'pending' as const,
  created_by: { kind: 'human' as const, principal_id: 'user_123' },
  created_at: NOW,
  updated_at: NOW,
  expires_at: LATER,
  accepted_at: null,
  accepted_by_user_id: null,
  revoked_at: null,
  expired_at: null,
};

describe('T3xClient collaboration methods', () => {
  it('lists versioned namespace account projections with response validation', async () => {
    const fetchFn = mockFetch(success({ version: 1, namespaces: [] }));
    const client = new T3xClient({ baseUrl: 'https://api.example.test', fetch: fetchFn });

    await expect(client.listNamespaceAccounts()).resolves.toEqual({ version: 1, namespaces: [] });
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.example.test/v1/namespaces',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('encodes namespace IDs and validates member mutation results', async () => {
    const fetchFn = mockFetch(success({ member, mutation: mutation('namespace_member.upsert') }));
    const client = new T3xClient({ baseUrl: 'https://api.example.test', fetch: fetchFn });
    const input = {
      principal: { kind: 'human' as const, principal_id: 'user_123' },
      role: 'editor' as const,
    };

    await expect(client.upsertNamespaceMember('ns/123', input)).resolves.toMatchObject({ member });
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.example.test/v1/namespaces/ns%2F123/members',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify(input) })
    );
  });

  it('exposes project guest reads and mutations through canonical project paths', async () => {
    const listFetch = mockFetch(
      success({
        version: 1,
        namespace_id: 'ns_123',
        project_id: 'project/123',
        authorized_actions: ['project:read'],
        guests: [],
      })
    );
    const listClient = new T3xClient({ baseUrl: 'https://api.example.test', fetch: listFetch });
    await listClient.listProjectGuests('project/123');
    expect(listFetch).toHaveBeenCalledWith(
      'https://api.example.test/v1/projects/project%2F123/guests',
      expect.objectContaining({ method: 'GET' })
    );

    const revokeFetch = mockFetch(success(mutation('project_guest.revoke')));
    const revokeClient = new T3xClient({ baseUrl: 'https://api.example.test', fetch: revokeFetch });
    await revokeClient.revokeProjectGuest('project/123', 'grant/123');
    expect(revokeFetch).toHaveBeenCalledWith(
      'https://api.example.test/v1/projects/project%2F123/guests/grant%2F123',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('keeps invitation secrets in request bodies instead of URLs', async () => {
    const fetchFn = mockFetch(
      success({
        authority: { kind: 'namespace_membership', membership: member },
        mutation: mutation('invitation.accept'),
      })
    );
    const client = new T3xClient({ baseUrl: 'https://api.example.test', fetch: fetchFn });

    await client.acceptCollaborationInvitation({ token: TOKEN });
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.example.test/v1/invitations/accept',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ token: TOKEN }) })
    );
    expect(fetchFn).not.toHaveBeenCalledWith(expect.stringContaining(TOKEN), expect.anything());
  });

  it('validates one-time invitation delivery responses', async () => {
    const fetchFn = mockFetch(
      success({
        invitation,
        delivery: { mode: 'manual', token: TOKEN },
        mutation: mutation('invitation.create'),
      })
    );
    const client = new T3xClient({ baseUrl: 'https://api.example.test', fetch: fetchFn });

    await expect(
      client.createNamespaceInvitation('ns/123', {
        recipient: { user_id: null, email: 'invitee@example.com' },
        role: 'viewer',
        expires_at: LATER,
      })
    ).resolves.toMatchObject({ delivery: { mode: 'manual', token: TOKEN } });
  });

  it('fails closed when a collaboration response has an unrecognized shape', async () => {
    const fetchFn = mockFetch(success({ version: 1, namespaces: [], plan: 'pro' }));
    const client = new T3xClient({ baseUrl: 'https://api.example.test', fetch: fetchFn });

    await expect(client.listNamespaceAccounts()).rejects.toMatchObject<Partial<T3xApiError>>({
      code: 'INVALID_RESPONSE',
    });
  });
});
