// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileSettingsPanel } from '@/components/settings/ProfileSettingsPanel';

const loadAuthMeMock = vi.fn();
const updateAuthMeMock = vi.fn();
const sessionMock = {
  getUser: vi.fn(),
  setUser: vi.fn(),
};

vi.mock('@/hooks/shared/useAuthMe', () => ({
  useAuthMe: () => ({
    loadAuthMe: loadAuthMeMock,
    updateAuthMe: updateAuthMeMock,
  }),
}));

vi.mock('@/hooks/shared/useSession', () => ({
  useSession: () => sessionMock,
}));

describe('ProfileSettingsPanel', () => {
  beforeEach(() => {
    loadAuthMeMock.mockReset();
    loadAuthMeMock.mockResolvedValue({
      id: 'user_123',
      name: 'Jane Doe',
      username: 'janedoe',
      avatar_url: 'https://example.com/avatar.png',
    });

    updateAuthMeMock.mockReset();
    updateAuthMeMock.mockResolvedValue({
      id: 'user_123',
      name: 'Jane Updated',
      username: 'janedoe',
      avatar_url: 'https://example.com/new-avatar.png',
    });

    sessionMock.getUser.mockReset();
    sessionMock.getUser.mockReturnValue({
      id: 'user_123',
      name: 'Jane Doe',
      username: 'janedoe',
      avatar_url: 'https://example.com/avatar.png',
    });
    sessionMock.setUser.mockReset();
  });

  it('renders editable profile fields while keeping username read-only', async () => {
    render(<ProfileSettingsPanel />);

    expect(screen.getByRole('heading', { name: 'Profile' })).not.toBeNull();

    const nameInput = screen.getByLabelText('Display name') as HTMLInputElement;
    const avatarInput = screen.getByLabelText('Avatar URL') as HTMLInputElement;
    const usernameInput = screen.getByLabelText('Username') as HTMLInputElement;

    expect(nameInput.value).toBe('Jane Doe');
    expect(avatarInput.value).toBe('https://example.com/avatar.png');
    expect(usernameInput.value).toBe('janedoe');
    expect(usernameInput.readOnly).toBe(true);

    await waitFor(() => {
      expect(loadAuthMeMock).toHaveBeenCalledTimes(1);
    });
  });

  it('saves edited profile details and updates the cached session user', async () => {
    render(<ProfileSettingsPanel />);

    const nameInput = screen.getByLabelText('Display name');
    const avatarInput = screen.getByLabelText('Avatar URL');
    const saveButton = screen.getByRole('button', { name: 'Save changes' }) as HTMLButtonElement;

    expect(saveButton.disabled).toBe(true);

    fireEvent.change(nameInput, { target: { value: 'Jane Updated' } });
    fireEvent.change(avatarInput, { target: { value: 'https://example.com/new-avatar.png' } });

    expect(saveButton.disabled).toBe(false);

    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(updateAuthMeMock).toHaveBeenCalledWith({
        name: 'Jane Updated',
        avatar_url: 'https://example.com/new-avatar.png',
      });
    });

    await waitFor(() => {
      expect(sessionMock.setUser).toHaveBeenCalledWith({
        id: 'user_123',
        name: 'Jane Updated',
        username: 'janedoe',
        avatar_url: 'https://example.com/new-avatar.png',
      });
    });
  });
});
