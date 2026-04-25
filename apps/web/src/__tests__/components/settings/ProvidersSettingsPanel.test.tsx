// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProvidersSettingsPanel } from '@/components/settings/ProvidersSettingsPanel';

const {
  mockUseProviderCommands,
  mockFetchProviders,
  mockFetchProviderRoles,
  mockFetchLocalProviderStatus,
} = vi.hoisted(() => ({
  mockUseProviderCommands: vi.fn(),
  mockFetchProviders: vi.fn(),
  mockFetchProviderRoles: vi.fn(),
  mockFetchLocalProviderStatus: vi.fn(),
}));

vi.mock('@/hooks/providers/useProviderCommands', () => ({
  useProviderCommands: mockUseProviderCommands,
}));

vi.mock('@/queries/providers', () => ({
  fetchProviders: mockFetchProviders,
  fetchProviderRoles: mockFetchProviderRoles,
}));

vi.mock('@/queries/providerStatus', () => ({
  fetchLocalProviderStatus: mockFetchLocalProviderStatus,
}));

vi.mock('@/components/settings/ProviderCredentialDialog', () => ({
  ProviderCredentialDialog: () => null,
}));

function status(
  provider: 'anthropic' | 'openai' | 'google',
  overrides: Partial<Record<string, unknown>> = {}
) {
  return {
    provider,
    configured: true,
    default_model: null,
    last_test_status: null,
    last_tested_at: null,
    last_test_error: null,
    api_key_source: 'file',
    api_key_preview: '…abcd',
    env_overrides_stored: false,
    ...overrides,
  };
}

describe('ProvidersSettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseProviderCommands.mockReturnValue({
      removeLocalProviderCredential: vi.fn(),
      runProviderConnectionTest: vi.fn(),
      saveLocalProviderCredential: vi.fn(),
      saveProviderRoles: vi.fn(),
    });

    mockFetchProviders.mockResolvedValue([
      {
        id: 'anthropic',
        name: 'Anthropic Claude',
        role: 'generation',
        configured: true,
        default_model: 'claude-sonnet-4-6',
        required_env_keys: ['ANTHROPIC_API_KEY'],
        available_models: ['claude-sonnet-4-6'],
      },
      {
        id: 'openai',
        name: 'OpenAI',
        role: 'generation',
        configured: true,
        default_model: null,
        required_env_keys: ['OPENAI_API_KEY'],
        available_models: ['gpt-5.4'],
      },
      {
        id: 'google-ai',
        name: 'Google AI (Gemini)',
        role: 'generation',
        configured: false,
        default_model: null,
        required_env_keys: ['GOOGLE_AI_STUDIO_KEY'],
        available_models: ['gemini-2.5-pro'],
      },
      {
        id: 'google-ai-embedding',
        name: 'Google AI Embedding',
        role: 'embedding',
        configured: true,
        default_model: 'gemini-embedding-001',
        required_env_keys: ['GOOGLE_AI_STUDIO_KEY'],
        available_models: ['gemini-embedding-001'],
      },
    ]);
    mockFetchProviderRoles.mockResolvedValue([]);

    // Per-provider status matches the "env > file > none" resolution the API
    // exposes. The panel fetches these three in parallel on mount.
    mockFetchLocalProviderStatus.mockImplementation(async (provider: string) => {
      if (provider === 'anthropic') {
        return status('anthropic', { api_key_source: 'env', api_key_preview: '…JnYA' });
      }
      if (provider === 'openai') {
        return status('openai', {
          api_key_source: 'env',
          api_key_preview: '…XfPq',
          env_overrides_stored: true,
        });
      }
      if (provider === 'google') {
        return status('google', {
          configured: false,
          api_key_source: 'none',
          api_key_preview: null,
        });
      }
      return null;
    });
  });

  it('renders a single Providers section with the three generation cards', async () => {
    render(<ProvidersSettingsPanel />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Providers' })).toBeInTheDocument();
    });

    expect(screen.getByText('Anthropic Claude')).toBeInTheDocument();
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByText('Google')).toBeInTheDocument();
  });

  it('shows source chip + preview for each provider', async () => {
    render(<ProvidersSettingsPanel />);
    await waitFor(() => screen.getByRole('heading', { name: 'Providers' }));

    // Anthropic + OpenAI both come from env; Google is not configured.
    expect(screen.getAllByText('from .env').length).toBe(2);
    expect(screen.getByText('Not configured')).toBeInTheDocument();

    // Previews render alongside the chip (last-4-char tails).
    expect(screen.getByText(/…JnYA/)).toBeInTheDocument();
    expect(screen.getByText(/…XfPq/)).toBeInTheDocument();
  });

  it('renders the env-overrides-stored warning exactly where applicable', async () => {
    render(<ProvidersSettingsPanel />);
    await waitFor(() => screen.getByRole('heading', { name: 'Providers' }));

    const banners = screen.getAllByText(/environment variable is overriding/i);
    expect(banners).toHaveLength(1);
  });

  it('does not render the retired LLM Generation / Embedding section headings', async () => {
    render(<ProvidersSettingsPanel />);
    await waitFor(() => screen.getByRole('heading', { name: 'Providers' }));

    expect(screen.queryByRole('heading', { name: 'LLM Generation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Embedding' })).not.toBeInTheDocument();
  });

  it('filters embedding providers out of the displayed cards', async () => {
    render(<ProvidersSettingsPanel />);
    await waitFor(() => screen.getByRole('heading', { name: 'Providers' }));

    expect(screen.queryByText('Google AI Embedding')).not.toBeInTheDocument();
  });

  it('still exposes the Refresh control for manual reload', async () => {
    render(<ProvidersSettingsPanel />);
    await waitFor(() => screen.getByRole('heading', { name: 'Providers' }));

    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });
});
