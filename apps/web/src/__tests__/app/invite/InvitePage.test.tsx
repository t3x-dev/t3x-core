// @vitest-environment jsdom

import '@testing-library/jest-dom';
import type { AcceptCollaborationInvitationResponse } from '@t3x-dev/api-client';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InvitationAcceptancePage } from '@/app/invite/page';
import { PENDING_INVITATION_TOKEN_KEY } from '@/domain/collaboration/invitationLink';

const TOKEN = `t3xi_v1_${'a'.repeat(43)}`;
const routerReplace = vi.fn();
const acceptInvitation = vi.fn();
const getKey = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace }),
}));

vi.mock('@/hooks/accounts/useInvitationAcceptance', () => ({
  useInvitationAcceptance: () => ({ acceptInvitation }),
}));

vi.mock('@/hooks/shared/useSession', () => ({
  useSession: () => ({ getKey }),
}));

const acceptedResponse: AcceptCollaborationInvitationResponse = {
  authority: {
    kind: 'project_grant',
    grant: {
      grant_id: 'pg_1',
      project_id: 'proj_1',
      principal: {
        kind: 'human',
        principal_id: 'user_1',
        display_name: 'Ada',
        email: 'ada@example.com',
        avatar_url: null,
      },
      role: 'editor',
      status: 'active',
      expires_at: null,
      created_at: '2026-08-31T00:00:00.000Z',
      updated_at: '2026-08-31T00:00:00.000Z',
    },
  },
  mutation: {
    request_id: 'req_1',
    kind: 'invitation.accept',
    outcome: 'applied',
    evaluated_at: '2026-08-31T00:00:00.000Z',
  },
};

describe('InvitationAcceptancePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_AUTH_DISABLED', 'false');
    sessionStorage.clear();
    window.history.replaceState(null, '', `/invite#token=${TOKEN}`);
    getKey.mockReturnValue('session-key');
    acceptInvitation.mockResolvedValue(acceptedResponse);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('removes the secret fragment and accepts the invitation once', async () => {
    render(<InvitationAcceptancePage />);

    await screen.findByRole('heading', { name: 'Invitation accepted' });
    expect(window.location.hash).toBe('');
    expect(acceptInvitation).toHaveBeenCalledTimes(1);
    expect(acceptInvitation).toHaveBeenCalledWith(TOKEN);
    expect(sessionStorage.getItem(PENDING_INVITATION_TOKEN_KEY)).toBeNull();
    expect(screen.getByRole('link', { name: 'Open project' })).toHaveAttribute(
      'href',
      '/project/proj_1'
    );
  });

  it('preserves the token in same-tab storage while authentication completes', async () => {
    getKey.mockReturnValue(null);

    render(<InvitationAcceptancePage />);

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith('/login?callbackUrl=%2Finvite'));
    expect(window.location.hash).toBe('');
    expect(sessionStorage.getItem(PENDING_INVITATION_TOKEN_KEY)).toBe(TOKEN);
    expect(acceptInvitation).not.toHaveBeenCalled();
  });

  it('fails closed and clears a rejected one-time token', async () => {
    acceptInvitation.mockRejectedValue(new Error('Invitation expired'));

    render(<InvitationAcceptancePage />);

    expect(
      await screen.findByRole('heading', { name: 'Invitation unavailable' })
    ).toBeInTheDocument();
    expect(screen.getByText('Invitation expired')).toBeInTheDocument();
    expect(sessionStorage.getItem(PENDING_INVITATION_TOKEN_KEY)).toBeNull();
  });

  it('does not call the API for a malformed link', async () => {
    window.history.replaceState(null, '', '/invite#token=invalid');

    render(<InvitationAcceptancePage />);

    expect(
      await screen.findByText('This invitation link is missing or invalid.')
    ).toBeInTheDocument();
    expect(acceptInvitation).not.toHaveBeenCalled();
  });
});
