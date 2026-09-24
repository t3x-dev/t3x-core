// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import SettingsLayout from '@/app/settings/layout';

let mockPathname = '/settings';
let mockSearchParams = new URLSearchParams();
let activeNamespaceName: string | null = 'Orbit Labs';

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
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
      ? { namespace: { kind: 'organization', display_name: activeNamespaceName } }
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
  it('keeps the shared project title bar on settings pages', () => {
    mockPathname = '/settings';
    mockSearchParams = new URLSearchParams('project=proj_test');

    renderLayout();

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Usage' })).toHaveAttribute(
      'href',
      '/settings/usage?project=proj_test'
    );
    expect(screen.getByText('Automations')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Webhooks/i })).toHaveAttribute(
      'href',
      '/settings/webhooks?project=proj_test'
    );
    expect(screen.getByRole('link', { name: /Recipes/i })).toHaveAttribute(
      'href',
      '/settings/recipes?project=proj_test'
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
    expect(screen.getByRole('link', { name: 'Provider credentials' })).toHaveAttribute(
      'href',
      '/settings/provider-credentials'
    );
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
