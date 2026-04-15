'use client';

/**
 * useChatHistory — owns the chat-messages array, input buffer, and
 * pagination (initial load on conversation switch + loadMore). Does
 * not own the send flow; streaming messages are pushed via
 * `setMessages` exposed from this hook.
 *
 * Extracted from useConversationChat (PR23).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '@/infrastructure';

const CHAT_PAGE_SIZE = 100;

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface UseChatHistoryReturn {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  messagesRef: React.MutableRefObject<ChatMessage[]>;
  input: string;
  setInput: (value: string) => void;
  isChatLoading: boolean;
  setIsChatLoading: (v: boolean) => void;
  isLoadingMore: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
}

export function useChatHistory(
  projectId: string,
  conversationId: string | undefined
): UseChatHistoryReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);

  const messagesRef = useRef(messages);
  const prevConversationIdRef = useRef<string | undefined>(undefined);
  const loadMoreAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Initial load on conversation switch. If conversationId flipped
  // from undefined -> value while messages exist, we just created the
  // conversation mid-send — don't reload.
  useEffect(() => {
    const abortController = new AbortController();
    const currentConversationId = conversationId;
    const prevConversationId = prevConversationIdRef.current;
    prevConversationIdRef.current = currentConversationId;

    const load = async () => {
      if (!projectId || !currentConversationId) return;
      if (prevConversationId === undefined && messagesRef.current.length > 0) return;

      loadMoreAbortRef.current?.abort();
      loadMoreAbortRef.current = null;

      setMessages([]);
      setOffset(0);
      setHasMore(false);
      setIsChatLoading(true);
      try {
        const response = await api.listTurns(projectId, currentConversationId, CHAT_PAGE_SIZE, 0, {
          signal: abortController.signal,
          order: 'desc',
        });
        if (abortController.signal.aborted) return;
        const loaded = response.turns
          .filter((turn) => turn.role === 'user' || turn.role === 'assistant')
          .map((turn) => ({
            id: turn.turn_hash,
            role: turn.role as 'user' | 'assistant',
            content: turn.content,
          }))
          .reverse();
        setMessages(loaded);
        setHasMore(response.turns.length >= CHAT_PAGE_SIZE);
        setOffset(response.turns.length);
      } catch (err) {
        const isAbortError =
          abortController.signal.aborted || (err instanceof api.ApiError && err.code === 'ABORTED');
        if (!isAbortError) {
          // Silently ignore — UI remains on whatever state the page had.
        }
      } finally {
        if (!abortController.signal.aborted) {
          setIsChatLoading(false);
        }
      }
    };

    load();
    return () => {
      abortController.abort();
      loadMoreAbortRef.current?.abort();
    };
  }, [conversationId, projectId]);

  const loadMore = useCallback(async () => {
    if (!projectId || !conversationId || isLoadingMore || !hasMore) return;

    loadMoreAbortRef.current?.abort();
    const abortController = new AbortController();
    loadMoreAbortRef.current = abortController;

    setIsLoadingMore(true);
    try {
      const response = await api.listTurns(projectId, conversationId, CHAT_PAGE_SIZE, offset, {
        order: 'desc',
        signal: abortController.signal,
      });
      if (abortController.signal.aborted) return;
      if (response.turns.length === 0) {
        setHasMore(false);
        return;
      }
      const olderMessages = response.turns
        .filter((turn) => turn.role === 'user' || turn.role === 'assistant')
        .map((turn) => ({
          id: turn.turn_hash,
          role: turn.role as 'user' | 'assistant',
          content: turn.content,
        }))
        .reverse();
      setMessages((prev) => [...olderMessages, ...prev]);
      setOffset((prev) => prev + response.turns.length);
      setHasMore(response.turns.length >= CHAT_PAGE_SIZE);
    } catch (err) {
      const isAbortError =
        abortController.signal.aborted || (err instanceof api.ApiError && err.code === 'ABORTED');
      if (!isAbortError) {
        // Silently ignore.
      }
    } finally {
      if (!abortController.signal.aborted) {
        setIsLoadingMore(false);
      }
    }
  }, [projectId, conversationId, offset, hasMore, isLoadingMore]);

  return {
    messages,
    setMessages,
    messagesRef,
    input,
    setInput,
    isChatLoading,
    setIsChatLoading,
    isLoadingMore,
    hasMore,
    loadMore,
  };
}
