'use client';

import type { ProjectGrant, ProjectGrantRole } from '@t3x-dev/api-client';
import { useQuery } from '@/hooks/shared/useQuery';
import { getSharedApiClient } from '@/infrastructure/sharedApiClient';

export function projectCollaborationQueryKey(
  projectId: string,
  resource: 'guests' | 'invitations'
): unknown[] {
  return ['project', projectId, 'collaboration', resource];
}

export function useProjectCollaboration(projectId: string) {
  const client = getSharedApiClient();
  const guestsQuery = useQuery({
    queryKey: projectCollaborationQueryKey(projectId, 'guests'),
    queryFn: () => client.listProjectGuests(projectId),
    staleTime: 30_000,
  });
  const canManageGuests =
    guestsQuery.data?.authorized_actions.includes('project:guests:manage') ?? false;
  const invitationsQuery = useQuery({
    queryKey: projectCollaborationQueryKey(projectId, 'invitations'),
    queryFn: () => client.listProjectInvitations(projectId),
    enabled: canManageGuests,
    staleTime: 15_000,
  });

  async function updateGuestRole(guest: ProjectGrant, role: ProjectGrantRole) {
    await client.upsertProjectGuest(projectId, {
      principal: {
        kind: guest.principal.kind,
        principal_id: guest.principal.principal_id,
      },
      role,
      expires_at: guest.expires_at,
    });
    guestsQuery.refetch();
  }

  async function revokeGuest(grantId: string) {
    await client.revokeProjectGuest(projectId, grantId);
    guestsQuery.refetch();
  }

  async function createInvitation(email: string, role: ProjectGrantRole) {
    const response = await client.createProjectInvitation(projectId, {
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
    guestsQuery,
    invitationsQuery,
    canManageGuests,
    updateGuestRole,
    revokeGuest,
    createInvitation,
    revokeInvitation,
  };
}
