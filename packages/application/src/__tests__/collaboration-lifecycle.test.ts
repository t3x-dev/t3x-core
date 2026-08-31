import { describe, expect, it } from 'vitest';
import {
  assertInvitationMayBeAccepted,
  assertOwnerMutationAllowed,
  assertProjectGrantExpiry,
  buildNamespaceOwnershipTransferPlan,
  buildProjectTransferPlan,
  CollaborationInvariantError,
  type CollaborationInvitationDto,
  type NamespaceMembershipDto,
} from '../identity';

const NOW = '2026-08-31T00:00:00.000Z';

function membership(input: {
  id: string;
  userId: string;
  role: NamespaceMembershipDto['role'];
  namespaceId?: string;
  status?: NamespaceMembershipDto['status'];
  kind?: NamespaceMembershipDto['principal']['kind'];
}): NamespaceMembershipDto {
  return {
    membership_id: input.id,
    namespace_id: input.namespaceId ?? 'namespace_team',
    principal: { kind: input.kind ?? 'human', principal_id: input.userId },
    role: input.role,
    status: input.status ?? 'active',
    created_at: NOW,
    updated_at: NOW,
  };
}

function invitation(
  overrides: Partial<CollaborationInvitationDto> = {}
): CollaborationInvitationDto {
  return {
    invitation_id: 'invitation_team',
    target: { kind: 'namespace', namespace_id: 'namespace_team', project_id: null },
    recipient: { user_id: 'user_recipient', email: 'recipient@example.com' },
    role: 'editor',
    status: 'pending',
    created_by: { kind: 'human', principal_id: 'user_owner' },
    created_at: '2026-08-30T00:00:00.000Z',
    updated_at: '2026-08-30T00:00:00.000Z',
    expires_at: '2026-09-01T00:00:00.000Z',
    accepted_at: null,
    accepted_by_user_id: null,
    revoked_at: null,
    expired_at: null,
    ...overrides,
  };
}

function invariantCode(operation: () => void): string | undefined {
  try {
    operation();
  } catch (error) {
    if (error instanceof CollaborationInvariantError) return error.code;
    throw error;
  }
  return undefined;
}

