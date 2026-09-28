// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileSettingsPanel } from '@/components/settings/ProfileSettingsPanel';
import { useSettingsStore } from '@/store/settingsStore';

const save = vi.fn();
const revoke = vi.fn();
const retry = vi.fn();
const profileState = {
  data: {
    name: 'Jordan Diaz',
    email: 'jordan@orbit-labs.com',
    avatar_url: null,
    timezone: 'America/Los_Angeles',
    sessions: [
      {
        id: 'ak_current',
        name: 'session:user_1',
        current: true,
        last_active: new Date().toISOString(),
      },
      {
        id: 'ak_other',
        name: 'session:user_1',
        current: false,
        last_active: new Date(Date.now() - 3_600_000).toISOString(),
      },
    ],
  },
  loading: false,
  saving: false,
  error: null,
  retry,
  save,
  revoke,
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
    expect(revoke).toHaveBeenCalledWith('ak_other');
  });
});
