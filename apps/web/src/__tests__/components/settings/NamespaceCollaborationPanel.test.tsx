// @vitest-environment jsdom

import '@testing-library/jest-dom';
import type {
  CreateCollaborationInvitationResponse,
  ListNamespaceInvitationsResponse,
  ListNamespaceMembersResponse,
  NamespaceAccount,
} from '@t3x-dev/api-client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/hooks/accounts/useNamespaceCollaboration', () => ({
  useNamespaceCollaboration: vi.fn(),
}));

import { NamespaceCollaborationPanel } from '@/components/settings/NamespaceCollaborationPanel';
import { useNamespaceCollaboration } from '@/hooks/accounts/useNamespaceCollaboration';
import { useNamespaceAccountStore } from '@/store/namespaceAccountStore';

const NOW = '2026-08-31T00:00:00.000Z';
const EXPIRES_AT = '2026-09-07T00:00:00.000Z';
const INVITATION_TOKEN = `t3xi_v1_${'a'.repeat(43)}`;

const account: NamespaceAccount = {
  namespace: {
    namespace_id: 'ns_team',
    slug: 't3x-team',
    kind: 'organization',
    display_name: 'T3X team',
  },
  current_membership: {
    membership_id: 'nsm_owner',
    namespace_id: 'ns_team',
    principal: {
      kind: 'human',
      principal_id: 'user_owner',
      display_name: 'Ada Owner',
      email: 'ada@example.com',
      avatar_url: null,
    },
    role: 'owner',
    status: 'active',
    created_at: NOW,
    updated_at: NOW,
  },
  authorized_actions: [
    'namespace:read',
    'namespace:members:read',
    'namespace:members:manage',
    'namespace:invitations:manage',
  ],
};

const members: ListNamespaceMembersResponse = {
  version: 1,
  namespace_id: 'ns_team',
  authorized_actions: account.authorized_actions,
  members: [
    account.current_membership,
    {
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
    },
  ],
};

const pendingInvitation = {
  invitation_id: 'inv_pending',
  target: { kind: 'namespace' as const, namespace_id: 'ns_team', project_id: null },
  recipient: { user_id: null, email: 'pending@example.com' },
  role: 'editor' as const,
  status: 'pending' as const,
  created_by: { kind: 'human' as const, principal_id: 'user_owner' },
  created_at: NOW,
  updated_at: NOW,
  expires_at: EXPIRES_AT,
  accepted_at: null,
  accepted_by_user_id: null,
  revoked_at: null,
  expired_at: null,
};

const invitations: ListNamespaceInvitationsResponse = {
  version: 1,
  target_kind: 'namespace',
  namespace_id: 'ns_team',
  project_id: null,
  authorized_actions: account.authorized_actions,
  invitations: [pendingInvitation],
};

function mockCollaboration() {
  const createInvitation = vi.fn().mockResolvedValue({
    invitation: pendingInvitation,
    delivery: { mode: 'manual', token: INVITATION_TOKEN },
    mutation: {
      request_id: 'req_invite',
      kind: 'invitation.create',
      outcome: 'applied',
      evaluated_at: NOW,
    },
  } satisfies CreateCollaborationInvitationResponse);
  const value = {
    membersQuery: {
      data: members,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    },
    invitationsQuery: {
      data: invitations,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    },
    updateMemberRole: vi.fn(),
    revokeMember: vi.fn(),
    createInvitation,
    revokeInvitation: vi.fn(),
  } as ReturnType<typeof useNamespaceCollaboration>;
  vi.mocked(useNamespaceCollaboration).mockReturnValue(value);
  return value;
}

describe('NamespaceCollaborationPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    useNamespaceAccountStore.getState().reset();
    useNamespaceAccountStore.getState().setAccounts([account], 'ns_team');
  });

  it('renders server-projected roles and protects the owner membership', () => {
    mockCollaboration();
    render(<NamespaceCollaborationPanel />);

    expect(screen.getByRole('heading', { name: 'T3X team members' })).toBeInTheDocument();
    expect(screen.getByText('Ada Owner')).toBeInTheDocument();
    expect(screen.getByText('owner')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove Ada Owner' })).not.toBeInTheDocument();
    expect(screen.getByText('Ed Editor')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Ed Editor' })).toBeInTheDocument();
    expect(screen.getByText('pending@example.com · editor')).toBeInTheDocument();
  });

  it('creates an invitation and exposes a fragment-protected manual link once', async () => {
    const collaboration = mockCollaboration();
    render(<NamespaceCollaborationPanel />);

    fireEvent.change(screen.getByLabelText('Invitee email'), {
      target: { value: 'new-member@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }));

    await waitFor(() => {
      expect(collaboration.createInvitation).toHaveBeenCalledWith(
        'new-member@example.com',
        'editor'
      );
    });
    expect(
      await screen.findByText(`http://localhost:3000/invite#token=${INVITATION_TOKEN}`)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
  });

  it('stays hidden when the account projection does not authorize member reads', () => {
    mockCollaboration();
    useNamespaceAccountStore
      .getState()
      .setAccounts([{ ...account, authorized_actions: ['namespace:read'] }], 'ns_team');

    const { container } = render(<NamespaceCollaborationPanel />);

    expect(container).toBeEmptyDOMElement();
    expect(useNamespaceCollaboration).toHaveBeenCalledWith({
      namespaceId: 'ns_team',
      canReadMembers: false,
      canManageInvitations: false,
    });
  });
});
