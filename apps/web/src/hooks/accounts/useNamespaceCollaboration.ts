'use client';

import type { NamespaceMemberRole, NamespaceMembership } from '@t3x-dev/api-client';
import { namespaceQueryKey } from '@/hooks/accounts/useNamespaceAccounts';
import { useQuery } from '@/hooks/shared/useQuery';
import { getSharedApiClient } from '@/infrastructure/sharedApiClient';

export function useNamespaceCollaboration(input: {
  namespaceId: string | null;
  canReadMembers: boolean;
  canManageInvitations: boolean;
}) {
  const client = getSharedApiClient();
  const membersQuery = useQuery({
    queryKey: namespaceQueryKey(input.namespaceId ?? 'none', 'members'),
    queryFn: () => client.listNamespaceMembers(input.namespaceId as string),
    enabled: Boolean(input.namespaceId && input.canReadMembers),
    staleTime: 30_000,
  });
  const invitationsQuery = useQuery({
    queryKey: namespaceQueryKey(input.namespaceId ?? 'none', 'invitations'),
    queryFn: () => client.listNamespaceInvitations(input.namespaceId as string),
    enabled: Boolean(input.namespaceId && input.canManageInvitations),
    staleTime: 15_000,
  });

  async function updateMemberRole(member: NamespaceMembership, role: NamespaceMemberRole) {
    if (!input.namespaceId) return;
    await client.upsertNamespaceMember(input.namespaceId, {
      principal: {
        kind: member.principal.kind,
        principal_id: member.principal.principal_id,
      },
      role,
    });
    membersQuery.refetch();
  }

  async function revokeMember(membershipId: string) {
    if (!input.namespaceId) return;
    await client.revokeNamespaceMember(input.namespaceId, membershipId);
    membersQuery.refetch();
  }

  async function createInvitation(email: string, role: NamespaceMemberRole) {
    if (!input.namespaceId) return null;
    const response = await client.createNamespaceInvitation(input.namespaceId, {
      recipient: { user_id: null, email },
      role,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
    invitationsQuery.refetch();
    return response;
  }

  async function revokeInvitation(invitationId: string) {
    await client.revokeCollaborationInvitation(invitationId);
    invitationsQuery.refetch();
  }

  return {
    membersQuery,
    invitationsQuery,
    updateMemberRole,
    revokeMember,
    createInvitation,
    revokeInvitation,
  };
}
