// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { listReceivedCollaborationInvitations, declineCollaborationInvitation, linkStatus } =
  vi.hoisted(() => ({
    listReceivedCollaborationInvitations: vi.fn(),
    declineCollaborationInvitation: vi.fn(),
    linkStatus: { pending: false },
  }));
vi.mock('next/link', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/link')>()),
  useLinkStatus: () => linkStatus,
}));
vi.mock('@/infrastructure/sharedApiClient', () => ({
  getSharedApiClient: () => ({
    listReceivedCollaborationInvitations,
    declineCollaborationInvitation,
  }),
}));

import { InvitationsPageContent } from '@/app/invitations/page';
import { DiscoverHeader } from '@/components/schemas/DiscoverHeader';
import { InvitationInboxProvider } from '@/hooks/accounts/usePendingInvitations';
import { setSessionUser } from '@/infrastructure/session';

const invitation = {
  invitation: { invitation_id: 'invite-1', role: 'viewer', expires_at: '2026-12-01T00:00:00Z' },
  namespace: { slug: 'orbit', display_name: 'Orbit' },
};

describe('DiscoverHeader navigation', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    listReceivedCollaborationInvitations.mockReset();
    listReceivedCollaborationInvitations.mockResolvedValue({ invitations: [] });
  });

  afterEach(() => {
    localStorage.removeItem('t3x-user');
    linkStatus.pending = false;
  });

  it('shares one invitation read across navigation and removes the badge after decline', async () => {
    setSessionUser({ id: 'recipient', name: null, username: null });
    listReceivedCollaborationInvitations.mockResolvedValue({ invitations: [invitation] });
    declineCollaborationInvitation.mockResolvedValue(undefined);
    const view = render(
      <InvitationInboxProvider>
        <DiscoverHeader key="repositories" />
      </InvitationInboxProvider>
    );
    expect(await screen.findByRole('link', { name: 'Invitations, pending' })).toHaveAttribute(
      'href',
      '/invitations'
    );

    view.rerender(
      <InvitationInboxProvider>
        <DiscoverHeader key="browse" />
        <InvitationsPageContent />
      </InvitationInboxProvider>
    );
    expect(screen.getByRole('heading', { name: 'Orbit' })).toBeInTheDocument();
    expect(listReceivedCollaborationInvitations).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
    expect(
      await screen.findByRole('heading', { name: 'No pending invitations' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Invitations' })).toBeInTheDocument();
    expect(declineCollaborationInvitation).toHaveBeenCalledExactlyOnceWith('invite-1');
    expect(listReceivedCollaborationInvitations).toHaveBeenCalledOnce();
  });

  it('exposes a loading status while a navigation link is pending', () => {
    linkStatus.pending = true;
    const view = render(<DiscoverHeader />);
    const browse = screen.getByRole('link', { name: /^Browse/ });
    expect(within(browse).getByRole('status')).toHaveTextContent('Opening page');
    linkStatus.pending = false;
    view.rerender(<DiscoverHeader />);
    expect(within(browse).queryByRole('status')).not.toBeInTheDocument();
  });

  it('ignores an invitation read that finishes after the account changes', async () => {
    setSessionUser({ id: 'first', name: null, username: null });
    let completeFirst!: (value: { invitations: (typeof invitation)[] }) => void;
    listReceivedCollaborationInvitations.mockReturnValueOnce(
      new Promise((resolve) => {
        completeFirst = resolve;
      })
    );
    render(
      <InvitationInboxProvider>
        <DiscoverHeader />
        <InvitationsPageContent />
      </InvitationInboxProvider>
    );
    expect(listReceivedCollaborationInvitations).toHaveBeenCalledOnce();

    act(() => setSessionUser({ id: 'second', name: null, username: null }));
    expect(
      await screen.findByRole('heading', { name: 'No pending invitations' })
    ).toBeInTheDocument();
    await act(async () => completeFirst({ invitations: [invitation] }));

    expect(screen.getByRole('heading', { name: 'No pending invitations' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Invitations' })).toBeInTheDocument();
    expect(listReceivedCollaborationInvitations).toHaveBeenCalledTimes(2);
  });

  it('finds a new invitation while the recipient keeps the page open', async () => {
    setSessionUser({ id: 'recipient', name: null, username: null });
    vi.useFakeTimers();
    const focus = vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    const { unmount } = render(
      <InvitationInboxProvider>
        <DiscoverHeader />
      </InvitationInboxProvider>
    );
    try {
      expect(listReceivedCollaborationInvitations).toHaveBeenCalledTimes(1);
      listReceivedCollaborationInvitations.mockResolvedValueOnce({ invitations: [invitation] });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect(listReceivedCollaborationInvitations).toHaveBeenCalledTimes(1);
      focus.mockReturnValue(true);
      await act(async () => window.dispatchEvent(new Event('focus')));
      expect(listReceivedCollaborationInvitations).toHaveBeenCalledTimes(2);
      expect(screen.getByRole('link', { name: 'Invitations, pending' })).toBeInTheDocument();
    } finally {
      unmount();
      focus.mockRestore();
      vi.useRealTimers();
    }
  });

  it('links home to t3x-dev when local auth is disabled', () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_DISABLED', 'true');

    render(<DiscoverHeader owner="t3x-dev" namespaceTab="repositories" />);

    expect(screen.getByRole('link', { name: 'T3X home' })).toHaveAttribute('href', '/t3x-dev');
    expect(screen.queryByRole('link', { name: 'Invitations' })).not.toBeInTheDocument();
    expect(listReceivedCollaborationInvitations).not.toHaveBeenCalled();
  });
  it('preserves the current branch and Workspace on canonical repository tabs', () => {
    const settingsHref = '/orbit/release/settings?returnTo=%2Forbit%2Frelease%3Ftab%3Dworkspaces';
    render(
      <DiscoverHeader
        owner="orbit"
        projectName="release"
        repoPath="/orbit/release"
        settingsHref={settingsHref}
        branch="feature/release"
        workspaceId="workspace_branch:feature/release"
        activeTab="workspaces"
      />
    );

    const tabs = within(screen.getByRole('navigation', { name: 'Project views' }));
    expect(tabs.getAllByRole('link').map((link) => link.getAttribute('aria-label'))).toEqual([
      'State',
      'Schema',
      'Workspace',
      'Run',
      'Pull requests',
      'Community',
      'Settings',
    ]);
    expect(tabs.queryByRole('link', { name: 'Browse' })).not.toBeInTheDocument();
    for (const label of ['Schema', 'Workspace']) {
      const link = tabs.getByRole('link', { name: label });
      const target = new URL(link.getAttribute('href')!, 'http://localhost');
      expect(target.pathname).toBe(
        `/orbit/release/branches/feature%2Frelease/${label === 'Workspace' ? 'workspaces' : 'schemas'}`
      );
      expect(target.searchParams.get('branch')).toBe(null);
      expect(target.searchParams.get('workspace')).toBe('workspace_branch:feature/release');
    }
    const pullRequests = new URL(
      tabs.getByRole('link', { name: 'Pull requests' }).getAttribute('href')!,
      'http://localhost'
    );
    expect(pullRequests.pathname).toBe('/orbit/release/pull-requests');
    expect(pullRequests.searchParams.has('branch')).toBe(false);
    expect(pullRequests.searchParams.has('workspace')).toBe(false);
    expect(tabs.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', settingsHref);
    expect(tabs.getByRole('link', { name: 'Workspace' })).toHaveAttribute('aria-current', 'page');
    const globalNavigation = within(screen.getByRole('navigation', { name: 'Global' }));
    expect(globalNavigation.getByRole('link', { name: 'Discover' })).toHaveAttribute(
      'href',
      '/explore'
    );
    expect(globalNavigation.getByRole('link', { name: 'Browse' })).toHaveAttribute(
      'href',
      '/explore/browse'
    );
    expect(globalNavigation.getByRole('link', { name: 'Your repositories' })).toHaveAttribute(
      'href',
      '/repositories'
    );
    expect(
      globalNavigation.getAllByRole('link').every((link) => !link.hasAttribute('aria-current'))
    ).toBe(true);
  });

  it('keeps namespace settings and repository creation under the supplied owner', async () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_DISABLED', 'false');
    render(
      <DiscoverHeader
        owner="orbit-labs"
        namespaceTab="settings"
        settingsHref="/settings/provider-credentials?owner=orbit-labs"
        newProjectHref="/orbit-labs/new"
        contextLabel="Organization"
      />
    );

    const tabs = within(screen.getByRole('navigation', { name: 'Namespace navigation' }));
    expect(tabs.getByRole('link', { name: 'Repositories' })).toHaveAttribute('href', '/orbit-labs');
    expect(tabs.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/settings/provider-credentials?owner=orbit-labs'
    );
    expect(tabs.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'New repository' })).toHaveAttribute(
      'href',
      '/orbit-labs/new'
    );
    expect(screen.getByRole('link', { name: 'Account settings' })).toHaveAttribute(
      'href',
      '/settings/profile'
    );
    expect(screen.getByRole('link', { name: 'T3X home' })).toHaveAttribute('href', '/');
  });

  it('uses the authenticated home resolver instead of the visible organization owner', () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_DISABLED', 'false');
    render(<DiscoverHeader owner="orbit-labs" namespaceTab="repositories" />);

    expect(screen.getByRole('link', { name: 'T3X home' })).toHaveAttribute('href', '/');
  });

  it('gives Discover and Browse global navigation without invented repository state', () => {
    render(<DiscoverHeader />);

    const globalNavigation = within(screen.getByRole('navigation', { name: 'Global' }));
    expect(globalNavigation.getByRole('link', { name: 'Discover' })).toHaveAttribute(
      'href',
      '/explore'
    );
    expect(globalNavigation.getByRole('link', { name: 'Discover' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(globalNavigation.getByRole('link', { name: 'Browse' })).toHaveAttribute(
      'href',
      '/explore/browse'
    );
    expect(globalNavigation.getByRole('link', { name: 'Browse' })).not.toHaveAttribute(
      'aria-current'
    );
    expect(globalNavigation.queryByRole('link', { name: 'Explore' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Commands' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Account settings' })).toHaveAttribute(
      'href',
      '/settings/profile'
    );
    expect(screen.queryByRole('navigation', { name: 'Project views' })).not.toBeInTheDocument();
    expect(screen.queryByText('Private')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Notifications preview')).not.toBeInTheDocument();
  });

  it('marks the aggregate repository directory as the current global destination', () => {
    render(<DiscoverHeader repositoriesNavigation />);

    expect(screen.getByRole('link', { name: 'Repositories' })).toHaveAttribute(
      'href',
      '/repositories'
    );
    expect(screen.getByRole('link', { name: 'Your repositories' })).toHaveAttribute(
      'href',
      '/repositories'
    );
    expect(screen.getByRole('link', { name: 'Your repositories' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(
      screen.queryByRole('navigation', { name: 'Namespace navigation' })
    ).not.toBeInTheDocument();
  });
});
