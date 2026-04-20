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

    mockFetchProviders.mockResolvedValue([
      {
        id: 'openai',
        name: 'OpenAI',
        role: 'generation',
        configured: true,
        default_model: 'gpt-4o-mini',
        required_env_keys: ['OPENAI_API_KEY'],
        available_models: ['gpt-4o-mini'],
      },
      {
        id: 'voyage',
        name: 'Voyage',
        role: 'embedding',
        configured: false,
        default_model: null,
        required_env_keys: ['VOYAGE_API_KEY'],
        available_models: ['voyage-3'],
      },
    ]);
    mockFetchProviderRoles.mockResolvedValue([]);
    mockFetchLocalProviderStatus.mockResolvedValue(null);
  });

  it('renders provider management content without depending on the settings page shell', async () => {
    render(<ProvidersSettingsPanel />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'LLM Generation' })).toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { name: 'Embedding' })).toBeInTheDocument();
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByText('Voyage')).toBeInTheDocument();
    expect(screen.getByText('Default: gpt-4o-mini')).toBeInTheDocument();
    expect(screen.getByText('Requires: VOYAGE_API_KEY')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Providers' })).not.toBeInTheDocument();
    expect(
      screen.queryByText('Configure LLM, embedding, and NLP providers for T3X features.')
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });
});
