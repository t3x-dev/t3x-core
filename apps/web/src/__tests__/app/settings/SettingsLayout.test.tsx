// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import SettingsLayout from '@/app/settings/layout';

let mockPathname = '/settings';

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
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

describe('SettingsLayout', () => {
  it('groups settings navigation by product ownership and scope', () => {
    mockPathname = '/settings';

    render(
      <SettingsLayout>
        <div>Settings content</div>
      </SettingsLayout>
    );

    expect(screen.getByText('OVERVIEW')).toBeInTheDocument();
    expect(screen.getByText('LOCAL')).toBeInTheDocument();
    expect(screen.getByText('AI')).toBeInTheDocument();
    expect(screen.getByText('ACCESS')).toBeInTheDocument();
    expect(screen.getByText('AUTOMATION')).toBeInTheDocument();
    expect(screen.getByText('PROJECT')).toBeInTheDocument();

    expect(screen.getByRole('link', { name: /Back to workspace/i })).toHaveAttribute(
      'href',
      '/chat'
    );
    expect(screen.getByRole('link', { name: /Overview/i })).toHaveAttribute('href', '/settings');
    expect(screen.getByRole('link', { name: /Profile/i })).toHaveAttribute(
      'href',
      '/settings/profile'
    );
    expect(screen.getByRole('link', { name: /Providers/i })).toHaveAttribute(
      'href',
      '/settings/providers'
    );
    expect(screen.getByRole('link', { name: /Webhooks/i })).toHaveAttribute(
      'href',
      '/settings/webhooks'
    );
    expect(screen.getByText('Project overrides are edited from each project.')).toBeInTheDocument();
  });
});
