// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listReceivedCollaborationInvitations = vi.hoisted(() => vi.fn());
vi.mock('@/infrastructure/sharedApiClient', () => ({
  getSharedApiClient: () => ({ listReceivedCollaborationInvitations }),
}));

import { DiscoverHeader } from '@/components/schemas/DiscoverHeader';

describe('DiscoverHeader navigation', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    listReceivedCollaborationInvitations.mockReset();
    listReceivedCollaborationInvitations.mockResolvedValue({ invitations: [] });
  });

  it('marks pending invitations and clears the dot after they are handled', async () => {
    render(<DiscoverHeader />);
    expect(screen.getByRole('link', { name: 'Invitations' })).toHaveAttribute(
      'href',
      '/invitations'
    );

    listReceivedCollaborationInvitations.mockResolvedValueOnce({ invitations: [{}] });
    fireEvent.focus(window);
    expect(await screen.findByRole('link', { name: 'Invitations, pending' })).toBeInTheDocument();

    listReceivedCollaborationInvitations.mockResolvedValueOnce({ invitations: [] });
    fireEvent.focus(window);
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Invitations' })).toBeInTheDocument()
    );
  });

  it('finds a new invitation while the recipient keeps the page open', async () => {
    vi.useFakeTimers();
    const { unmount } = render(<DiscoverHeader />);
    try {
      expect(listReceivedCollaborationInvitations).toHaveBeenCalledTimes(1);
      listReceivedCollaborationInvitations.mockResolvedValueOnce({ invitations: [{}] });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect(screen.getByRole('link', { name: 'Invitations, pending' })).toBeInTheDocument();
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });

  it('links home to t3x-dev when local auth is disabled', () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_DISABLED', 'true');

    render(<DiscoverHeader owner="t3x-dev" namespaceTab="repositories" />);

    expect(screen.getByRole('link', { name: 'T3X home' })).toHaveAttribute('href', '/t3x-dev');
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
        label === 'Workspace'
          ? '/orbit/release/branches/feature%2Frelease/workspaces'
          : '/orbit/release/schemas'
      );
      expect(target.searchParams.get('branch')).toBe(
        label === 'Workspace' ? null : 'feature/release'
      );
      expect(target.searchParams.get('workspace')).toBe('workspace_branch:feature/release');
    }
    const pullRequests = new URL(
      tabs.getByRole('link', { name: 'Pull requests' }).getAttribute('href')!,
      'http://localhost'
    );
    expect(pullRequests.pathname).toBe('/orbit/release/pull-requests');
    expect(pullRequests.searchParams.get('branch')).toBe('feature/release');
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
