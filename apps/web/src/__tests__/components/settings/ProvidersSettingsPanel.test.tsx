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

describe('ProvidersSettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseProviderCommands.mockReturnValue({
      removeLocalProviderCredential: vi.fn(),
      runProviderConnectionTest: vi.fn(),
      saveLocalProviderCredential: vi.fn(),
      saveProviderRoles: vi.fn(),
    });

    // Backend still returns the full mix of generation + embedding providers;
    // the panel must filter to just the three generation ids it recognises.
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
        configured: false,
        default_model: null,
        required_env_keys: ['OPENAI_API_KEY'],
        available_models: ['gpt-5.4'],
      },
      {
        id: 'google-ai',
        name: 'Google AI (Gemini)',
        role: 'generation',
        configured: true,
        default_model: 'gemini-2.5-pro',
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
    mockFetchLocalProviderStatus.mockResolvedValue(null);
  });

  it('renders a single Providers section with the three generation cards', async () => {
    render(<ProvidersSettingsPanel />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Providers' })).toBeInTheDocument();
    });

    expect(screen.getByText('Anthropic Claude')).toBeInTheDocument();
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    // Google card renames to "Google" in the UI.
    expect(screen.getByText('Google')).toBeInTheDocument();

    // Configured cards show "Key configured"; unconfigured show "No API key set".
    expect(screen.getAllByText('Key configured').length).toBe(2);
    expect(screen.getByText('No API key set')).toBeInTheDocument();
  });

  it('does not render the retired LLM Generation / Embedding section headings', async () => {
    render(<ProvidersSettingsPanel />);
    await waitFor(() => screen.getByRole('heading', { name: 'Providers' }));

    expect(screen.queryByRole('heading', { name: 'LLM Generation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Embedding' })).not.toBeInTheDocument();
  });

  it('filters out embedding providers from the displayed cards', async () => {
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
