// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { OrganizationSettingsPage } from '@/components/project/OrganizationSettingsPage';

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

describe('OrganizationSettingsPage', () => {
  it('presents organization settings as owner namespace controls', () => {
    render(<OrganizationSettingsPage ownerSlug="t3x-dev" />);

    expect(screen.getByRole('heading', { name: 't3x-dev settings' })).toBeInTheDocument();
    expect(screen.getByText('Owner namespace')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Organization profile' })).toBeInTheDocument();
    expect(screen.getByLabelText('Organization display name')).toHaveValue('t3x-dev');
    expect(screen.getByLabelText('Organization slug')).toHaveValue('t3x-dev');
    expect(screen.getByLabelText('Organization description')).toHaveValue(
      'Organization namespace for structured state repositories.'
    );
    expect(screen.getByText('Repository creation defaults')).toBeInTheDocument();
    expect(screen.getByLabelText('Default repository visibility')).toHaveTextContent('Local only');
    expect(screen.getByLabelText('Default repository template')).toHaveTextContent(
      'Structured state repository'
    );
    expect(screen.getByText('Members and access')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Invite member' })).toBeDisabled();
    expect(screen.getByText('Member management requires cloud auth.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Global setup' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Organization display name'), {
      target: { value: 'T3X Dev' },
    });
    expect(screen.getByRole('button', { name: 'Save organization profile' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reset profile form' })).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Open provider setup' })).toHaveAttribute(
      'href',
      '/settings/providers'
    );
    expect(screen.getByRole('link', { name: 'Open API / CLI / MCP access' })).toHaveAttribute(
      'href',
      '/settings/access'
    );
  });
});
