// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useScriptExecution } from '@/hooks/drafts/useScriptExecution';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { cleanupRoots, renderHook, waitForHook } from './renderHook';

describe('useScriptExecution', () => {
  beforeEach(() => {
    const storage = (() => {
      const store = new Map<string, string>();
      return {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        clear: () => {
          store.clear();
        },
      };
    })();

    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: storage,
    });
    useWorkspaceStore.getState().reset();
  });

  afterEach(() => {
    cleanupRoots();
  });

  it('syncs an empty ops log to explicit empty yops when the script is clean', async () => {
    useWorkspaceStore.getState().setScriptText('stale script');
    useWorkspaceStore.getState().setScriptDirty(false);

    const { unmount } = renderHook(() => useScriptExecution());
    await waitForHook();

    expect(useWorkspaceStore.getState().scriptText).toBe('yops: []\n');
    unmount();
  });

  it('does not overwrite manual edits when the script is dirty', async () => {
    useWorkspaceStore.getState().setScriptText('manual change');
    useWorkspaceStore.getState().setScriptDirty(true);

    const { unmount } = renderHook(() => useScriptExecution());
    await waitForHook();

    expect(useWorkspaceStore.getState().scriptText).toBe('manual change');
    unmount();
  });
});
