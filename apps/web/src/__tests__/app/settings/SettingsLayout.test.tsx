// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsLayout from '@/app/settings/layout';

let mockPathname = '/settings';
let mockSearchParams = new URLSearchParams();
let activeNamespaceName: string | null = 'Orbit Labs';
let activeNamespaceSlug = 'orbit-labs';
const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/hooks/shared/useSession', () => ({
  useSession: () => ({
    clear: vi.fn(),
    getKey: vi.fn(() => null),
  }),
}));

vi.mock('@/hooks/projects/useProjectDetail', () => ({
  useProjectDetail: () => ({
    loadProject: vi.fn().mockRejectedValue(new Error('not needed in layout test')),
  }),
}));

vi.mock('@/hooks/accounts/useNamespaceAccounts', () => ({
  useNamespaceAccounts: () => ({
    activeAccount: activeNamespaceName
      ? {
          namespace: {
            kind: 'organization',
            display_name: activeNamespaceName,
            slug: activeNamespaceSlug,
          },
        }
      : null,
  }),
}));

function renderLayout() {
  return render(
    <SettingsLayout>
      <div>Settings content</div>
    </SettingsLayout>
  );
}

describe('SettingsLayout', () => {
  beforeEach(() => {
    activeNamespaceName = 'Orbit Labs';
    activeNamespaceSlug = 'orbit-labs';
    mockPathname = '/settings';
    mockSearchParams = new URLSearchParams();
    mockPush.mockClear();
  });

  it('keeps a provider-credentials owner as entry context without propagating it to Members', () => {
    activeNamespaceName = 'Team A';
    activeNamespaceSlug = 'team-a';
    mockPathname = '/settings/provider-credentials';
    mockSearchParams = new URLSearchParams({ owner: 'team-b' });

    renderLayout();

    expect(screen.getByRole('link', { name: 'team-b' })).toHaveAttribute('href', '/team-b');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/settings/provider-credentials?owner=team-b'
    );
    expect(screen.getByText('Organization: Team A')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Members' })).toHaveAttribute(
      'href',
      '/settings/members'
    );
    expect(screen.getByRole('link', { name: 'General' })).toHaveAttribute('href', '/settings');
    fireEvent.change(screen.getByLabelText('Settings'), {
      target: { value: '/settings/members' },
    });
    expect(mockPush).toHaveBeenLastCalledWith('/settings/members');
  });

  it.each([
    '/settings',
    '/settings/members',
  ])('shows active account A on %s even when a stale owner B remains in the URL', (pathname) => {
    activeNamespaceName = 'Team A';
    activeNamespaceSlug = 'team-a';
    mockPathname = pathname;
    mockSearchParams = new URLSearchParams({ owner: 'team-b' });

    renderLayout();

    expect(screen.getByRole('link', { name: 'team-a' })).toHaveAttribute('href', '/team-a');
    expect(screen.queryByRole('link', { name: 'team-b' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create new' })).toHaveAttribute('href', '/team-a/new');
    expect(screen.getByRole('link', { name: 'Members' })).toHaveAttribute(
      'href',
      '/settings/members'
    );
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/settings/provider-credentials'
    );
  });

  it('keeps return context and a project filter when switching between automation pages', () => {
    mockPathname = '/settings/recipes';
    mockSearchParams = new URLSearchParams({
      owner: 'team-a',
      project: 'proj_test',
      returnTo: '/team-a/repo/workspaces',
      unrelated: 'ignored',
    });

    renderLayout();

    const href = screen.getByRole('link', { name: 'Webhooks' }).getAttribute('href') ?? '';
    const query = new URL(href, 'http://localhost').searchParams;
    expect(query.has('owner')).toBe(false);
    expect(query.get('project')).toBe('proj_test');
    expect(query.get('returnTo')).toBe('/team-a/repo/workspaces');
    expect(query.has('unrelated')).toBe(false);

    fireEvent.change(screen.getByLabelText('Settings'), {
      target: { value: '/settings/webhooks' },
    });
    expect(mockPush).toHaveBeenLastCalledWith(href);
    expect(screen.getByRole('link', { name: 'Usage' }).getAttribute('href')).not.toContain(
      'project='
    );
  });

  it('keeps account settings outside project navigation even with a legacy project parameter', () => {
    mockPathname = '/settings';
    mockSearchParams = new URLSearchParams('project=proj_test');

    renderLayout();

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Project views' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Usage' })).toHaveAttribute('href', '/settings/usage');
    expect(screen.getByText('Automations')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Webhooks/i })).toHaveAttribute(
      'href',
      '/settings/webhooks'
    );
    expect(screen.getByRole('link', { name: /Recipes/i })).toHaveAttribute(
      'href',
      '/settings/recipes'
    );
  });

  it('uses the shared personal and organization navigation', () => {
    mockPathname = '/settings';
    mockSearchParams = new URLSearchParams();

    renderLayout();

    expect(screen.getByText('Personal')).toBeInTheDocument();
    expect(screen.getByText('Organization: Orbit Labs')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Profile/i })).toHaveAttribute(
      'href',
      '/settings/profile'
    );
    expect(screen.getByRole('link', { name: /Appearance/i })).toHaveAttribute(
      'href',
      '/settings/preferences'
    );
    expect(screen.getByRole('link', { name: /Model access/i })).toHaveAttribute(
      'href',
      '/settings/model-access'
    );
    expect(screen.getByRole('link', { name: /Members/i })).toHaveAttribute(
      'href',
      '/settings/members'
    );
    expect(screen.getByRole('link', { name: 'Usage' })).toHaveAttribute('href', '/settings/usage');
    expect(screen.queryByRole('link', { name: 'Provider credentials' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Help' })).toHaveAttribute('href', '/settings/help');
  });

  it('marks the current settings destination', () => {
    mockPathname = '/settings/usage';
    mockSearchParams = new URLSearchParams();

    renderLayout();

    expect(screen.getByRole('link', { name: 'Usage' })).toHaveAttribute('aria-current', 'page');
  });

  it('shows the selected namespace and preserves the API tokens compatibility route', () => {
    activeNamespaceName = 'New Team';
    mockPathname = '/settings/access';
    mockSearchParams = new URLSearchParams();

    renderLayout();

    expect(screen.getByText('Organization: New Team')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'API tokens' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    activeNamespaceName = 'Orbit Labs';
  });

  it('marks Members as the current organization destination', () => {
    mockPathname = '/settings/members';
    mockSearchParams = new URLSearchParams();

    renderLayout();

    expect(screen.getByRole('link', { name: /Members/i })).toHaveAttribute('aria-current', 'page');
  });

  it('marks Webhooks as the current automation destination', () => {
    mockPathname = '/settings/webhooks';
    mockSearchParams = new URLSearchParams('project=proj_test');

    renderLayout();

    expect(screen.getByRole('link', { name: /Webhooks/i })).toHaveAttribute('aria-current', 'page');
  });
});
