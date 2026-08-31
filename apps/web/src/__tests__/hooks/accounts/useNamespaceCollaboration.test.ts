// @vitest-environment jsdom

import type {
  CreateCollaborationInvitationResponse,
  ListNamespaceInvitationsResponse,
  ListNamespaceMembersResponse,
  NamespaceMembership,
} from '@t3x-dev/api-client';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useNamespaceCollaboration } from '@/hooks/accounts/useNamespaceCollaboration';
import { clearQueryCache } from '@/hooks/shared/useQuery';

const listNamespaceMembers = vi.fn();
const listNamespaceInvitations = vi.fn();
const upsertNamespaceMember = vi.fn();
const revokeNamespaceMember = vi.fn();
const createNamespaceInvitation = vi.fn();
const revokeCollaborationInvitation = vi.fn();

vi.mock('@/infrastructure/sharedApiClient', () => ({
  getSharedApiClient: () => ({
    listNamespaceMembers,
    listNamespaceInvitations,
    upsertNamespaceMember,
    revokeNamespaceMember,
    createNamespaceInvitation,
    revokeCollaborationInvitation,
  }),
}));

const NOW = '2026-08-31T00:00:00.000Z';
const member: NamespaceMembership = {
  membership_id: 'nsm_editor',
  namespace_id: 'ns_team',
  principal: {
    kind: 'human',
    principal_id: 'user_editor',
    display_name: 'Ed Editor',
    email: 'ed@example.com',
    avatar_url: null,
  },
  role: 'editor',
  status: 'active',
  created_at: NOW,
  updated_at: NOW,
};
const membersResponse: ListNamespaceMembersResponse = {
  version: 1,
  namespace_id: 'ns_team',
  authorized_actions: ['namespace:members:read', 'namespace:members:manage'],
  members: [member],
};
const invitation = {
  invitation_id: 'inv_pending',
  target: { kind: 'namespace' as const, namespace_id: 'ns_team', project_id: null },
  recipient: { user_id: null, email: 'pending@example.com' },
  role: 'viewer' as const,
  status: 'pending' as const,
  created_by: { kind: 'human' as const, principal_id: 'user_owner' },
  created_at: NOW,
  updated_at: NOW,
  expires_at: '2026-09-07T00:00:00.000Z',
  accepted_at: null,
  accepted_by_user_id: null,
  revoked_at: null,
  expired_at: null,
};
const invitationsResponse: ListNamespaceInvitationsResponse = {
  version: 1,
  target_kind: 'namespace',
  namespace_id: 'ns_team',
  project_id: null,
  authorized_actions: ['namespace:invitations:manage'],
  invitations: [invitation],
};
const createResponse: CreateCollaborationInvitationResponse = {
  invitation,
  delivery: { mode: 'email_queued', token: null },
  mutation: {
    request_id: 'req_invite',
    kind: 'invitation.create',
    outcome: 'applied',
    evaluated_at: NOW,
  },
};

describe('useNamespaceCollaboration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearQueryCache();
    listNamespaceMembers.mockResolvedValue(membersResponse);
    listNamespaceInvitations.mockResolvedValue(invitationsResponse);
    createNamespaceInvitation.mockResolvedValue(createResponse);
    upsertNamespaceMember.mockResolvedValue({});
    revokeNamespaceMember.mockResolvedValue({});
    revokeCollaborationInvitation.mockResolvedValue({});
  });

  it('loads collaboration data with namespace-qualified API calls', async () => {
    const { result } = renderHook(() =>
      useNamespaceCollaboration({
        namespaceId: 'ns_team',
        canReadMembers: true,
        canManageInvitations: true,
      })
    );

    await waitFor(() => expect(result.current.membersQuery.data).toEqual(membersResponse));
    await waitFor(() => expect(result.current.invitationsQuery.data).toEqual(invitationsResponse));
    expect(listNamespaceMembers).toHaveBeenCalledWith('ns_team');
    expect(listNamespaceInvitations).toHaveBeenCalledWith('ns_team');
  });

  it('scopes member and invitation mutations to the active namespace', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-31T00:00:00.000Z'));
    const { result } = renderHook(() =>
      useNamespaceCollaboration({
        namespaceId: 'ns_team',
        canReadMembers: false,
        canManageInvitations: false,
      })
    );

    await act(async () => {
      await result.current.updateMemberRole(member, 'admin');
      await result.current.revokeMember('nsm_editor');
      await result.current.createInvitation('new@example.com', 'viewer');
      await result.current.revokeInvitation('inv_pending');
    });

    expect(upsertNamespaceMember).toHaveBeenCalledWith('ns_team', {
      principal: { kind: 'human', principal_id: 'user_editor' },
      role: 'admin',
    });
    expect(revokeNamespaceMember).toHaveBeenCalledWith('ns_team', 'nsm_editor');
    expect(createNamespaceInvitation).toHaveBeenCalledWith('ns_team', {
      recipient: { user_id: null, email: 'new@example.com' },
      role: 'viewer',
      expires_at: '2026-09-07T00:00:00.000Z',
    });
    expect(revokeCollaborationInvitation).toHaveBeenCalledWith('inv_pending');
    vi.useRealTimers();
  });
});
