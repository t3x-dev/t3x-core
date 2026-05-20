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
    const { result } = renderHook(() => useCommandRegistry({ projectId: 'proj_1' }));

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
    const { result } = renderHook(() => useCommandRegistry({ projectId: 'proj_1' }));
    const projectCommand = result.current
      .flatMap((group) => group.commands)
      .find((command) => command.id === 'go-project-canvas');

    act(() => {
      projectCommand?.run();
    });

    expect(pushMock).toHaveBeenCalledWith('/project/proj_1');
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
