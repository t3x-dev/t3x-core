/**
 * Chat Session Store Tests
 *
 * Tests for toggle states (web search, extended thinking)
 */

import { afterEach, describe, expect, it } from 'vitest';
import { useChatSessionStore } from '@/store/chatSessionStore';

const resetStore = () => {
  useChatSessionStore.setState({
    webSearchEnabled: false,
    thinkingEnabled: false,
  });
};

describe('Chat Session Store', () => {
  afterEach(resetStore);

  it('starts with both toggles off', () => {
    const state = useChatSessionStore.getState();
    expect(state.webSearchEnabled).toBe(false);
    expect(state.thinkingEnabled).toBe(false);
  });

  it('toggles web search on and off', () => {
    const { toggleWebSearch } = useChatSessionStore.getState();

    toggleWebSearch();
    expect(useChatSessionStore.getState().webSearchEnabled).toBe(true);

    toggleWebSearch();
    expect(useChatSessionStore.getState().webSearchEnabled).toBe(false);
  });

  it('toggles thinking on and off', () => {
    const { toggleThinking } = useChatSessionStore.getState();

    toggleThinking();
    expect(useChatSessionStore.getState().thinkingEnabled).toBe(true);

    toggleThinking();
    expect(useChatSessionStore.getState().thinkingEnabled).toBe(false);
  });

  it('toggles independently', () => {
    const { toggleWebSearch, toggleThinking } = useChatSessionStore.getState();

    toggleWebSearch();
    expect(useChatSessionStore.getState().webSearchEnabled).toBe(true);
    expect(useChatSessionStore.getState().thinkingEnabled).toBe(false);

    toggleThinking();
    expect(useChatSessionStore.getState().webSearchEnabled).toBe(true);
    expect(useChatSessionStore.getState().thinkingEnabled).toBe(true);

    toggleWebSearch();
    expect(useChatSessionStore.getState().webSearchEnabled).toBe(false);
    expect(useChatSessionStore.getState().thinkingEnabled).toBe(true);
  });
});
