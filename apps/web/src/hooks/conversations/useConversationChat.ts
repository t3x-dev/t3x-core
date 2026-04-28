import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deriveConversationTitleFromMessage,
  isPlaceholderConversationTitle,
} from '@/domain/conversationTitle';
import { syncSavedTurnIntoWorkspace } from '@/hooks/conversations/syncSavedTurnIntoWorkspace';
import { type ChatMessage, useChatHistory } from '@/hooks/conversations/useChatHistory';
import { useChatStreamState } from '@/hooks/conversations/useChatStreamState';
import { useChatWarnings } from '@/hooks/conversations/useChatWarnings';
import * as api from '@/infrastructure';
import type { Citation } from '@/infrastructure/chat';
import { useChatSessionStore } from '@/store/chatSessionStore';
import { useChatStore } from '@/store/chatStore';
import { useCommitStore } from '@/store/commitStore';
import type { AttachedImage } from '@/types/chat';

export type { ChatMessage } from '@/hooks/conversations/useChatHistory';

interface SendMessageOptions {
  historyOverride?: Array<{ role: string; content: string }>;
  skipMemoryFetch?: boolean;
  images?: AttachedImage[];
}

export interface UseConversationChatOptions {
  projectId: string;
  conversationId: string | undefined;
  title?: string;
  provider?: string;
  model?: string;
  parentCommitHash?: string;
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
  sendMessage: (messageOverride?: string, options?: SendMessageOptions) => void;
  regenerate: (messageIndex: number) => void;
  editAndResend: (messageIndex: number, newContent: string) => void;
  loadMore: () => void;
  stopGenerating: () => void;
  /** Incremented each time turns are persisted to the DB — use to trigger extraction */
  turnsSavedCounter: number;
  searchQuery: string | null;
  citations: Citation[];
  thinkingContent: string;
  isThinking: boolean;
}

function syncConversationTitle(title: string) {
  const chatStore = useChatStore.getState();
  chatStore.setConversationTitle(title);
  chatStore.refreshSidebar();
  useCommitStore.getState().setConversationTitle(title);
}

/**
 * useConversationChat — facade for the chat pane. Composes three
 * sub-hooks (history / stream state / warnings) and owns the
 * sendMessage / regenerate / editAndResend orchestration.
 *
 * Before PR23 this was a single 551-line hook. External API is
 * byte-identical so ChatWorkspace and related components need no
 * changes.
 */
