// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { useChatModelPreferencesStore } from '@/store/chatModelPreferencesStore';

beforeEach(() => {
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
