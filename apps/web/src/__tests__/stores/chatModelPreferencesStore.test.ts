// @vitest-environment jsdom
//
// Node.js 25+ ships a native `localStorage` stub whose `setItem` is undefined
// unless `--localstorage-file` is given a valid path. jsdom doesn't override
// it, so we polyfill before the Zustand persist middleware captures a ref.
// (Same pattern as settingsStore.test.ts.)

import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import { useChatModelPreferencesStore } from '@/store/chatModelPreferencesStore';

beforeEach(() => {
  globalThis.localStorage.clear();
  useChatModelPreferencesStore.setState({
    selectedProvider: null,
    selectedModel: null,
    hydrated: true,
  });
});

describe('chatModelPreferencesStore', () => {
  it('stores the selected provider and model in memory', () => {
    useChatModelPreferencesStore.getState().setSelection('openai', 'gpt-4.1');

    expect(useChatModelPreferencesStore.getState().selectedProvider).toBe('openai');
    expect(useChatModelPreferencesStore.getState().selectedModel).toBe('gpt-4.1');
  });

  it('clears the session selection', () => {
    useChatModelPreferencesStore.setState({
      selectedProvider: 'google',
      selectedModel: 'gemini-2.5-flash',
      hydrated: true,
    });

    useChatModelPreferencesStore.getState().clearSelection();

    expect(useChatModelPreferencesStore.getState().selectedProvider).toBeNull();
    expect(useChatModelPreferencesStore.getState().selectedModel).toBeNull();
    expect(useChatModelPreferencesStore.getState().hydrated).toBe(true);
  });
});
