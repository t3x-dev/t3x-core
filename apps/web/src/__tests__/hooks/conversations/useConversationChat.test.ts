// @vitest-environment jsdom

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createConversationMock = vi.fn();
const getConversationMemoryMock = vi.fn();
const chatStreamMock = vi.fn();
const createTurnMock = vi.fn();
const setInputMock = vi.fn();
const setMessagesMock = vi.fn();

vi.mock('@/hooks/conversations/syncSavedTurnIntoWorkspace', () => ({
  syncSavedTurnIntoWorkspace: vi.fn(),
}));

vi.mock('@/hooks/conversations/useChatHistory', () => ({
  useChatHistory: () => ({
    messages: [],
    messagesRef: { current: [] },
    input: '',
    setInput: setInputMock,
    setMessages: setMessagesMock,
    isChatLoading: false,
    hasMore: false,
    isLoadingMore: false,
    loadMore: vi.fn(),
  }),
}));

vi.mock('@/hooks/conversations/useChatStreamState', () => ({
  useChatStreamState: () => ({
    isChatStreaming: false,
    setIsChatStreaming: vi.fn(),
    streamingContent: '',
    setStreamingContent: vi.fn(),
    setSearchQuery: vi.fn(),
    setCitations: vi.fn(),
    setThinkingContent: vi.fn(),
    setIsThinking: vi.fn(),
    tokenBufferRef: { current: '' },
    rafIdRef: { current: null },
    abortControllerRef: { current: null },
    searchQuery: null,
    citations: [],
    thinkingContent: '',
    isThinking: false,
    stopGenerating: vi.fn(),
  }),
}));

vi.mock('@/hooks/conversations/useChatWarnings', () => ({
  useChatWarnings: () => ({
    error: null,
    warning: null,
    setError: vi.fn(),
    setWarning: vi.fn(),
    showWarning: vi.fn(),
  }),
}));

vi.mock('@/store/chatSessionStore', () => ({
  useChatSessionStore: (
    selector: (state: { webSearchEnabled: boolean; thinkingEnabled: boolean }) => unknown
  ) => selector({ webSearchEnabled: false, thinkingEnabled: false }),
}));

vi.mock('@/infrastructure', () => ({
  createConversation: (...args: unknown[]) => createConversationMock(...args),
  getConversationMemory: (...args: unknown[]) => getConversationMemoryMock(...args),
  chatStream: (...args: unknown[]) => chatStreamMock(...args),
  createTurn: (...args: unknown[]) => createTurnMock(...args),
}));

import { useConversationChat } from '@/hooks/conversations/useConversationChat';

async function* emptyChatStream() {
  yield { type: 'done', content: 'assistant response' };
}

describe('useConversationChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createConversationMock.mockResolvedValue({ conversation_id: 'conv_child' });
    getConversationMemoryMock.mockResolvedValue({ text: '' });
    chatStreamMock.mockReturnValue(emptyChatStream());
    createTurnMock.mockResolvedValue({ turn_hash: 'sha256:turn' });
  });

  it('creates new child conversations with the inherited parent commit hash', async () => {
    const { result } = renderHook(() =>
      useConversationChat({
        projectId: 'proj_1',
        conversationId: undefined,
        title: 'Child conversation',
        provider: 'openai',
        model: 'gpt-5.4',
        parentCommitHash: 'sha256:parent_commit',
      })
    );

    result.current.sendMessage('continue from here');

    await waitFor(() => {
      expect(createConversationMock).toHaveBeenCalledWith(
        'proj_1',
        'Child conversation',
        'sha256:parent_commit'
      );
    });
  });
});
