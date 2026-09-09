// @vitest-environment jsdom

import type {
  CreateCollaborationInvitationResponse,
  ListProjectGuestsResponse,
  ListProjectInvitationsResponse,
  ProjectGrant,
} from '@t3x-dev/api-client';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  projectCollaborationQueryKey,
  useProjectCollaboration,
} from '@/hooks/accounts/useProjectCollaboration';
import { clearQueryCache } from '@/hooks/shared/useQuery';

const listProjectGuests = vi.fn();
const listProjectInvitations = vi.fn();
const upsertProjectGuest = vi.fn();
const revokeProjectGuest = vi.fn();
const createProjectInvitation = vi.fn();
const revokeCollaborationInvitation = vi.fn();

vi.mock('@/infrastructure/sharedApiClient', () => ({
  getSharedApiClient: () => ({
    listProjectGuests,
    listProjectInvitations,
    upsertProjectGuest,
    revokeProjectGuest,
    createProjectInvitation,
    revokeCollaborationInvitation,
  }),
}));

const NOW = '2026-08-31T00:00:00.000Z';
const guest: ProjectGrant = {
  grant_id: 'pg_1',
  project_id: 'proj_1',
  principal: {
    kind: 'human',
    principal_id: 'user_guest',
    display_name: 'Grace Guest',
    email: 'grace@example.com',
    avatar_url: null,
  },
  role: 'viewer',
  status: 'active',
  created_at: NOW,
  updated_at: NOW,
  expires_at: null,
};
const guestsResponse: ListProjectGuestsResponse = {
  version: 1,
  namespace_id: 'ns_team',
  project_id: 'proj_1',
  authorized_actions: ['project:read', 'project:guests:manage'],
  guests: [guest],
};
const invitationsResponse: ListProjectInvitationsResponse = {
  version: 1,
  target_kind: 'project',
  namespace_id: 'ns_team',
  project_id: 'proj_1',
  authorized_actions: ['project:read', 'project:guests:manage'],
  invitations: [],
};
const invitationResponse = {
  invitation: {
    invitation_id: 'inv_1',
    target: { kind: 'project' as const, namespace_id: 'ns_team', project_id: 'proj_1' },
    recipient: { user_id: null, email: 'new@example.com' },
    role: 'editor' as const,
    status: 'pending' as const,
    created_by: { kind: 'human' as const, principal_id: 'user_owner' },
    created_at: NOW,
    updated_at: NOW,
    expires_at: '2026-09-07T00:00:00.000Z',
    accepted_at: null,
    accepted_by_user_id: null,
    revoked_at: null,
    expired_at: null,
  },
  delivery: { mode: 'manual' as const, token: `t3xi_v1_${'a'.repeat(43)}` },
  mutation: {
    request_id: 'req_1',
    kind: 'invitation.create' as const,
    outcome: 'applied' as const,
    evaluated_at: NOW,
  },
} satisfies CreateCollaborationInvitationResponse;

describe('useProjectCollaboration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearQueryCache();
    listProjectGuests.mockResolvedValue(guestsResponse);
    listProjectInvitations.mockResolvedValue(invitationsResponse);
    upsertProjectGuest.mockResolvedValue({});
    revokeProjectGuest.mockResolvedValue({});
    createProjectInvitation.mockResolvedValue(invitationResponse);
    revokeCollaborationInvitation.mockResolvedValue({});
  });

  it('uses project-qualified keys and waits for server authorization before listing invitations', async () => {
    const { result } = renderHook(() => useProjectCollaboration('proj_1'));

    expect(projectCollaborationQueryKey('proj_1', 'guests')).toEqual([
      'project',
      'proj_1',
      'collaboration',
      'guests',
    ]);
    expect(listProjectInvitations).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.canManageGuests).toBe(true));
    await waitFor(() => expect(result.current.invitationsQuery.data).toEqual(invitationsResponse));
    expect(listProjectGuests).toHaveBeenCalledWith('proj_1');
    expect(listProjectInvitations).toHaveBeenCalledWith('proj_1');
  });

  it('scopes guest and invitation mutations to the project', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    const { result } = renderHook(() => useProjectCollaboration('proj_1'));

    await act(async () => {
      await result.current.updateGuestRole(guest, 'editor');
      await result.current.revokeGuest('pg_1');
      await result.current.createInvitation('new@example.com', 'editor');
      await result.current.revokeInvitation('inv_1');
    });

    expect(upsertProjectGuest).toHaveBeenCalledWith('proj_1', {
      principal: { kind: 'human', principal_id: 'user_guest' },
      role: 'editor',
      expires_at: null,
    });
    expect(revokeProjectGuest).toHaveBeenCalledWith('proj_1', 'pg_1');
    expect(createProjectInvitation).toHaveBeenCalledWith('proj_1', {
      recipient: { user_id: null, email: 'new@example.com' },
      role: 'editor',
      expires_at: '2026-09-07T00:00:00.000Z',
    });
    expect(revokeCollaborationInvitation).toHaveBeenCalledWith('inv_1');
    vi.useRealTimers();
  });
});
