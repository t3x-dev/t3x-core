// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/hooks/access/useAccessSettings', () => ({
  useAccessSettings: vi.fn(),
}));

import { AccessSettingsPanel } from '@/components/settings/AccessSettingsPanel';
import { useAccessSettings } from '@/hooks/access/useAccessSettings';

describe('AccessSettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads and renders the current local shared access state', async () => {
    const fetchLocalConfig = vi.fn().mockResolvedValue({
      api_url: 'http://localhost:8000/api',
      api_url_source: 'default',
      api_key_present: false,
      api_key_source: 'none',
      api_key_preview: null,
      config_path: '/Users/test/.t3x/config.json',
    });

    vi.mocked(useAccessSettings).mockReturnValue({
      fetchLocalConfig,
      saveLocalConfig: vi.fn(),
      clearLocalApiKey: vi.fn(),
    });

    render(<AccessSettingsPanel />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('http://localhost:8000/api')).toBeInTheDocument();
    });

    expect(screen.getByText('Local Shared Access')).toBeInTheDocument();
    expect(screen.getByText('API key not configured')).toBeInTheDocument();
    expect(screen.getByText('/Users/test/.t3x/config.json')).toBeInTheDocument();
  });

  it('saves api url and api key, then clears the stored key', async () => {
    const fetchLocalConfig = vi.fn().mockResolvedValue({
      api_url: 'http://localhost:8000/api',
      api_url_source: 'default',
      api_key_present: false,
      api_key_source: 'none',
      api_key_preview: null,
      config_path: '/Users/test/.t3x/config.json',
    });
    const saveLocalConfig = vi.fn().mockResolvedValue({
      api_url: 'http://127.0.0.1:8100/api',
      api_url_source: 'file',
      api_key_present: true,
      api_key_source: 'file',
      api_key_preview: 't3xk_loc...',
      config_path: '/Users/test/.t3x/config.json',
    });
    const clearLocalApiKey = vi.fn().mockResolvedValue({
      api_url: 'http://127.0.0.1:8100/api',
      api_url_source: 'file',
      api_key_present: false,
      api_key_source: 'none',
      api_key_preview: null,
      config_path: '/Users/test/.t3x/config.json',
    });

    vi.mocked(useAccessSettings).mockReturnValue({
      fetchLocalConfig,
      saveLocalConfig,
      clearLocalApiKey,
    });

    render(<AccessSettingsPanel />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('http://localhost:8000/api')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('API URL'), {
      target: { value: 'http://127.0.0.1:8100/api' },
    });
    fireEvent.change(screen.getByLabelText('API Key'), {
      target: { value: 't3xk_local_test_key' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Access' }));

    await waitFor(() => {
      expect(saveLocalConfig).toHaveBeenCalledWith({
        api_url: 'http://127.0.0.1:8100/api',
        api_key: 't3xk_local_test_key',
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear Stored Key' }));

    await waitFor(() => {
      expect(clearLocalApiKey).toHaveBeenCalled();
    });
  });
});
