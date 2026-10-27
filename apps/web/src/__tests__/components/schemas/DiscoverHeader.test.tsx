// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DiscoverHeader } from '@/components/schemas/DiscoverHeader';

describe('DiscoverHeader navigation', () => {
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
      expect(target.pathname).toBe(`/orbit/release/${label.toLowerCase()}s`);
      expect(target.searchParams.get('branch')).toBe('feature/release');
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
      '/explore?view=discover'
    );
    expect(globalNavigation.getByRole('link', { name: 'Browse' })).toHaveAttribute(
      'href',
      '/explore?view=browse'
    );
    expect(
      globalNavigation.getAllByRole('link').every((link) => !link.hasAttribute('aria-current'))
    ).toBe(true);
  });

  it('keeps namespace settings and repository creation under the supplied owner', () => {
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
  });

  it('gives Discover and Browse global navigation without invented repository state', () => {
    render(<DiscoverHeader />);

    const globalNavigation = within(screen.getByRole('navigation', { name: 'Global' }));
    expect(globalNavigation.getByRole('link', { name: 'Discover' })).toHaveAttribute(
      'href',
      '/explore?view=discover'
    );
    expect(globalNavigation.getByRole('link', { name: 'Discover' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(globalNavigation.getByRole('link', { name: 'Browse' })).toHaveAttribute(
      'href',
      '/explore?view=browse'
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
});
