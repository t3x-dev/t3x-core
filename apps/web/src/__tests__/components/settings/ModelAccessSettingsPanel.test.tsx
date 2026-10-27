// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelAccessSettingsPanel } from '@/components/settings/ModelAccessSettingsPanel';

const mocks = vi.hoisted(() => ({
  runTest: vi.fn(),
  settings: {
    config: {
      default_model: 'gpt-5.4',
      enabled_models: ['gpt-5.4', 'claude-sonnet-4-6'],
      task_defaults: {
        compose: { fallback_model: null, primary_model: 'gpt-5.4' },
        extraction: { fallback_model: null, primary_model: 'gpt-5.4' },
        validation: { fallback_model: null, primary_model: 'gpt-5.4' },
      },
    },
    error: null,
    loading: false,
    providers: [
      {
        available_models: ['gpt-5.4'],
        configured: true,
        default_model: 'gpt-5.4',
        id: 'openai',
        name: 'OpenAI',
        required_env_keys: ['OPENAI_API_KEY'],
        role: 'generation',
      },
      {
        available_models: ['claude-sonnet-4-6'],
        configured: true,
        default_model: 'claude-sonnet-4-6',
        id: 'anthropic',
        name: 'Anthropic',
        required_env_keys: ['ANTHROPIC_API_KEY'],
        role: 'generation',
      },
    ],
    retry: vi.fn(),
    save: vi.fn(),
    saving: false,
  },
}));

vi.mock('@/hooks/providers/useModelAccessSettings', () => ({
  useModelAccessSettings: () => mocks.settings,
}));

vi.mock('@/commands/providers', () => ({
  runProviderConnectionTest: (...args: unknown[]) => mocks.runTest(...args),
}));

describe('ModelAccessSettingsPanel', () => {
  beforeEach(() => {
    mocks.runTest.mockReset();
    mocks.runTest.mockResolvedValue({ latency_ms: 42, ok: true });
  });

  it('tests a model connection and shows the result', async () => {
    render(<ModelAccessSettingsPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Test GPT-5.4' }));

    await waitFor(() => {
      expect(mocks.runTest).toHaveBeenCalledWith('openai');
    });
    expect(await screen.findByText('Connected · 42ms')).toBeInTheDocument();
  });

  it('tests every enabled provider from the section action', async () => {
    render(<ModelAccessSettingsPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Test connections' }));

    await waitFor(() => {
      expect(mocks.runTest).toHaveBeenCalledWith('openai');
      expect(mocks.runTest).toHaveBeenCalledWith('anthropic');
    });
  });

  it('shows a reachable failure when the provider cannot be contacted', async () => {
    mocks.runTest.mockResolvedValue({ error: 'fetch failed', ok: false });
    render(<ModelAccessSettingsPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Test GPT-5.4' }));

    expect(
      await screen.findByText(
        'Could not reach the model provider. Check the network and API endpoint, then test again.'
      )
    ).toBeInTheDocument();
  });
});