describe('collaboration lifecycle invariants', () => {
  it('accepts a future grant expiry and rejects past or invalid server times', () => {
    expect(() =>
      assertProjectGrantExpiry({ expires_at: '2026-09-01T00:00:00.000Z', evaluated_at: NOW })
    ).not.toThrow();
    expect(() => assertProjectGrantExpiry({ expires_at: null, evaluated_at: NOW })).not.toThrow();
    expect(
      invariantCode(() => assertProjectGrantExpiry({ expires_at: NOW, evaluated_at: NOW }))
    ).toBe('INVALID_EXPIRY');
    expect(
      invariantCode(() => assertProjectGrantExpiry({ expires_at: 'not-a-date', evaluated_at: NOW }))
    ).toBe('INVALID_EXPIRY');
  });

  it('prevents revoking or demoting the last active human owner', () => {
    const owner = membership({ id: 'membership_owner', userId: 'user_owner', role: 'owner' });
    expect(
      invariantCode(() =>
        assertOwnerMutationAllowed({ target: owner, active_human_owner_count: 1 })
      )
    ).toBe('LAST_OWNER_REQUIRED');
    expect(() =>
      assertOwnerMutationAllowed({ target: owner, active_human_owner_count: 2 })
    ).not.toThrow();
    expect(
      invariantCode(() =>
        assertOwnerMutationAllowed({ target: owner, active_human_owner_count: -1 })
      )
    ).toBe('OWNER_COUNT_INVALID');
    expect(() =>
      assertOwnerMutationAllowed({
        target: membership({ id: 'membership_admin', userId: 'user_admin', role: 'admin' }),
        active_human_owner_count: 1,
      })
    ).not.toThrow();
  });

  it('builds an atomic demote/promote ownership transfer plan', () => {
    const plan = buildNamespaceOwnershipTransferPlan({
      namespace_id: 'namespace_team',
      current_owner: membership({
        id: 'membership_owner',
        userId: 'user_owner',
        role: 'owner',
      }),
      target: membership({ id: 'membership_admin', userId: 'user_admin', role: 'admin' }),
    });
    expect(plan).toEqual({
      namespace_id: 'namespace_team',
      demote: { membership_id: 'membership_owner', role: 'admin' },
      promote: { membership_id: 'membership_admin', role: 'owner' },
    });
  });

  it('binds project transfer to a different canonical namespace', () => {
    expect(
      buildProjectTransferPlan({
        project_id: 'project_team',
        source_namespace_id: 'namespace_team',
        target_namespace_id: 'namespace_archive',
      })
    ).toEqual({
      project_id: 'project_team',
      source_namespace_id: 'namespace_team',
      target_namespace_id: 'namespace_archive',
    });
    expect(
      invariantCode(() =>
        buildProjectTransferPlan({
          project_id: 'project_team',
          source_namespace_id: 'namespace_team',
          target_namespace_id: 'namespace_team',
        })
      )
    ).toBe('SAME_NAMESPACE');
  });

  it('rejects cross-namespace, same-member, and machine ownership targets', () => {
    const owner = membership({ id: 'membership_owner', userId: 'user_owner', role: 'owner' });
    expect(
      invariantCode(() =>
        buildNamespaceOwnershipTransferPlan({
          namespace_id: 'namespace_team',
          current_owner: owner,
          target: membership({
            id: 'membership_other',
            userId: 'user_other',
            role: 'admin',
            namespaceId: 'namespace_other',
          }),
        })
      )
    ).toBe('NAMESPACE_MISMATCH');
    expect(
      invariantCode(() =>
        buildNamespaceOwnershipTransferPlan({
          namespace_id: 'namespace_team',
          current_owner: owner,
          target: { ...owner, role: 'admin' },
        })
      )
    ).toBe('SAME_OWNER');
    expect(
      invariantCode(() =>
        buildNamespaceOwnershipTransferPlan({
          namespace_id: 'namespace_team',
          current_owner: owner,
          target: membership({
            id: 'membership_service',
            userId: 'service_ci',
            role: 'admin',
            kind: 'service',
          }),
        })
      )
    ).toBe('TARGET_OWNER_INELIGIBLE');
  });

  it('requires every configured invitation recipient binding to match', () => {
    expect(() =>
      assertInvitationMayBeAccepted({
        invitation: invitation(),
        actor: { kind: 'human', principal_id: 'user_recipient' },
        verified_emails: ['RECIPIENT@example.com'],
        evaluated_at: NOW,
      })
    ).not.toThrow();

    expect(
      invariantCode(() =>
        assertInvitationMayBeAccepted({
          invitation: invitation(),
          actor: { kind: 'human', principal_id: 'user_other' },
          verified_emails: ['recipient@example.com'],
          evaluated_at: NOW,
        })
      )
    ).toBe('INVITATION_RECIPIENT_MISMATCH');
    expect(
      invariantCode(() =>
        assertInvitationMayBeAccepted({
          invitation: invitation(),
          actor: { kind: 'human', principal_id: 'user_recipient' },
          verified_emails: ['other@example.com'],
          evaluated_at: NOW,
        })
      )
    ).toBe('INVITATION_RECIPIENT_MISMATCH');
  });

  it('rejects terminal and expired invitations', () => {
    expect(
      invariantCode(() =>
        assertInvitationMayBeAccepted({
          invitation: invitation({ status: 'revoked' }),
          actor: { kind: 'human', principal_id: 'user_recipient' },
          verified_emails: ['recipient@example.com'],
          evaluated_at: NOW,
        })
      )
    ).toBe('INVITATION_INACTIVE');
    expect(
      invariantCode(() =>
        assertInvitationMayBeAccepted({
          invitation: invitation({ expires_at: NOW }),
          actor: { kind: 'human', principal_id: 'user_recipient' },
          verified_emails: ['recipient@example.com'],
          evaluated_at: NOW,
        })
      )
    ).toBe('INVITATION_EXPIRED');
  });
});
