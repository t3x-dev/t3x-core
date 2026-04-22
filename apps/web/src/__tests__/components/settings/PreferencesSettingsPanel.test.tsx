// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-themes', () => ({
  useTheme: vi.fn(() => ({
    theme: 'system',
    setTheme: vi.fn(),
  })),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/hooks/shared/useAuthMe', () => ({
  useAuthMe: vi.fn(),
}));

vi.mock('@/hooks/shared/useSession', () => ({
  useSession: vi.fn(),
}));

vi.mock('@/components/shared/ModelSelector', () => ({
  ModelSelector: ({
    initialProvider,
    initialModel,
    onChange,
  }: {
    initialProvider?: string | null;
    initialModel?: string | null;
    onChange: (provider: string | null, model: string | null) => void;
  }) => (
    <div>
      <div data-testid="initial-provider">{initialProvider ?? ''}</div>
      <div data-testid="initial-model">{initialModel ?? ''}</div>
      <button type="button" onClick={() => onChange('openai', 'gpt-5.4')}>
        Select OpenAI
      </button>
    </div>
  ),
}));

import { PreferencesSettingsPanel } from '@/components/settings/PreferencesSettingsPanel';
import { useAuthMe } from '@/hooks/shared/useAuthMe';
import { useSession } from '@/hooks/shared/useSession';

describe('PreferencesSettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSession).mockReturnValue({
      getUser: vi.fn(),
      setUser: vi.fn(),
      getKey: vi.fn(() => null),
      setKey: vi.fn(),
      clear: vi.fn(),
    });
    vi.mocked(useAuthMe).mockReturnValue({
      loadAuthMe: vi.fn(),
      saveAuthMe: vi.fn(),
    });
  });

  it('shows a sign-in message when no authenticated session exists', () => {
    render(<PreferencesSettingsPanel />);

    expect(screen.getByText('Model Defaults')).toBeInTheDocument();
    expect(
      screen.getByText('Sign in to save account-level provider/model defaults.')
    ).toBeInTheDocument();
  });

  it('loads and saves authenticated user defaults', async () => {
    const loadAuthMe = vi.fn().mockResolvedValue({
      id: 'user_1',
      name: 'Test User',
      username: 'test',
      email: 'test@example.com',
      avatar_url: null,
      default_provider: 'anthropic',
      default_model: 'claude-sonnet-4-20250514',
    });
    const saveAuthMe = vi.fn().mockResolvedValue({
      id: 'user_1',
      name: 'Test User',
      username: 'test',
      email: 'test@example.com',
      avatar_url: null,
      default_provider: 'openai',
      default_model: 'gpt-5.4',
    });
    vi.mocked(useSession).mockReturnValue({
      getUser: vi.fn(),
      setUser: vi.fn(),
      getKey: vi.fn(() => 'session-key'),
      setKey: vi.fn(),
      clear: vi.fn(),
    });
    vi.mocked(useAuthMe).mockReturnValue({
      loadAuthMe,
      saveAuthMe,
    });

    render(<PreferencesSettingsPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('initial-provider')).toHaveTextContent('anthropic');
    });
    expect(screen.getByTestId('initial-model')).toHaveTextContent('claude-sonnet-4-20250514');

    fireEvent.click(screen.getByText('Select OpenAI'));
    fireEvent.click(screen.getByRole('button', { name: 'Save Defaults' }));

    await waitFor(() => {
      expect(saveAuthMe).toHaveBeenCalledWith({
        default_provider: 'openai',
        default_model: 'gpt-5.4',
      });
    });
  });
});
