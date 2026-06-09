// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileSettingsPanel } from '@/components/settings/ProfileSettingsPanel';
import { useSettingsStore } from '@/store/settingsStore';

vi.hoisted(() => {
  if (
    typeof globalThis.localStorage !== 'object' ||
    typeof globalThis.localStorage.setItem === 'function'
  ) {
    return;
  }

  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, String(value)),
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => store.clear(),
      get length() {
        return store.size;
      },
      key: (index: number) => [...store.keys()][index] ?? null,
    },
  });
});

const loadAuthMe = vi.fn();
const sessionState = {
  getKey: vi.fn(),
  getUser: vi.fn(),
};

vi.mock('@/hooks/shared/useAuthMe', () => ({
  useAuthMe: () => ({ loadAuthMe }),
}));

vi.mock('@/hooks/shared/useSession', () => ({
  useSession: () => ({
    getKey: sessionState.getKey,
    getUser: sessionState.getUser,
  }),
}));

describe('ProfileSettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    act(() => {
      useSettingsStore.setState({
        localWorkspaceName: 'Local user',
        localWorkspaceAvatarColor: 'blue',
      });
    });
    sessionState.getKey.mockReturnValue(null);
    sessionState.getUser.mockReturnValue(null);
  });

  it('renders a local profile surface when auth is disabled', () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_DISABLED', 'true');

    render(<ProfileSettingsPanel />);

    expect(screen.getByLabelText('Display name')).toHaveValue('Local user');
    expect(
      screen.getByText('Set the local identity used in the sidebar and edit history.')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Settings stay local to this browser. The display name is used as the author for local edits.'
      )
    ).toBeInTheDocument();
    expect(loadAuthMe).not.toHaveBeenCalled();
  });

  it('updates the local display name from the profile editor', () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_DISABLED', 'true');

    render(<ProfileSettingsPanel />);

    fireEvent.change(screen.getByLabelText('Display name'), {
      target: { value: 'Meaning Studio' },
    });

    expect(useSettingsStore.getState().localWorkspaceName).toBe('Meaning Studio');
    expect(screen.getByDisplayValue('Meaning Studio')).toBeInTheDocument();
  });

  it('restores the default display name when the profile editor is left blank', () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_DISABLED', 'true');

    render(<ProfileSettingsPanel />);

    const input = screen.getByLabelText('Display name');
    fireEvent.change(input, {
      target: { value: '   ' },
    });
    fireEvent.blur(input);

    expect(useSettingsStore.getState().localWorkspaceName).toBe('Local user');
    expect(screen.getByDisplayValue('Local user')).toBeInTheDocument();
  });

  it('renders cached account info and refreshes it when auth is enabled', async () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_DISABLED', 'false');
    sessionState.getKey.mockReturnValue('session_key');
    sessionState.getUser.mockReturnValue({
      id: 'user_1',
      name: 'Cached Name',
      username: 'cached_user',
      avatar_url: null,
    });
    loadAuthMe.mockResolvedValue({
      id: 'user_1',
      name: 'Fresh Name',
      username: 'fresh_user',
      email: 'fresh@example.com',
      avatar_url: null,
    });

    render(<ProfileSettingsPanel />);

    expect(screen.getByText('Cached Name')).toBeInTheDocument();
    expect(screen.getByText('@cached_user')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Fresh Name')).toBeInTheDocument();
    });

    expect(screen.getByText('@fresh_user')).toBeInTheDocument();
    expect(screen.getByText('fresh@example.com')).toBeInTheDocument();

    await waitFor(() => {
      expect(loadAuthMe).toHaveBeenCalledTimes(1);
    });
  });
});
