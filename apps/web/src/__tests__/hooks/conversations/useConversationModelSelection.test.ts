// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useConversationModelSelection } from '@/hooks/conversations/useConversationModelSelection';

const { fetchConversationMeta, updateConversation, localStorageMock } = vi.hoisted(() => {
  const storage = new Map<string, string>();

  return {
    fetchConversationMeta: vi.fn(),
    updateConversation: vi.fn(),
    localStorageMock: {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        storage.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        storage.delete(key);
      }),
      clear: vi.fn(() => {
        storage.clear();
      }),
    },
  };
});

vi.mock('@/queries/chatInitFetch', () => ({
  fetchConversationMeta,
}));

vi.mock('@/commands/conversations/updateConversation', () => ({
  updateConversation,
}));

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  configurable: true,
});

describe('useConversationModelSelection', () => {
  afterEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('hydrates the saved provider and model from the conversation', async () => {
    fetchConversationMeta.mockResolvedValue({
      conversation_id: 'conv_123',
      provider: 'openai',
      model: 'gpt-5.4-mini',
    });

    const { result } = renderHook(() =>
      useConversationModelSelection({
        conversationId: 'conv_123',
        initialProvider: 'anthropic',
        initialModel: 'claude-sonnet-4-6',
      })
    );

    await waitFor(() => {
      expect(result.current.selectedProvider).toBe('openai');
      expect(result.current.selectedModel).toBe('gpt-5.4-mini');
    });
  });

  it('persists user model changes for an existing conversation', async () => {
    fetchConversationMeta.mockResolvedValue({
      conversation_id: 'conv_123',
      provider: null,
      model: null,
    });

    const { result } = renderHook(() =>
      useConversationModelSelection({
        conversationId: 'conv_123',
      })
    );

    await waitFor(() => {
      expect(fetchConversationMeta).toHaveBeenCalledWith('conv_123');
    });

    act(() => {
      result.current.handleModelChange('openai', 'gpt-5.4-mini');
    });

    await waitFor(() => {
      expect(updateConversation).toHaveBeenCalledWith('conv_123', {
        provider: 'openai',
        model: 'gpt-5.4-mini',
      });
    });
  });

  it('persists the initial selection once a new conversation id is resolved', async () => {
    fetchConversationMeta.mockResolvedValue({
      conversation_id: 'conv_456',
      provider: null,
      model: null,
    });

    const { rerender } = renderHook(
      ({ conversationId }) =>
        useConversationModelSelection({
          conversationId,
          initialProvider: 'openai',
          initialModel: 'gpt-5.4-nano',
        }),
      {
        initialProps: { conversationId: 'new' },
      }
    );

    rerender({ conversationId: 'conv_456' });

    await waitFor(() => {
      expect(updateConversation).toHaveBeenCalledWith('conv_456', {
        provider: 'openai',
        model: 'gpt-5.4-nano',
      });
    });
  });

  it('restores the locally cached selection after refresh when server metadata is still empty', async () => {
    fetchConversationMeta.mockResolvedValue({
      conversation_id: 'conv_123',
      provider: null,
      model: null,
    });

    const { result, unmount } = renderHook(() =>
      useConversationModelSelection({
        conversationId: 'conv_123',
      })
    );

    await waitFor(() => {
      expect(fetchConversationMeta).toHaveBeenCalledWith('conv_123');
    });

    act(() => {
      result.current.handleModelChange('google', 'gemini-3-pro-preview');
    });

    await waitFor(() => {
      expect(updateConversation).toHaveBeenCalledWith('conv_123', {
        provider: 'google',
        model: 'gemini-3-pro-preview',
      });
    });

    unmount();
    vi.clearAllMocks();

    fetchConversationMeta.mockResolvedValue({
      conversation_id: 'conv_123',
      provider: null,
      model: null,
    });

    const { result: remountedResult } = renderHook(() =>
      useConversationModelSelection({
        conversationId: 'conv_123',
      })
    );

    await waitFor(() => {
      expect(remountedResult.current.selectedProvider).toBe('google');
      expect(remountedResult.current.selectedModel).toBe('gemini-3-pro-preview');
    });
  });

  it('prefers the saved server selection over a stale local cache', async () => {
    window.localStorage.setItem(
      't3x:conversation-model-selection:conv_123',
      JSON.stringify({
        provider: 'google',
        model: 'gemini-3-pro-preview',
      })
    );

    fetchConversationMeta.mockResolvedValue({
      conversation_id: 'conv_123',
      provider: 'openai',
      model: 'gpt-5.4-mini',
    });

    const { result } = renderHook(() =>
      useConversationModelSelection({
        conversationId: 'conv_123',
      })
    );

    await waitFor(() => {
      expect(result.current.selectedProvider).toBe('google');
      expect(result.current.selectedModel).toBe('gemini-3-pro-preview');
    });

    await waitFor(() => {
      expect(result.current.selectedProvider).toBe('openai');
      expect(result.current.selectedModel).toBe('gpt-5.4-mini');
    });
  });

  it('still converges to the cached selection before server metadata overrides it', async () => {
    window.localStorage.setItem(
      't3x:conversation-model-selection:conv_123',
      JSON.stringify({
        provider: 'google',
        model: 'gemini-3-pro-preview',
      })
    );

    fetchConversationMeta.mockResolvedValue({
      conversation_id: 'conv_123',
      provider: null,
      model: null,
    });

    const { result } = renderHook(() =>
      useConversationModelSelection({
        conversationId: 'conv_123',
        initialProvider: 'openai',
        initialModel: 'gpt-5.4-nano',
      })
    );

    await waitFor(() => {
      expect(result.current.selectedProvider).toBe('google');
      expect(result.current.selectedModel).toBe('gemini-3-pro-preview');
    });
  });
});
