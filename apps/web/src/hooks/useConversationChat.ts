import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '@/lib/api';

// Chat page size for pagination
const CHAT_PAGE_SIZE = 100;

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface UseConversationChatOptions {
  projectId: string;
  conversationId: string | undefined;
  title?: string;
  provider?: string;
  model?: string;
  onConversationCreated?: (conversationId: string) => void;
  onTurnsSaved?: () => void;
}

export interface UseConversationChatReturn {
  messages: ChatMessage[];
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  isStreaming: boolean;
  streamingContent: string;
  error: string | null;
  warning: string | null;
  hasMore: boolean;
  isLoadingMore: boolean;
  sendMessage: (messageOverride?: string) => void;
  loadMore: () => void;
  /** Incremented each time turns are persisted to the DB — use to trigger extraction */
  turnsSavedCounter: number;
}

export function useConversationChat({
  projectId,
  conversationId,
  title,
  provider,
  model,
  onConversationCreated,
  onTurnsSaved,
}: UseConversationChatOptions): UseConversationChatReturn {
  // ========== Chat state ==========
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatOffset, setChatOffset] = useState(0);
  const [chatHasMore, setChatHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isChatStreaming, setIsChatStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatWarning, setChatWarning] = useState<string | null>(null);
  const [turnsSavedCounter, setTurnsSavedCounter] = useState(0);
  const chatWarningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ========== Refs ==========
  const conversationIdRef = useRef(conversationId);
  const chatMessagesRef = useRef(chatMessages);
  const prevConversationIdRef = useRef<string | undefined>(undefined);
  const loadMoreAbortRef = useRef<AbortController | null>(null);

  // ========== Helpers ==========
  const showWarning = useCallback((msg: string) => {
    if (chatWarningTimerRef.current) clearTimeout(chatWarningTimerRef.current);
    setChatWarning(msg);
    chatWarningTimerRef.current = setTimeout(() => setChatWarning(null), 5000);
  }, []);

  // ========== Sync refs ==========
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    chatMessagesRef.current = chatMessages;
  }, [chatMessages]);

  // ========== Load chat history from backend ==========
  useEffect(() => {
    const abortController = new AbortController();
    const currentConversationId = conversationId;
    const prevConversationId = prevConversationIdRef.current;
    prevConversationIdRef.current = currentConversationId;

    const loadChatHistory = async () => {
      if (!projectId || !currentConversationId) return;

      // If conversationId just changed from undefined to a value and we already have messages,
      // this means we just created the conversation during an active chat session.
      // Don't reload - the messages are already in state.
      if (prevConversationId === undefined && chatMessagesRef.current.length > 0) {
        return;
      }

      // Cancel any pending loadMore request when switching conversations
      loadMoreAbortRef.current?.abort();
      loadMoreAbortRef.current = null;

      // Clear old messages and reset pagination state
      setChatMessages([]);
      setChatOffset(0);
      setChatHasMore(false);
      setIsChatLoading(true);
      try {
        // Fetch newest CHAT_PAGE_SIZE messages first (order=desc), then reverse for display
        const response = await api.listTurns(projectId, currentConversationId, CHAT_PAGE_SIZE, 0, {
          signal: abortController.signal,
          order: 'desc',
        });

        // Check if conversation changed during request (race condition fix)
        if (abortController.signal.aborted) {
          return;
        }

        // Reverse the array since we fetched newest first (order=desc)
        // but need to display oldest first in the chat UI
        const messages = response.turns
          .filter((turn) => turn.role === 'user' || turn.role === 'assistant')
          .map((turn) => ({
            id: turn.turn_hash,
            role: turn.role as 'user' | 'assistant',
            content: turn.content,
          }))
          .reverse();
        setChatMessages(messages);

        // Check if there are more messages to load
        setChatHasMore(response.turns.length >= CHAT_PAGE_SIZE);
        setChatOffset(response.turns.length);
      } catch (err) {
        const isAbortError =
          abortController.signal.aborted || (err instanceof api.ApiError && err.code === 'ABORTED');
        if (!isAbortError) {
          // Silently ignore non-abort errors
        }
      } finally {
        if (!abortController.signal.aborted) {
          setIsChatLoading(false);
        }
      }
    };

    loadChatHistory();

    return () => {
      abortController.abort();
      loadMoreAbortRef.current?.abort();
    };
  }, [conversationId, projectId]);

  // ========== Load more (older) messages ==========
  const loadMore = useCallback(async () => {
    if (!projectId || !conversationId || isLoadingMore || !chatHasMore) return;

    // Cancel any pending load more request
    loadMoreAbortRef.current?.abort();
    const abortController = new AbortController();
    loadMoreAbortRef.current = abortController;

    const currentConversationId = conversationId;

    setIsLoadingMore(true);
    try {
      const response = await api.listTurns(
        projectId,
        currentConversationId,
        CHAT_PAGE_SIZE,
        chatOffset,
        {
          order: 'desc',
          signal: abortController.signal,
        }
      );

      // Check for race condition: conversation changed or request aborted
      if (abortController.signal.aborted) {
        return;
      }

      if (response.turns.length === 0) {
        setChatHasMore(false);
        return;
      }

      // Older messages (fetched in desc order, need to reverse)
      const olderMessages = response.turns
        .filter((turn) => turn.role === 'user' || turn.role === 'assistant')
        .map((turn) => ({
          id: turn.turn_hash,
          role: turn.role as 'user' | 'assistant',
          content: turn.content,
        }))
        .reverse();

      // Prepend older messages to the beginning
      setChatMessages((prev) => [...olderMessages, ...prev]);
      setChatOffset((prev) => prev + response.turns.length);
      setChatHasMore(response.turns.length >= CHAT_PAGE_SIZE);
    } catch (err) {
      const isAbortError =
        abortController.signal.aborted || (err instanceof api.ApiError && err.code === 'ABORTED');
      if (!isAbortError) {
        // Silently ignore non-abort errors
      }
    } finally {
      if (!abortController.signal.aborted) {
        setIsLoadingMore(false);
      }
    }
  }, [projectId, conversationId, chatOffset, chatHasMore, isLoadingMore]);

  // ========== Send message ==========
  const sendMessage = useCallback(
    async (messageOverride?: string) => {
      const rawMessage = messageOverride ?? chatInput;
      if (!rawMessage.trim() || isChatStreaming || isChatLoading) return;

      const userMessage = rawMessage.trim();
      setChatInput('');
      setChatError(null);
      setChatWarning(null);

      // Capture current messages BEFORE adding new user message to state.
      // This prevents the duplicate user message bug: if we read chatMessagesRef
      // AFTER the setState + await, the ref might already include the new message
      // (due to useEffect syncing), causing it to appear twice in the API call.
      const previousMessages = chatMessagesRef.current.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }));

      // Add user message to chat
      const newUserMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'user' as const,
        content: userMessage,
      };
      setChatMessages((prev) => [...prev, newUserMessage]);

      setIsChatStreaming(true);
      setStreamingContent('');

      try {
        // Ensure conversation exists before fetching memory (create if needed)
        let convId = conversationIdRef.current;
        if (!convId && projectId) {
          const newConv = await api.createConversation(projectId, title || 'Untitled Conversation');
          convId = newConv.conversation_id;
          conversationIdRef.current = convId;
          onConversationCreated?.(convId);
        }

        // Fetch pin-based memory context
        let memoryContext = '';
        if (convId) {
          try {
            const ctx = await api.getConversationMemory(convId);
            if (ctx.text) {
              memoryContext = ctx.text;
            }
          } catch {
            // Memory fetch failed - proceed without context
          }
        }

        // Build messages array from captured history (before state update)
        // previousMessages does NOT include the new user message, so we add it once at the end
        const messages: api.ChatMessage[] = [
          // Inject pin memory as system message (if available)
          ...(memoryContext ? [{ role: 'system' as const, content: memoryContext }] : []),
          ...previousMessages,
          { role: 'user' as const, content: userMessage },
        ];

        // Use streaming chat
        let fullResponse = '';
        let addedFinalMessage = false;

        for await (const event of api.chatStream({ messages, provider, model })) {
          if (event.type === 'token' && event.content) {
            fullResponse += event.content;
            setStreamingContent(fullResponse);
          } else if (event.type === 'done') {
            // Update fullResponse with done event content if available
            if (event.content) {
              fullResponse = event.content;
            }
            // Add assistant message to chat (only once)
            if (!addedFinalMessage) {
              setChatMessages((prev) => [
                ...prev,
                {
                  id: `msg-${Date.now()}`,
                  role: 'assistant' as const,
                  content: fullResponse,
                },
              ]);
              setStreamingContent('');
              addedFinalMessage = true;
            }
          } else if (event.type === 'error') {
            setChatError(event.message || 'Unknown error');
          }
        }

        // If we didn't get a done event but have content, add it
        if (fullResponse && !addedFinalMessage) {
          setChatMessages((prev) => [
            ...prev,
            {
              id: `msg-${Date.now()}`,
              role: 'assistant' as const,
              content: fullResponse,
            },
          ]);
          setStreamingContent('');
        }

        // Save turns to the conversation (non-blocking, with retry)
        const currentConversationId = conversationIdRef.current;
        if (projectId && currentConversationId) {
          const saveTurns = async (retriesLeft: number): Promise<void> => {
            try {
              await api.createTurn(projectId, currentConversationId, 'user', userMessage);
              if (fullResponse) {
                await api.createTurn(projectId, currentConversationId, 'assistant', fullResponse);
              }
              setTurnsSavedCounter((c) => c + 1);
              onTurnsSaved?.();
            } catch (err) {
              if (retriesLeft > 0) {
                await new Promise((r) => setTimeout(r, 1000));
                return saveTurns(retriesLeft - 1);
              }
              console.warn('Failed to save turns after retries:', err);
              showWarning('Turns not saved — API may be unavailable');
            }
          };
          // Fire-and-forget: don't block the UI
          saveTurns(1);
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setChatError(error.message);
      } finally {
        setIsChatStreaming(false);
        setStreamingContent('');
      }
    },
    [
      chatInput,
      isChatStreaming,
      isChatLoading,
      projectId,
      title,
      provider,
      model,
      onConversationCreated,
      onTurnsSaved,
      showWarning,
    ]
  );

  return {
    messages: chatMessages,
    input: chatInput,
    setInput: setChatInput,
    isLoading: isChatLoading,
    isStreaming: isChatStreaming,
    streamingContent,
    error: chatError,
    warning: chatWarning,
    hasMore: chatHasMore,
    isLoadingMore,
    sendMessage,
    loadMore,
    turnsSavedCounter,
  };
}