export function useConversationChat({
  projectId,
  conversationId,
  title,
  provider,
  model,
  parentCommitHash,
  onConversationCreated,
  onTurnsSaved,
}: UseConversationChatOptions): UseConversationChatReturn {
  const history = useChatHistory(projectId, conversationId);
  const stream = useChatStreamState();
  const warnings = useChatWarnings();

  const [turnsSavedCounter, setTurnsSavedCounter] = useState(0);

  const conversationIdRef = useRef(conversationId);
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  const webSearchEnabled = useChatSessionStore((s) => s.webSearchEnabled);
  const thinkingEnabled = useChatSessionStore((s) => s.thinkingEnabled);

  const sendMessage = useCallback(
    async (messageOverride?: string, options?: SendMessageOptions) => {
      const rawMessage = messageOverride ?? history.input;
      if (!rawMessage.trim() || stream.isChatStreaming || history.isChatLoading) return;

      const userMessage = rawMessage.trim();

      // Build content for API (may include image blocks)
      const images = options?.images;
      let apiContent: string | api.ContentBlock[];
      if (images?.length) {
        apiContent = [
          ...images.map((img) => ({
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: img.mediaType,
              data: img.base64,
            },
          })),
          { type: 'text' as const, text: userMessage },
        ];
      } else {
        apiContent = userMessage;
      }

      history.setInput('');
      warnings.setError(null);
      warnings.setWarning(null);
      stream.setSearchQuery(null);
      stream.setCitations([]);
      stream.setThinkingContent('');
      stream.setIsThinking(false);

      const previousMessages = options?.historyOverride
        ? options.historyOverride.map((msg) => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          }))
        : history.messagesRef.current.map((msg) => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          }));
      const messageTitle = deriveConversationTitleFromMessage(userMessage);
      const currentTitle = title ?? useChatStore.getState().conversationTitle;
      const shouldRenamePlaceholder =
        previousMessages.length === 0 && isPlaceholderConversationTitle(currentTitle);

      const newUserMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'user' as const,
        content: userMessage,
      };
      history.setMessages((prev) => [...prev, newUserMessage]);

      stream.setIsChatStreaming(true);
      stream.setStreamingContent('');

      try {
        let convId = conversationIdRef.current;
        if (!convId && projectId) {
          const newTitle = title?.trim() ? title : messageTitle;
          const newConv = await api.createConversation(projectId, newTitle, parentCommitHash);
          convId = newConv.conversation_id;
          conversationIdRef.current = convId;
          syncConversationTitle(newConv.title || newTitle);
          onConversationCreated?.(convId);
        }

        let memoryContext = '';
        if (!options?.skipMemoryFetch && convId) {
          try {
            const ctx = await api.getConversationMemory(convId);
            if (ctx.text) memoryContext = ctx.text;
          } catch {
            // Memory fetch failed — proceed without context.
          }
        }

        const messages: api.ChatMessage[] = [
          ...(memoryContext ? [{ role: 'system' as const, content: memoryContext }] : []),
          ...previousMessages,
          { role: 'user' as const, content: apiContent },
        ];

        let fullResponse = '';
        let addedFinalMessage = false;
        stream.tokenBufferRef.current = '';

        const flushBuffer = () => {
          if (stream.tokenBufferRef.current) {
            stream.setStreamingContent(stream.tokenBufferRef.current);
          }
          stream.rafIdRef.current = null;
        };

        const controller = new AbortController();
        stream.abortControllerRef.current = controller;

        for await (const event of api.chatStream(
          { messages, provider, model, web_search: webSearchEnabled, thinking: thinkingEnabled },
          { signal: controller.signal }
        )) {
          if (event.type === 'token' && event.content) {
            stream.setSearchQuery(null);
            stream.setIsThinking(false);
            fullResponse += event.content;
            stream.tokenBufferRef.current = fullResponse;
            if (stream.rafIdRef.current === null) {
              stream.rafIdRef.current = requestAnimationFrame(flushBuffer);
            }
          } else if (event.type === 'thinking') {
            stream.setIsThinking(true);
            stream.setThinkingContent((prev) => prev + (event.content ?? ''));
          } else if (event.type === 'searching') {
            stream.setSearchQuery(event.query ?? null);
          } else if (event.type === 'done') {
            stream.setSearchQuery(null);
            if (event.citations?.length) {
              stream.setCitations(event.citations);
            }
            if (stream.rafIdRef.current !== null) {
              cancelAnimationFrame(stream.rafIdRef.current);
              stream.rafIdRef.current = null;
            }
            if (event.content) fullResponse = event.content;
            // Skip the assistant append entirely when the upstream produced
            // no visible tokens (provider blip, safety block, etc.). Adding
            // an empty `{role: 'assistant', content: ''}` to the local
            // history poisons every subsequent /chat/stream call — the
            // server validator rejects empty content with "messages[N]:
            // content must be non-empty" and chat stalls.
            if (!addedFinalMessage && fullResponse.trim().length > 0) {
              history.setMessages((prev) => [
                ...prev,
                {
                  id: `msg-${Date.now()}`,
                  role: 'assistant' as const,
                  content: fullResponse,
                },
              ]);
              stream.setStreamingContent('');
              addedFinalMessage = true;
            } else if (!addedFinalMessage) {
              // Failed quietly — surface a hint instead of poisoning history.
              warnings.setError('Model returned no content. Try again or check the provider key.');
              stream.setStreamingContent('');
              addedFinalMessage = true;
            }
          } else if (event.type === 'error') {
            warnings.setError(event.message || 'Unknown error');
          }
        }

        if (fullResponse && !addedFinalMessage) {
          history.setMessages((prev) => [
            ...prev,
            {
              id: `msg-${Date.now()}`,
              role: 'assistant' as const,
              content: fullResponse,
            },
          ]);
          stream.setStreamingContent('');
        }

        const currentConversationId = conversationIdRef.current;
        if (projectId && currentConversationId) {
          const saveTurns = async (retriesLeft: number): Promise<void> => {
            try {
              const userTurn = await api.createTurn(
                projectId,
                currentConversationId,
                'user',
                userMessage
              );
              // Mirror persisted turns into workspaceStore.turns so an
              // immediately-following Extract sends real input instead
              // of the stale snapshot loaded at conv mount (otherwise
              // /v1/extract-yops short-circuits on an empty turns array
              // and silently returns 0 ops).
              if (userTurn?.turn_hash) {
                syncSavedTurnIntoWorkspace(currentConversationId, {
                  turn_hash: userTurn.turn_hash,
                  role: 'user',
                  content: userMessage,
                });
              }
              if (shouldRenamePlaceholder) {
                try {
                  const updated = await api.updateConversation(currentConversationId, {
                    title: messageTitle,
                  });
                  syncConversationTitle(updated.title || messageTitle);
                } catch {
                  // Title refresh is cosmetic; keep the saved chat turn.
                }
              }
              if (fullResponse) {
                const assistantTurn = await api.createTurn(
                  projectId,
                  currentConversationId,
                  'assistant',
                  fullResponse
                );
                if (assistantTurn?.turn_hash) {
                  syncSavedTurnIntoWorkspace(currentConversationId, {
                    turn_hash: assistantTurn.turn_hash,
                    role: 'assistant',
                    content: fullResponse,
                  });
                }
              }
              setTurnsSavedCounter((c) => c + 1);
              onTurnsSaved?.();
            } catch (err) {
              if (retriesLeft > 0) {
                await new Promise((r) => setTimeout(r, 1000));
                return saveTurns(retriesLeft - 1);
              }
              console.warn('Failed to save turns after retries:', err);
              warnings.showWarning('Turns not saved — API may be unavailable');
            }
          };
          saveTurns(1);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          const partial = stream.tokenBufferRef.current;
          if (partial) {
            history.setMessages((prev) => [
              ...prev,
              {
                id: `msg-${Date.now()}`,
                role: 'assistant' as const,
                content: partial,
              },
            ]);
          }
          stream.setStreamingContent('');
          stream.setIsChatStreaming(false);
          history.setIsChatLoading(false);
          return;
        }
        const error = err instanceof Error ? err : new Error(String(err));
        warnings.setError(error.message);
      } finally {
        stream.setIsChatStreaming(false);
        stream.setStreamingContent('');
      }
    },
    [
      history,
      stream,
      warnings,
      projectId,
      title,
      provider,
      model,
      parentCommitHash,
      onConversationCreated,
      onTurnsSaved,
      webSearchEnabled,
      thinkingEnabled,
    ]
  );

  const regenerate = useCallback(
    async (messageIndex: number) => {
      const currentMessages = history.messagesRef.current;
      const historyUpToPoint = currentMessages.slice(0, messageIndex);
      history.setMessages(historyUpToPoint);
      history.messagesRef.current = historyUpToPoint;

      const lastUserMsg = historyUpToPoint[historyUpToPoint.length - 1];
      if (!lastUserMsg || lastUserMsg.role !== 'user') return;

      await sendMessage(lastUserMsg.content, {
        historyOverride: historyUpToPoint
          .slice(0, -1)
          .map((m) => ({ role: m.role, content: m.content })),
        skipMemoryFetch: true,
      });
    },
    [sendMessage, history]
  );

  const editAndResend = useCallback(
    async (messageIndex: number, newContent: string) => {
      const currentMessages = history.messagesRef.current;
      const historyUpToPoint = currentMessages.slice(0, messageIndex);
      history.setMessages(historyUpToPoint);
      history.messagesRef.current = historyUpToPoint;

      await sendMessage(newContent, {
        historyOverride: historyUpToPoint.map((m) => ({ role: m.role, content: m.content })),
      });
    },
    [sendMessage, history]
  );

  return {
    messages: history.messages,
    input: history.input,
    setInput: history.setInput,
    isLoading: history.isChatLoading,
    isStreaming: stream.isChatStreaming,
    streamingContent: stream.streamingContent,
    error: warnings.error,
    warning: warnings.warning,
    hasMore: history.hasMore,
    isLoadingMore: history.isLoadingMore,
    sendMessage,
    regenerate,
    editAndResend,
    loadMore: history.loadMore,
    stopGenerating: stream.stopGenerating,
    turnsSavedCounter,
    searchQuery: stream.searchQuery,
    citations: stream.citations,
    thinkingContent: stream.thinkingContent,
    isThinking: stream.isThinking,
  };
}
