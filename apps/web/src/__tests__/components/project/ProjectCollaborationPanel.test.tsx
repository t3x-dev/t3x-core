// @vitest-environment jsdom

import '@testing-library/jest-dom';
import type {
  CreateCollaborationInvitationResponse,
  ListProjectGuestsResponse,
  ListProjectInvitationsResponse,
  ProjectGrant,
} from '@t3x-dev/api-client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/hooks/accounts/useProjectCollaboration', () => ({
  useProjectCollaboration: vi.fn(),
}));

import { ProjectCollaborationPanel } from '@/components/project/ProjectCollaborationPanel';
import { useProjectCollaboration } from '@/hooks/accounts/useProjectCollaboration';

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
const guests: ListProjectGuestsResponse = {
  version: 1,
  namespace_id: 'ns_team',
  project_id: 'proj_1',
  authorized_actions: ['project:read', 'project:guests:manage'],
  guests: [guest],
};
const invitation = {
  invitation_id: 'inv_1',
  target: { kind: 'project' as const, namespace_id: 'ns_team', project_id: 'proj_1' },
  recipient: { user_id: null, email: 'pending@example.com' },
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
};
const invitations: ListProjectInvitationsResponse = {
  version: 1,
  target_kind: 'project',
  namespace_id: 'ns_team',
  project_id: 'proj_1',
  authorized_actions: ['project:read', 'project:guests:manage'],
  invitations: [invitation],
};

function mockCollaboration(error: unknown = null) {
  const createInvitation = vi.fn().mockResolvedValue({
    invitation: { ...invitation, recipient: { user_id: 'user_test_b3', email: null } },
    delivery: { mode: 'inbox', token: null },
    mutation: {
      request_id: 'req_1',
      kind: 'invitation.create',
      outcome: 'applied',
      evaluated_at: NOW,
    },
  } satisfies CreateCollaborationInvitationResponse);
  const searchUsers = vi.fn().mockResolvedValue([
    {
      user_id: 'user_test_b3',
      username: 'test-b3',
      display_name: 'Test B3',
      avatar_url: null,
    },
  ]);
  const value = {
    guestsQuery: { data: error ? undefined : guests, isLoading: false, error, refetch: vi.fn() },
    invitationsQuery: {
      data: error ? undefined : invitations,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    },
    canManageGuests: !error,
    updateGuestRole: vi.fn(),
    revokeGuest: vi.fn(),
    createInvitation,
    searchUsers,
    revokeInvitation: vi.fn(),
  } as ReturnType<typeof useProjectCollaboration>;
  vi.mocked(useProjectCollaboration).mockReturnValue(value);
  return value;
}

describe('ProjectCollaborationPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('renders project-only guests and pending invitations from server projections', () => {
    mockCollaboration();

    render(<ProjectCollaborationPanel projectId="proj_1" />);

    expect(screen.getByRole('heading', { name: 'Project access' })).toBeInTheDocument();
    expect(screen.getByText('Grace Guest')).toBeInTheDocument();
    expect(screen.getByText('Project-only access')).toBeInTheDocument();
    expect(screen.getByText('pending@example.com · editor')).toBeInTheDocument();
  });

  it('searches partial usernames and creates an inbox invitation', async () => {
    const collaboration = mockCollaboration();
    render(<ProjectCollaborationPanel projectId="proj_1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Add people' }));
    fireEvent.change(screen.getByLabelText('Search users'), {
      target: { value: 'test' },
    });
    fireEvent.click(await screen.findByRole('button', { name: /Test B3.*test-b3/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add @test-b3' }));

    await waitFor(() =>
      expect(collaboration.createInvitation).toHaveBeenCalledWith('user_test_b3', 'editor')
    );
  });

  it('stays hidden when the server denies project guest management', () => {
    mockCollaboration({ status: 403, code: 'FORBIDDEN' });

    const { container } = render(<ProjectCollaborationPanel projectId="proj_1" />);

    expect(container).toBeEmptyDOMElement();
  });
});
