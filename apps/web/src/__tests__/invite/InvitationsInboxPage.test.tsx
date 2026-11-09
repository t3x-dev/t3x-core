// @vitest-environment jsdom

import '@testing-library/jest-dom';
import type { ReceivedCollaborationInvitation } from '@t3x-dev/api-client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listReceivedCollaborationInvitations = vi.fn();
const acceptCollaborationInvitationById = vi.fn();
const declineCollaborationInvitation = vi.fn();
const client = {
  listReceivedCollaborationInvitations,
  acceptCollaborationInvitationById,
  declineCollaborationInvitation,
};

vi.mock('@/infrastructure/sharedApiClient', () => ({ getSharedApiClient: () => client }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { InvitationsPageContent } from '@/app/invitations/page';

const invitation: ReceivedCollaborationInvitation = {
  invitation: {
    invitation_id: 'inv_inbox',
    target: { kind: 'project', namespace_id: 'ns_owner', project_id: 'proj_demo' },
    recipient: { user_id: 'user_b', email: null },
    role: 'editor',
    status: 'pending',
    created_by: { kind: 'human', principal_id: 'user_a' },
    created_at: '2026-11-03T00:00:00.000Z',
    updated_at: '2026-11-03T00:00:00.000Z',
    expires_at: '2026-11-10T00:00:00.000Z',
    accepted_at: null,
    accepted_by_user_id: null,
    revoked_at: null,
    expired_at: null,
  },
  namespace: { slug: 'test-a3', display_name: 'Test A3' },
  project: { name: 'three-party-demo' },
};

describe('Invitations inbox page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listReceivedCollaborationInvitations.mockResolvedValue({ invitations: [invitation] });
    acceptCollaborationInvitationById.mockResolvedValue({});
    declineCollaborationInvitation.mockResolvedValue({});
  });

  it('lists and accepts a pending project invitation', async () => {
    render(<InvitationsPageContent />);

    expect(await screen.findByText('test-a3/three-party-demo')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));

    await waitFor(() =>
      expect(acceptCollaborationInvitationById).toHaveBeenCalledWith('inv_inbox')
    );
    expect(await screen.findByText('Invitation accepted')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open project' })).toHaveAttribute(
      'href',
      '/test-a3/three-party-demo'
    );
  });

  it.each([
    ['Accept invitation', acceptCollaborationInvitationById],
    ['Decline', declineCollaborationInvitation],
  ] as const)('keeps a failed %s action visible on its invitation', async (label, command) => {
    command.mockRejectedValueOnce(new Error('Invitation action unavailable'));
    render(<InvitationsPageContent />);

    fireEvent.click(await screen.findByRole('button', { name: label }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invitation action unavailable');
    expect(screen.getByText('test-a3/three-party-demo')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: label }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(await screen.findByText('No pending invitations')).toBeInTheDocument();
  });
});
