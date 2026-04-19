// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

// Node.js 25+ ships a broken localStorage stub in test environments unless
// a valid --localstorage-file path is set. Mirror the existing test polyfill
// pattern so workspace persistence helpers can run reliably.
if (
  typeof globalThis.localStorage !== 'object' ||
  typeof globalThis.localStorage.setItem !== 'function'
) {
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
}

import {
  readPersistedWorkspacePanelExpanded,
  WORKSPACE_PANEL_EXPANDED_STORAGE_KEY,
  writePersistedWorkspacePanelExpanded,
} from '@/store/workspaceStore';

describe('workspace panel persistence', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('defaults to collapsed when no preference is stored', () => {
    expect(readPersistedWorkspacePanelExpanded()).toBe(false);
  });

  it('round-trips the persisted expanded state', () => {
    writePersistedWorkspacePanelExpanded(true);
    expect(window.localStorage.getItem(WORKSPACE_PANEL_EXPANDED_STORAGE_KEY)).toBe('true');
    expect(readPersistedWorkspacePanelExpanded()).toBe(true);

    writePersistedWorkspacePanelExpanded(false);
    expect(window.localStorage.getItem(WORKSPACE_PANEL_EXPANDED_STORAGE_KEY)).toBe('false');
    expect(readPersistedWorkspacePanelExpanded()).toBe(false);
  });
});
