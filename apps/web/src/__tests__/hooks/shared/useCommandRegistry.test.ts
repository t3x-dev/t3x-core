// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

import {
  OPEN_KEYBOARD_SHORTCUTS_EVENT,
  useCommandRegistry,
} from '@/hooks/shared/useCommandRegistry';

describe('useCommandRegistry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns only executable commands and omits placeholder actions', () => {
    const { result } = renderHook(() =>
      useCommandRegistry({ repositoryPath: '/t3x-dev/example-project' })
    );

    const titles = result.current.flatMap((group) =>
      group.commands.map((command) => command.title)
    );
    expect(titles).toContain('Go to Project Canvas');
    expect(titles).toContain('Keyboard Shortcuts');
    expect(titles).not.toContain('Create Branch');
    expect(titles).not.toContain('Generate Summary');
    expect(result.current.flatMap((group) => group.commands)).toEqual(
      expect.arrayContaining([expect.objectContaining({ run: expect.any(Function) })])
    );
  });

  it('routes navigation commands through the router', () => {
    const { result } = renderHook(() =>
      useCommandRegistry({ repositoryPath: '/t3x-dev/example-project' })
    );
    const projectCommand = result.current
      .flatMap((group) => group.commands)
      .find((command) => command.id === 'go-project-canvas');

    act(() => {
      projectCommand?.run();
    });

    expect(pushMock).toHaveBeenCalledWith('/t3x-dev/example-project');
  });

  it('opens repository workspaces without entering the legacy chat route', () => {
    const { result } = renderHook(() =>
      useCommandRegistry({ repositoryPath: '/t3x-dev/example-project' })
    );
    const workspaceCommand = result.current
      .flatMap((group) => group.commands)
      .find((command) => command.id === 'open-workspaces');

    act(() => {
      workspaceCommand?.run();
    });

    expect(pushMock).toHaveBeenCalledWith('/t3x-dev/example-project/workspaces');
    expect(pushMock).not.toHaveBeenCalledWith(expect.stringMatching(/^\/chat(?:\/|\?|$)/));
  });

  it('dispatches a typed event for keyboard shortcut help', () => {
    const listener = vi.fn();
    document.addEventListener(OPEN_KEYBOARD_SHORTCUTS_EVENT, listener);
    const { result } = renderHook(() => useCommandRegistry({}));
    const shortcutCommand = result.current
      .flatMap((group) => group.commands)
      .find((command) => command.id === 'keyboard-shortcuts');

    act(() => {
      shortcutCommand?.run();
    });

    expect(listener).toHaveBeenCalledTimes(1);
    document.removeEventListener(OPEN_KEYBOARD_SHORTCUTS_EVENT, listener);
  });
});
