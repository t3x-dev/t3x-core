import { describe, expect, it } from 'vitest';
import {
  AcceptCollaborationInvitationRequestSchema,
  CollaborationInvitationSchema,
  CreateCollaborationInvitationResponseSchema,
  ListNamespaceAccountsResponseSchema,
  UpsertNamespaceMemberRequestSchema,
  UpsertProjectGuestRequestSchema,
} from '../collaboration.js';

const NOW = '2026-08-31T00:00:00.000Z';
const LATER = '2026-09-07T00:00:00.000Z';
const TOKEN = `t3xi_v1_${'a'.repeat(43)}`;

const human = {
  kind: 'human' as const,
  principal_id: 'user_123',
  display_name: 'Ada',
  email: 'ada@example.com',
  avatar_url: null,
};

const namespaceInvitation = {
  invitation_id: 'inv_123',
  target: {
    kind: 'namespace' as const,
    namespace_id: 'ns_123',
    project_id: null,
  },
  recipient: { user_id: null, email: 'invitee@example.com' },
  role: 'editor' as const,
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

describe('collaboration API contracts', () => {
  it('parses WebUI-ready namespace account projections', () => {
    const projection = {
      version: 1,
      namespaces: [
        {
          namespace: {
            namespace_id: 'ns_123',
            slug: 'ada',
            kind: 'personal',
            display_name: 'Ada',
          },
          current_membership: {
            membership_id: 'nsm_123',
            namespace_id: 'ns_123',
            principal: human,
            role: 'owner',
            status: 'active',
            created_at: NOW,
            updated_at: NOW,
          },
          authorized_actions: ['namespace:read', 'project:create'],
        },
      ],
    };

    expect(ListNamespaceAccountsResponseSchema.parse(projection)).toEqual(projection);
  });

  it('keeps billing and entitlement fields outside namespace projections', () => {
    const parsed = ListNamespaceAccountsResponseSchema.safeParse({
      version: 1,
      namespaces: [],
      plan: 'pro',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects invitation persistence secrets and mismatched target shapes', () => {
    expect(
      CollaborationInvitationSchema.safeParse({
        ...namespaceInvitation,
        token_hash: `sha256:${'a'.repeat(64)}`,
      }).success
    ).toBe(false);
    expect(
      CollaborationInvitationSchema.safeParse({
        ...namespaceInvitation,
        target: { ...namespaceInvitation.target, kind: 'project' },
      }).success
    ).toBe(false);
  });

  it('requires a recipient binding and forbids direct owner assignment', () => {
    expect(
      CollaborationInvitationSchema.safeParse({
        ...namespaceInvitation,
        recipient: { user_id: null, email: null },
      }).success
    ).toBe(false);
    expect(
      UpsertNamespaceMemberRequestSchema.safeParse({
        principal: { kind: 'human', principal_id: 'user_456' },
        role: 'owner',
      }).success
    ).toBe(false);
  });

  it('rejects inconsistent invitation lifecycle projections', () => {
    expect(
      CollaborationInvitationSchema.safeParse({
        ...namespaceInvitation,
        status: 'accepted',
      }).success
    ).toBe(false);
    expect(
      CollaborationInvitationSchema.safeParse({
        ...namespaceInvitation,
        expires_at: NOW,
      }).success
    ).toBe(false);
  });

  it('keeps server-only lifecycle fields out of mutation requests', () => {
    expect(
      UpsertProjectGuestRequestSchema.safeParse({
        principal: { kind: 'human', principal_id: 'user_456' },
        role: 'viewer',
        expires_at: LATER,
        namespace_id: 'ns_untrusted',
      }).success
    ).toBe(false);
  });

  it('isolates raw tokens to the one-time delivery and acceptance envelopes', () => {
    expect(
      CreateCollaborationInvitationResponseSchema.parse({
        invitation: namespaceInvitation,
        delivery: { mode: 'manual', token: TOKEN },
      }).delivery
    ).toEqual({ mode: 'manual', token: TOKEN });
    expect(AcceptCollaborationInvitationRequestSchema.parse({ token: TOKEN })).toEqual({
      token: TOKEN,
    });
    expect(
      CreateCollaborationInvitationResponseSchema.safeParse({
        invitation: namespaceInvitation,
        delivery: { mode: 'email_queued', token: TOKEN },
      }).success
    ).toBe(false);
  });
});
