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
        localWorkspaceName: 'Local Workspace',
        localWorkspaceAvatarColor: 'blue',
      });
    });
    sessionState.getKey.mockReturnValue(null);
    sessionState.getUser.mockReturnValue(null);
  });

  it('renders a local workspace account surface when auth is disabled', () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_DISABLED', 'true');

    render(<ProfileSettingsPanel />);

    expect(screen.getByLabelText('Workspace name')).toHaveValue('Local Workspace');
    expect(
      screen.getByText('Customize how this local workspace appears in the app.')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Settings stay local to this browser. Manage model providers from the Providers tab when you need API-backed features.'
      )
    ).toBeInTheDocument();
    expect(loadAuthMe).not.toHaveBeenCalled();
  });

  it('updates the local workspace name from the profile editor', () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_DISABLED', 'true');

    render(<ProfileSettingsPanel />);

    fireEvent.change(screen.getByLabelText('Workspace name'), {
      target: { value: 'Meaning Studio' },
    });

    expect(useSettingsStore.getState().localWorkspaceName).toBe('Meaning Studio');
    expect(screen.getByDisplayValue('Meaning Studio')).toBeInTheDocument();
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
