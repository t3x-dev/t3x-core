// @vitest-environment jsdom

import '@testing-library/jest-dom';
import type { NamespaceAccount } from '@t3x-dev/api-client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/accounts/useNamespaceAccounts', () => ({ useNamespaceAccounts: vi.fn() }));
vi.mock('@/hooks/accounts/useNamespaceCollaboration', () => ({
  useNamespaceCollaboration: vi.fn(),
}));

import { MembersSettingsPanel } from '@/components/settings/MembersSettingsPanel';
import { useNamespaceAccounts } from '@/hooks/accounts/useNamespaceAccounts';
import { useNamespaceCollaboration } from '@/hooks/accounts/useNamespaceCollaboration';

const NOW = '2026-09-16T00:00:00.000Z';
const actions = [
  'namespace:read',
  'namespace:members:read',
  'namespace:members:manage',
  'namespace:invitations:manage',
] as const;

const owner = {
  membership_id: 'member-owner',
  namespace_id: 'orbit-labs',
  principal: {
    kind: 'human' as const,
    principal_id: 'jordan',
    display_name: 'Jordan Diaz',
    email: 'jordan@orbit-labs.com',
    avatar_url: null,
  },
  role: 'owner' as const,
  status: 'active' as const,
  created_at: NOW,
  updated_at: NOW,
};

const account: NamespaceAccount = {
  namespace: {
    namespace_id: 'orbit-labs',
    slug: 'orbit-labs',
    kind: 'organization',
    display_name: 'orbit-labs',
  },
  current_membership: owner,
  authorized_actions: [...actions],
};

const editor = {
  ...owner,
  membership_id: 'member-editor',
  principal: {
    ...owner.principal,
    principal_id: 'sam',
    display_name: 'Sam Kim',
    email: 'sam@orbit-labs.com',
  },
  role: 'editor' as const,
};

const invitation = {
  invitation_id: 'invitation-1',
  target: { kind: 'namespace' as const, namespace_id: 'orbit-labs', project_id: null },
  recipient: { user_id: null, email: 'taylor@orbit-labs.com' },
  role: 'viewer' as const,
  status: 'pending' as const,
  created_by: { kind: 'human' as const, principal_id: 'jordan' },
  created_at: NOW,
  updated_at: NOW,
  expires_at: '2026-09-23T00:00:00.000Z',
  accepted_at: null,
  accepted_by_user_id: null,
  revoked_at: null,
  expired_at: null,
};

function arrange() {
  vi.mocked(useNamespaceAccounts).mockReturnValue({
    accounts: [account],
    activeAccount: account,
    selectNamespace: vi.fn(),
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  });
  const commands = {
    membersQuery: {
      data: {
        version: 1 as const,
        namespace_id: 'orbit-labs',
        authorized_actions: [...actions],
        members: [owner, editor],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    },
    invitationsQuery: {
      data: {
        version: 1 as const,
        target_kind: 'namespace' as const,
        namespace_id: 'orbit-labs',
        project_id: null,
        authorized_actions: [...actions],
        invitations: [invitation],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    },
    updateMemberRole: vi.fn(),
    revokeMember: vi.fn(),
    createInvitation: vi.fn().mockResolvedValue(null),
    revokeInvitation: vi.fn(),
  } as ReturnType<typeof useNamespaceCollaboration>;
  vi.mocked(useNamespaceCollaboration).mockReturnValue(commands);
  return commands;
}

describe('MembersSettingsPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the organization members and filters them by search', () => {
    arrange();
    render(<MembersSettingsPanel />);

    expect(screen.getByRole('heading', { name: 'Members' })).toBeInTheDocument();
    expect(screen.getByText('Jordan Diaz')).toBeInTheDocument();
    expect(screen.getByText('Sam Kim')).toBeInTheDocument();
    expect(screen.getByText('taylor@orbit-labs.com')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search members' }), {
      target: { value: 'Jordan' },
    });
    expect(screen.getByText('Jordan Diaz')).toBeInTheDocument();
    expect(screen.queryByText('Sam Kim')).not.toBeInTheDocument();
  });

  it('opens the invitation form and submits through the collaboration hook', async () => {
    const commands = arrange();
    render(<MembersSettingsPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Invite member' }));
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'new@orbit-labs.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }));

    await waitFor(() => {
      expect(commands.createInvitation).toHaveBeenCalledWith('new@orbit-labs.com', 'editor');
    });
  });
});
