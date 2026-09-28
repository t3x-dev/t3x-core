// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OrganizationSettingsPage } from '@/components/project/OrganizationSettingsPage';

vi.mock('@/hooks/accounts/useNamespaceAccounts', () => ({
  useNamespaceAccounts: () => ({
    accounts: [
      { namespace: { slug: 't3x-dev', display_name: 'T3X Development', kind: 'organization' } },
    ],
    error: null,
    isLoading: false,
  }),
}));

describe('OrganizationSettingsPage', () => {
  it('shows read-only namespace identity and real settings destinations', () => {
    render(<OrganizationSettingsPage ownerSlug="t3x-dev" />);

    expect(screen.getByRole('heading', { name: 't3x-dev settings' })).toBeInTheDocument();
    expect(screen.getByText('T3X Development')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Save organization profile/i })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open provider credentials' })).toHaveAttribute(
      'href',
      '/settings/provider-credentials?returnTo=%2Ft3x-dev%2Fsettings'
    );
    expect(screen.getByRole('link', { name: 'Open API tokens' })).toHaveAttribute(
      'href',
      '/settings/access?returnTo=%2Ft3x-dev%2Fsettings'
    );
  });
});
