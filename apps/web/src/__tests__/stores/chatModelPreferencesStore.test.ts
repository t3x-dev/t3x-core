// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  useChatModelPreferencesStore.setState({
    selectedProvider: null,
    selectedModel: null,
    hydrated: false,
  });
  localStorage.removeItem('t3x-chat-model-preferences');
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('chatModelPreferencesStore', () => {
  it('persists the selected provider and model', () => {
    useChatModelPreferencesStore.getState().setSelection('openai', 'gpt-4.1');

    const raw = localStorage.getItem('t3x-chat-model-preferences');
    expect(raw).not.toBeNull();

    const persisted = JSON.parse(raw!);
    expect(persisted.state.selectedProvider).toBe('openai');
    expect(persisted.state.selectedModel).toBe('gpt-4.1');
  });

  it('rehydrates the persisted selection', async () => {
    localStorage.setItem(
      't3x-chat-model-preferences',
      JSON.stringify({
        state: {
          selectedProvider: 'google',
          selectedModel: 'gemini-2.5-flash',
        },
        version: 0,
      })
    );

    await useChatModelPreferencesStore.persist.rehydrate();

    expect(useChatModelPreferencesStore.getState().selectedProvider).toBe('google');
    expect(useChatModelPreferencesStore.getState().selectedModel).toBe('gemini-2.5-flash');
    expect(useChatModelPreferencesStore.getState().hydrated).toBe(true);
  });
});
