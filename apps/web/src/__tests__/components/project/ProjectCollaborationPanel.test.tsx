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
const TOKEN = `t3xi_v1_${'a'.repeat(43)}`;
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
    invitation,
    delivery: { mode: 'manual', token: TOKEN },
    mutation: {
      request_id: 'req_1',
      kind: 'invitation.create',
      outcome: 'applied',
      evaluated_at: NOW,
    },
  } satisfies CreateCollaborationInvitationResponse);
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

  it('creates a fragment-protected project invitation link', async () => {
    const collaboration = mockCollaboration();
    render(<ProjectCollaborationPanel projectId="proj_1" />);

    fireEvent.change(screen.getByLabelText('Project invitee email'), {
      target: { value: 'new@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }));

    await waitFor(() =>
      expect(collaboration.createInvitation).toHaveBeenCalledWith('new@example.com', 'editor')
    );
    expect(
      await screen.findByText(`http://localhost:3000/invite#token=${TOKEN}`)
    ).toBeInTheDocument();
  });

  it('stays hidden when the server denies project guest management', () => {
    mockCollaboration({ status: 403, code: 'FORBIDDEN' });

    const { container } = render(<ProjectCollaborationPanel projectId="proj_1" />);

    expect(container).toBeEmptyDOMElement();
  });
});
