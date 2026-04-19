// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserMenu } from '@/components/layout/UserMenu';
import { useSettingsModalStore } from '@/store/settingsModalStore';

const loadAuthMeMock = vi.fn();
const sessionMock = {
  getKey: vi.fn(),
  getUser: vi.fn(),
  setUser: vi.fn(),
  clear: vi.fn(),
};

vi.mock('@/hooks/shared/useAuthMe', () => ({
  useAuthMe: () => ({
    loadAuthMe: loadAuthMeMock,
  }),
}));

vi.mock('@/hooks/shared/useSession', () => ({
  useSession: () => sessionMock,
}));

describe('UserMenu', () => {
  beforeEach(() => {
    loadAuthMeMock.mockReset();
    loadAuthMeMock.mockResolvedValue({
      id: 'user_123',
      name: 'Jane Doe',
      username: 'janedoe',
      avatar_url: null,
    });

    sessionMock.getKey.mockReset();
    sessionMock.getKey.mockReturnValue('session-key');
    sessionMock.getUser.mockReset();
    sessionMock.getUser.mockReturnValue({
      id: 'user_123',
      name: 'Jane Doe',
      username: 'janedoe',
      avatar_url: null,
    });
    sessionMock.setUser.mockReset();
    sessionMock.clear.mockReset();

    useSettingsModalStore.setState({
      isOpen: false,
      selectedTab: 'profile',
    });
  });

  async function openUserMenu() {
    render(<UserMenu collapsed={false} />);

    const triggerLabel = await screen.findByText('Jane Doe');
    const trigger = triggerLabel.closest('button');
    expect(trigger).not.toBeNull();
    fireEvent.pointerDown(trigger, { button: 0 });

    await screen.findByRole('menuitem', { name: 'Profile' });
  }

  it('shows only the approved account actions', async () => {
    await openUserMenu();

    expect(screen.getByRole('menuitem', { name: 'Profile' })).not.toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Settings' })).not.toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Sign Out' })).not.toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'My Projects' })).toBeNull();
  });

  it('opens the global settings modal with the requested initial tab', async () => {
    await openUserMenu();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Profile' }));

    await waitFor(() => {
      expect(useSettingsModalStore.getState().isOpen).toBe(true);
    });
    expect(useSettingsModalStore.getState().selectedTab).toBe('profile');

    useSettingsModalStore.getState().close();

    const triggerLabel = screen.getByText('Jane Doe');
    const trigger = triggerLabel.closest('button');
    expect(trigger).not.toBeNull();
    fireEvent.pointerDown(trigger, { button: 0 });
    await screen.findByRole('menuitem', { name: 'Settings' });

    fireEvent.click(screen.getByRole('menuitem', { name: 'Settings' }));

    await waitFor(() => {
      expect(useSettingsModalStore.getState().isOpen).toBe(true);
    });
    expect(useSettingsModalStore.getState().selectedTab).toBe('preferences');
  });

  it('reacts to session user updates so the visible profile stays current', async () => {
    let currentUser = {
      id: 'user_123',
      name: 'Jane Doe',
      username: 'janedoe',
      avatar_url: null,
    };

    sessionMock.getUser.mockImplementation(() => currentUser);

    render(<UserMenu collapsed={false} />);

    await screen.findByText('Jane Doe');

    currentUser = {
      ...currentUser,
      name: 'Jane Updated',
      avatar_url: 'https://example.com/new-avatar.png',
    };

    fireEvent(window, new Event('t3x-session-user-changed'));

    await waitFor(() => {
      expect(screen.getByText('Jane Updated')).not.toBeNull();
    });

    const avatar = screen.getByRole('img', { name: 'Jane Updated' }) as HTMLImageElement;
    expect(avatar.getAttribute('src')).toBe('https://example.com/new-avatar.png');
  });

  it('still renders a global settings entry when auth is disabled', async () => {
    sessionMock.getKey.mockReturnValue(null);
    sessionMock.getUser.mockReturnValue(null);

    render(<UserMenu collapsed={false} />);

    const trigger = await screen.findByRole('button', { name: /local workspace/i });
    fireEvent.pointerDown(trigger, { button: 0 });

    expect(screen.getByRole('menuitem', { name: 'Profile' })).not.toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Settings' })).not.toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Sign Out' })).toBeNull();
  });
});
