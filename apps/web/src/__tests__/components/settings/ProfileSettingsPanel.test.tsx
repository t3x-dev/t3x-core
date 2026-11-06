// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileSettingsPanel } from '@/components/settings/ProfileSettingsPanel';
import { useSettingsStore } from '@/store/settingsStore';

const save = vi.fn();
const revoke = vi.fn();
const unlink = vi.fn();
const retry = vi.fn();
const profileState = {
  data: {
    name: 'Jordan Diaz',
    email: 'jordan@orbit-labs.com',
    avatar_url: null,
    timezone: 'America/Los_Angeles',
    sessions: [
      {
        id: 'sess_current',
        auth_method: 'local_password',
        user_agent: 'Chrome on macOS',
        current: true,
        created_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      },
      {
        id: 'sess_other',
        auth_method: 'local_password',
        user_agent: 'Edge on Windows',
        current: false,
        created_at: new Date(Date.now() - 7_200_000).toISOString(),
        last_seen_at: new Date(Date.now() - 3_600_000).toISOString(),
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      },
    ],
    linked_accounts: [
      {
        id: 'acct_github',
        provider: 'github',
        provider_account_id: 'jordan',
        created_at: new Date().toISOString(),
      },
      {
        id: 'acct_google',
        provider: 'google',
        provider_account_id: 'jordan@orbit-labs.com',
        created_at: new Date().toISOString(),
      },
    ],
  },
  loading: false,
  saving: false,
  error: null,
  retry,
  save,
  revoke,
  unlink,
};

vi.mock('@/hooks/settings/useProfileSettings', () => ({
  useProfileSettings: () => profileState,
}));

describe('ProfileSettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    act(() => {
      useSettingsStore.setState({ localWorkspaceName: 'Local user' });
    });
  });

  it('renders and updates the local profile when auth is disabled', () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_DISABLED', 'true');
    render(<ProfileSettingsPanel />);

    const input = screen.getByLabelText('Display name');
    expect(input).toHaveValue('Local user');
    fireEvent.change(input, { target: { value: 'Meaning Studio' } });
    expect(useSettingsStore.getState().localWorkspaceName).toBe('Meaning Studio');
    expect(screen.getByText('Current browser')).toBeInTheDocument();
  });

  it('restores the default local name when the field is left blank', () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_DISABLED', 'true');
    render(<ProfileSettingsPanel />);
    const input = screen.getByLabelText('Display name');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.blur(input);
    expect(input).toHaveValue('Local user');
    expect(useSettingsStore.getState().localWorkspaceName).toBe('Local user');
  });

  it('renders authenticated profile details and revokes another session', () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_DISABLED', 'false');
    render(<ProfileSettingsPanel />);

    expect(screen.getByText('Jordan Diaz')).toBeInTheDocument();
    expect(screen.getByDisplayValue('jordan@orbit-labs.com')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(revoke).toHaveBeenCalledWith('sess_other');
  });

  it('shows linked accounts and lets the user unlink one', () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_DISABLED', 'false');
    render(<ProfileSettingsPanel />);

    expect(screen.getByText('Connected accounts')).toBeInTheDocument();
    expect(screen.getByText('jordan')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Unlink github account' }));
    expect(unlink).toHaveBeenCalledWith('acct_github');
  });
});
