// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserMenu } from '@/components/layout/UserMenu';
import { useSettingsModalStore } from '@/store/settingsModalStore';
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

const sessionState = {
  getKey: vi.fn(),
  getUser: vi.fn(),
  setUser: vi.fn(),
  clear: vi.fn(),
};

const loadAuthMe = vi.fn();

vi.mock('@/hooks/shared/useAuthMe', () => ({
  useAuthMe: () => ({ loadAuthMe }),
}));

vi.mock('@/hooks/shared/useSession', () => ({
  useSession: () => sessionState,
}));

describe('UserMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    act(() => {
      useSettingsModalStore.setState(useSettingsModalStore.getInitialState());
      useSettingsStore.setState({
        localWorkspaceName: 'Local Workspace',
        localWorkspaceAvatarColor: 'blue',
      });
    });
    sessionState.getKey.mockReturnValue(null);
    sessionState.getUser.mockReturnValue(null);
  });

  it('shows a local workspace menu when auth is disabled', async () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_DISABLED', 'true');

    render(<UserMenu collapsed={false} />);

    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Local Workspace' }));

    expect(await screen.findByText('Profile')).toBeTruthy();
    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.queryByText('Sign Out')).toBeNull();
    expect(loadAuthMe).not.toHaveBeenCalled();
  });

  it('reflects the edited local workspace name in the menu trigger', async () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_DISABLED', 'true');
    act(() => {
      useSettingsStore.getState().setLocalWorkspaceName('Meaning Studio');
    });

    render(<UserMenu collapsed={false} />);

    expect(await screen.findByRole('button', { name: 'Meaning Studio' })).toBeInTheDocument();
  });

  it('opens the profile tab from the local workspace menu', async () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_DISABLED', 'true');

    render(<UserMenu collapsed={false} />);

    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Local Workspace' }));
    fireEvent.click(await screen.findByText('Profile'));

    expect(useSettingsModalStore.getState().isOpen).toBe(true);
    expect(useSettingsModalStore.getState().activeTab).toBe('profile');
  });

  it('opens the preferences tab from the local workspace menu', async () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_DISABLED', 'true');

    render(<UserMenu collapsed={false} />);

    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Local Workspace' }));
    fireEvent.click(await screen.findByText('Settings'));

    expect(useSettingsModalStore.getState().isOpen).toBe(true);
    expect(useSettingsModalStore.getState().activeTab).toBe('preferences');
  });

  it('opens upward in expanded mode instead of popping out to the right', async () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_DISABLED', 'true');

    render(<UserMenu collapsed={false} />);

    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Local Workspace' }));

    const menu = await screen.findByRole('menu');
    expect(menu.dataset.side).toBe('top');
    expect(menu.dataset.align).toBe('start');
  });

  it('stays hidden when auth is enabled and no session exists', async () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_DISABLED', 'false');

    const { container } = render(<UserMenu collapsed={false} />);

    await waitFor(() => expect(container.firstChild).toBeNull());
  });
});
