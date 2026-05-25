// @vitest-environment jsdom

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createConversationMock = vi.fn();
const getConversationMemoryMock = vi.fn();
const chatMock = vi.fn();
const chatStreamMock = vi.fn();
const createTurnMock = vi.fn();
const updateConversationMock = vi.fn();
const setInputMock = vi.fn();
const setMessagesMock = vi.fn();
const setIsChatLoadingMock = vi.fn();
const setIsChatStreamingMock = vi.fn();
const setErrorMock = vi.fn();
const setWarningMock = vi.fn();
const showWarningMock = vi.fn();

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
    setIsChatLoading: setIsChatLoadingMock,
    hasMore: false,
    isLoadingMore: false,
    loadMore: vi.fn(),
  }),
}));

vi.mock('@/hooks/conversations/useChatStreamState', () => ({
  useChatStreamState: () => ({
    isChatStreaming: false,
    setIsChatStreaming: setIsChatStreamingMock,
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
    setError: setErrorMock,
    setWarning: setWarningMock,
    showWarning: showWarningMock,
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
  chat: (...args: unknown[]) => chatMock(...args),
  chatStream: (...args: unknown[]) => chatStreamMock(...args),
  createTurn: (...args: unknown[]) => createTurnMock(...args),
  updateConversation: (...args: unknown[]) => updateConversationMock(...args),
}));

import { syncSavedTurnIntoWorkspace } from '@/hooks/conversations/syncSavedTurnIntoWorkspace';
import { useConversationChat } from '@/hooks/conversations/useConversationChat';
import { useTemporaryChatsStore } from '@/store/temporaryChatsStore';

async function* emptyChatStream() {
  yield { type: 'done', content: 'assistant response' };
}

async function* abortedChatStream() {
  yield { type: 'token', content: 'partial assistant response' };
  throw new DOMException('The operation was aborted.', 'AbortError');
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

describe('useConversationChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTemporaryChatsStore.setState({ chats: [] });
    createConversationMock.mockResolvedValue({ conversation_id: 'conv_child' });
    getConversationMemoryMock.mockResolvedValue({ text: '' });
    chatMock.mockResolvedValue({ content: 'Chestnut meal plan' });
    chatStreamMock.mockReturnValue(emptyChatStream());
    createTurnMock.mockResolvedValue({ turn_hash: 'sha256:turn' });
    updateConversationMock.mockResolvedValue({
      conversation_id: 'conv_existing',
      title: 'Chestnut meal plan',
    });
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

  it('generates new conversation titles from the first user message when no title is supplied', async () => {
    const { result } = renderHook(() =>
      useConversationChat({
        projectId: 'proj_1',
        conversationId: undefined,
        provider: 'openai',
        model: 'gpt-5.4',
      })
    );

    result.current.sendMessage('I want to eat chestnuts.');

    await waitFor(() => {
      expect(createConversationMock).toHaveBeenCalledWith(
        'proj_1',
        'I want to eat chestnuts.',
        undefined
      );
    });
    await waitFor(() => {
      expect(chatMock).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'user', content: 'I want to eat chestnuts.' }),
          ]),
          provider: 'openai',
          model: 'gpt-5.4',
        })
      );
      expect(updateConversationMock).toHaveBeenCalledWith('conv_child', {
        title: 'Chestnut meal plan',
      });
    });
  });

  it('renames placeholder conversations with a generated title after the first saved user turn', async () => {
    const { result } = renderHook(() =>
      useConversationChat({
        projectId: 'proj_1',
        conversationId: 'conv_existing',
        title: 'New Chat',
        provider: 'openai',
        model: 'gpt-5.4',
      })
    );

    result.current.sendMessage('I want to eat chestnuts.');

    await waitFor(() => {
      expect(updateConversationMock).toHaveBeenCalledWith('conv_existing', {
        title: 'Chestnut meal plan',
      });
    });
  });

  it('renames temporary placeholder chats from the first user message', async () => {
    useTemporaryChatsStore.setState({
      chats: [
        {
          id: 'temp_existing',
          title: 'Temporary chat',
          createdAt: '2026-05-25T00:00:00.000Z',
          updatedAt: '2026-05-25T00:00:00.000Z',
          messages: [],
        },
      ],
    });

    const { result } = renderHook(() =>
      useConversationChat({
        projectId: '',
        conversationId: 'temp_existing',
        title: 'Temporary chat',
        provider: 'openai',
        model: 'gpt-5.4',
      })
    );

    result.current.sendMessage('I want to eat chestnuts.');

    await waitFor(() => {
      expect(useTemporaryChatsStore.getState().chats[0]?.title).toBe('Chestnut meal plan');
    });
    expect(updateConversationMock).not.toHaveBeenCalled();
  });

  it('falls back to a derived title when title generation fails', async () => {
    chatMock.mockRejectedValueOnce(new Error('title model unavailable'));

    const { result } = renderHook(() =>
      useConversationChat({
        projectId: 'proj_1',
        conversationId: 'conv_existing',
        title: 'New Chat',
        provider: 'openai',
        model: 'gpt-5.4',
      })
    );

    result.current.sendMessage('I want to eat chestnuts.');

    await waitFor(() => {
      expect(updateConversationMock).toHaveBeenCalledWith('conv_existing', {
        title: 'I want to eat chestnuts.',
      });
    });
  });

  it('does not rename conversations with custom titles', async () => {
    const { result } = renderHook(() =>
      useConversationChat({
        projectId: 'proj_1',
        conversationId: 'conv_existing',
        title: 'Meal planning',
        provider: 'openai',
        model: 'gpt-5.4',
      })
    );

    result.current.sendMessage('I want to eat chestnuts.');

    await waitFor(() => {
      expect(createTurnMock).toHaveBeenCalled();
    });
    expect(updateConversationMock).not.toHaveBeenCalled();
  });

  it('mirrors saved user and assistant turns into the workspace with roles', async () => {
    createTurnMock
      .mockResolvedValueOnce({ turn_hash: 'sha256:user_turn' })
      .mockResolvedValueOnce({ turn_hash: 'sha256:assistant_turn' });

    const { result } = renderHook(() =>
      useConversationChat({
        projectId: 'proj_1',
        conversationId: 'conv_existing',
        title: 'Meal planning',
        provider: 'openai',
        model: 'gpt-5.4',
      })
    );

    result.current.sendMessage('I want to eat chestnuts.');

    await waitFor(() => {
      expect(syncSavedTurnIntoWorkspace).toHaveBeenCalledWith('conv_existing', {
        turn_hash: 'sha256:user_turn',
        role: 'user',
        content: 'I want to eat chestnuts.',
      });
    });
    expect(syncSavedTurnIntoWorkspace).toHaveBeenCalledWith('conv_existing', {
      turn_hash: 'sha256:assistant_turn',
      role: 'assistant',
      content: 'assistant response',
    });
  });

  it('saves the user turn before starting the assistant stream', async () => {
    const events: string[] = [];
    createTurnMock.mockImplementation(async (_projectId, _conversationId, role) => {
      events.push(`turn:${role}`);
      return { turn_hash: `sha256:${role}_turn` };
    });
    chatStreamMock.mockImplementation(() => {
      events.push('stream:start');
      return emptyChatStream();
    });

    const { result } = renderHook(() =>
      useConversationChat({
        projectId: 'proj_1',
        conversationId: 'conv_existing',
        title: 'Meal planning',
        provider: 'openai',
        model: 'gpt-5.4',
      })
    );

    result.current.sendMessage('I want to eat chestnuts.');

    await waitFor(() => {
      expect(events).toContain('turn:user');
      expect(events).toContain('stream:start');
    });
    expect(events.indexOf('turn:user')).toBeLessThan(events.indexOf('stream:start'));
  });

  it('does not duplicate the saved user turn when assistant turn persistence fails', async () => {
    createTurnMock
      .mockResolvedValueOnce({ turn_hash: 'sha256:user_turn' })
      .mockRejectedValueOnce(new Error('assistant save failed'))
      .mockRejectedValueOnce(new Error('assistant save failed again'));

    const { result } = renderHook(() =>
      useConversationChat({
        projectId: 'proj_1',
        conversationId: 'conv_existing',
        title: 'Meal planning',
        provider: 'openai',
        model: 'gpt-5.4',
      })
    );

    result.current.sendMessage('I want to eat chestnuts.');

    await waitFor(() => {
      expect(showWarningMock).toHaveBeenCalledWith(
        'Assistant reply not saved — API may be unavailable'
      );
    });

    const savedRoles = createTurnMock.mock.calls.map((call) => call[2]);
    expect(savedRoles).toEqual(['user', 'assistant', 'assistant']);
    expect(syncSavedTurnIntoWorkspace).toHaveBeenCalledWith('conv_existing', {
      turn_hash: 'sha256:user_turn',
      role: 'user',
      content: 'I want to eat chestnuts.',
    });
    expect(syncSavedTurnIntoWorkspace).not.toHaveBeenCalledWith(
      'conv_existing',
      expect.objectContaining({ role: 'assistant' })
    );
  });

  it('keeps streaming active until the assistant turn is persisted', async () => {
    const assistantSave = deferred<{ turn_hash: string }>();
    createTurnMock
      .mockResolvedValueOnce({ turn_hash: 'sha256:user_turn' })
      .mockReturnValueOnce(assistantSave.promise);

    const { result } = renderHook(() =>
      useConversationChat({
        projectId: 'proj_1',
        conversationId: 'conv_existing',
        title: 'Meal planning',
        provider: 'openai',
        model: 'gpt-5.4',
      })
    );

    result.current.sendMessage('I want to eat chestnuts.');

    await waitFor(() => {
      expect(createTurnMock).toHaveBeenCalledWith(
        'proj_1',
        'conv_existing',
        'assistant',
        'assistant response'
      );
    });
    expect(setIsChatStreamingMock).not.toHaveBeenCalledWith(false);

    assistantSave.resolve({ turn_hash: 'sha256:assistant_turn' });

    await waitFor(() => {
      expect(setIsChatStreamingMock).toHaveBeenCalledWith(false);
    });
  });

  it('persists the visible partial assistant reply when generation is aborted', async () => {
    chatStreamMock.mockReturnValue(abortedChatStream());
    createTurnMock
      .mockResolvedValueOnce({ turn_hash: 'sha256:user_turn' })
      .mockResolvedValueOnce({ turn_hash: 'sha256:assistant_partial_turn' });

    const { result } = renderHook(() =>
      useConversationChat({
        projectId: 'proj_1',
        conversationId: 'conv_existing',
        title: 'Meal planning',
        provider: 'openai',
        model: 'gpt-5.4',
      })
    );

    result.current.sendMessage('I want to eat chestnuts.');

    await waitFor(() => {
      expect(syncSavedTurnIntoWorkspace).toHaveBeenCalledWith('conv_existing', {
        turn_hash: 'sha256:assistant_partial_turn',
        role: 'assistant',
        content: 'partial assistant response',
      });
    });
    expect(createTurnMock.mock.calls.map((call) => call[2])).toEqual(['user', 'assistant']);
  });
});
