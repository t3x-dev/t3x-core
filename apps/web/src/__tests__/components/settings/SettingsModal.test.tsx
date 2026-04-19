// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsModal } from '@/components/settings/SettingsModal';
import { fetchProviders } from '@/queries/providers';
import { useSettingsModalStore } from '@/store/settingsModalStore';

vi.mock('next-themes', () => ({
  useTheme: () => ({
    theme: 'system',
    setTheme: vi.fn(),
  }),
}));

vi.mock('@/queries/providers', () => ({
  fetchProviders: vi.fn().mockResolvedValue([
    {
      id: 'claude',
      name: 'Claude',
      role: 'generation',
      roles: ['generation'],
      configured: true,
      required_env_keys: [],
      default_model: 'claude-sonnet-4-20250514',
      available_models: ['claude-sonnet-4-20250514', 'claude-3-7-sonnet-latest'],
    },
    {
      id: 'openai',
      name: 'OpenAI',
      role: 'generation',
      roles: ['generation'],
      configured: false,
      required_env_keys: [],
      default_model: null,
      available_models: ['gpt-4o-mini'],
    },
    {
      id: 'google',
      name: 'Google',
      role: 'generation',
      roles: ['generation'],
      configured: false,
      required_env_keys: [],
      default_model: null,
      available_models: ['gemini-2.5-pro'],
    },
  ]),
  fetchProviderRoles: vi.fn().mockResolvedValue([]),
  toLocalProviderId: vi.fn((providerId: string) => {
    const map: Record<string, string | null> = {
      claude: 'anthropic',
      openai: 'openai',
      google: 'google',
    };
    return map[providerId] ?? null;
  }),
}));

vi.mock('@/queries/providerStatus', () => ({
  fetchLocalProviderStatus: vi.fn(),
}));

vi.mock('@/hooks/providers/useProviderCommands', () => ({
  useProviderCommands: () => ({
    removeLocalProviderCredential: vi.fn(),
    runProviderConnectionTest: vi.fn(),
    saveLocalProviderCredential: vi.fn(),
    saveProviderRoles: vi.fn(),
  }),
}));

describe('SettingsModal', () => {
  beforeEach(() => {
    vi.mocked(fetchProviders).mockResolvedValue([
      {
        id: 'claude',
        name: 'Claude',
        role: 'generation',
        roles: ['generation'],
        configured: true,
        required_env_keys: [],
        default_model: 'claude-sonnet-4-20250514',
        available_models: ['claude-sonnet-4-20250514', 'claude-3-7-sonnet-latest'],
      },
      {
        id: 'openai',
        name: 'OpenAI',
        role: 'generation',
        roles: ['generation'],
        configured: false,
        required_env_keys: [],
        default_model: null,
        available_models: ['gpt-4o-mini'],
      },
      {
        id: 'google',
        name: 'Google',
        role: 'generation',
        roles: ['generation'],
        configured: false,
        required_env_keys: [],
        default_model: null,
        available_models: ['gemini-2.5-pro'],
      },
    ]);
    useSettingsModalStore.setState({
      isOpen: false,
      selectedTab: 'profile',
    });
  });

  it('does not render dialog content while closed', () => {
    render(<SettingsModal />);

    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull();
  });

  it('renders the reusable settings panels and switches tabs through the global store', async () => {
    useSettingsModalStore.getState().open('profile');

    render(<SettingsModal />);

    expect(screen.getByRole('dialog', { name: 'Settings' })).not.toBeNull();
    expect(screen.getByRole('tab', { name: 'Profile' }).getAttribute('data-state')).toBe('active');
    expect(screen.getByRole('heading', { name: 'Profile' })).not.toBeNull();
    expect(screen.getByLabelText('Display name')).not.toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Preferences' }));

    expect(useSettingsModalStore.getState().selectedTab).toBe('preferences');
    expect(screen.getByRole('heading', { name: 'Preferences' })).not.toBeNull();
    expect(screen.getByText('Choose your color theme.')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'System' })).not.toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Providers' }));

    expect(useSettingsModalStore.getState().selectedTab).toBe('providers');
    expect(screen.getByRole('heading', { name: 'Providers' })).not.toBeNull();
    expect(screen.getByText('Set up and test a provider here, then choose models in chat.')).not.toBeNull();
    expect(await screen.findByRole('button', { name: 'Edit setup' })).not.toBeNull();
    expect(screen.getByText('Provider')).not.toBeNull();
  });

  it('closes through the dismiss button', () => {
    useSettingsModalStore.getState().open('preferences');

    render(<SettingsModal />);

    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));

    expect(useSettingsModalStore.getState().isOpen).toBe(false);
  });

  it('shows an inline error state when providers fail to load', async () => {
    vi.mocked(fetchProviders).mockRejectedValueOnce(new Error('Request timed out after 10000ms'));
    useSettingsModalStore.getState().open('providers');

    render(<SettingsModal />);

    expect(await screen.findByText('Failed to load providers')).not.toBeNull();
    expect(screen.getByText('Request timed out after 10000ms')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Retry' })).not.toBeNull();
  });
});
