// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GeneralSettingsPanel } from '@/components/settings/GeneralSettingsPanel';

let activeAccount: { namespace: { slug: string; display_name: string; kind: string } } | null = {
  namespace: { slug: 'orbit-labs', display_name: 'Orbit Labs', kind: 'organization' },
};

vi.mock('@/hooks/accounts/useNamespaceAccounts', () => ({
  useNamespaceAccounts: () => ({ activeAccount, error: null, isLoading: false }),
}));

describe('GeneralSettingsPanel', () => {
  it('reads the active namespace instead of browser-only organization settings', () => {
    activeAccount = {
      namespace: { slug: 'orbit-labs', display_name: 'Orbit Labs', kind: 'organization' },
    };
    render(<GeneralSettingsPanel />);

    expect(screen.getByLabelText('Namespace name')).toHaveValue('Orbit Labs');
    expect(screen.getByLabelText('Namespace slug')).toHaveValue('orbit-labs');
    expect(screen.getByLabelText('Path')).toHaveValue('/orbit-labs');
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
  });

  it('does not invent a namespace when no account is available', () => {
    activeAccount = null;
    render(<GeneralSettingsPanel />);

    expect(screen.getByText('No active namespace is available.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Namespace name')).not.toBeInTheDocument();
  });
});
