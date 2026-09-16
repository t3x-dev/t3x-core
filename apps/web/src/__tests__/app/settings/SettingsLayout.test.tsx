// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import SettingsLayout from '@/app/settings/layout';

let mockPathname = '/settings';
let mockSearchParams = new URLSearchParams();

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
    expect(screen.getByRole('link', { name: /Plan & usage/i })).toHaveAttribute(
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
    expect(screen.getByText('Organization: orbit-labs')).toBeInTheDocument();
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
    expect(screen.getByRole('link', { name: /Plan & usage/i })).toHaveAttribute(
      'href',
      '/settings/usage'
    );
  });

  it('marks the current settings destination', () => {
    mockPathname = '/settings/usage';
    mockSearchParams = new URLSearchParams();

    renderLayout();

    expect(screen.getByRole('link', { name: /Plan & usage/i })).toHaveAttribute(
      'aria-current',
      'page'
    );
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
