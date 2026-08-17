import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deriveConversationTitleFromMessage,
  isPlaceholderConversationTitle,
  MAX_CONVERSATION_TITLE_LENGTH,
  normalizeGeneratedConversationTitle,
} from '@/domain/conversationTitle';
import { formatUserFacingError } from '@/domain/format/errors';
import { syncSavedTurnIntoWorkspace } from '@/hooks/conversations/syncSavedTurnIntoWorkspace';
import { type ChatMessage, useChatHistory } from '@/hooks/conversations/useChatHistory';
import { useChatStreamState } from '@/hooks/conversations/useChatStreamState';
import { useChatWarnings } from '@/hooks/conversations/useChatWarnings';
import {
  type GenerationCitation,
  type GenerationContentBlock,
  type GenerationMessage,
  generationApi,
} from '@/infrastructure/generation';
import type { SourceChatDraftReplyResponse } from '@/infrastructure/sourceChatDraftReplies';
import { sourceThreadApi } from '@/infrastructure/sourceThreads';
import type { Turn } from '@/infrastructure/types';
import { useChatSessionStore } from '@/store/chatSessionStore';
import { useChatStore } from '@/store/chatStore';
import { useCommitStore } from '@/store/commitStore';
import { useTemporaryChatsStore } from '@/store/temporaryChatsStore';
import type { AttachedImage } from '@/types/generation';

export type SourceThreadMessage = ChatMessage;

const TURN_SAVE_RETRY_DELAY_MS = 250;

interface SendMessageOptions {
  historyOverride?: Array<{ role: string; content: string }>;
  skipMemoryFetch?: boolean;
  images?: AttachedImage[];
  fixtureAssistantResponse?: string;
}

export interface SourceDraftReplyContext {
  workspaceId: string;
  workspaceRevision?: number;
}

export interface UseSourceThreadGenerationOptions {
  projectId: string;
  conversationId: string | undefined;
  title?: string;
  provider?: string;
  model?: string;
  parentCommitHash?: string;
  sourceDraftReply?: SourceDraftReplyContext;
  onConversationCreated?: (conversationId: string) => void;
  onTurnsSaved?: () => void;
}

export interface UseSourceThreadGenerationReturn {
  messages: SourceThreadMessage[];
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
  citations: GenerationCitation[];
  thinkingContent: string;
  isThinking: boolean;
}

function syncConversationTitle(title: string) {
  const chatStore = useChatStore.getState();
  chatStore.setConversationTitle(title);
  chatStore.refreshSidebar();
  useCommitStore.getState().setConversationTitle(title);
}

async function generateConversationTitleFromFirstMessage(
  message: string,
  options: { provider?: string; model?: string }
): Promise<string> {
  const fallback = deriveConversationTitleFromMessage(message);

  try {
    const response = await generationApi.complete({
      provider: options.provider,
      model: options.model,
      temperature: 0.2,
      max_tokens: 32,
      messages: [
        {
          role: 'system',
          content: [
            'Summarize the user message as a concise conversation title.',
            `Return only the title, with no quotes, no markdown, and no more than ${MAX_CONVERSATION_TITLE_LENGTH} characters.`,
          ].join(' '),
        },
        { role: 'user', content: message },
      ],
    });
    return normalizeGeneratedConversationTitle(response.content, fallback);
  } catch {
    return fallback;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function saveTurnWithRetry(createTurn: () => Promise<Turn>, retriesLeft = 1) {
  try {
    return await createTurn();
  } catch (err) {
    if (retriesLeft <= 0) throw err;
    await delay(TURN_SAVE_RETRY_DELAY_MS);
    return saveTurnWithRetry(createTurn, retriesLeft - 1);
  }
}

function mirrorSavedTurn(
  conversationId: string,
  turn: Turn | undefined,
  role: 'user' | 'assistant',
  content: string
) {
  if (!turn?.turn_hash) return;
  syncSavedTurnIntoWorkspace(conversationId, {
    turn_hash: turn.turn_hash,
    ...(turn.project_id ? { project_id: turn.project_id } : {}),
    ...(turn.conversation_id ? { conversation_id: turn.conversation_id } : {}),
    ...(turn.rings ? { rings: turn.rings } : {}),
    role,
    content,
  });
}

function savedTurnMessage(turn: Turn, role: 'user' | 'assistant', content: string): ChatMessage {
  return {
    id: turn.turn_hash,
    ...(turn.project_id ? { projectId: turn.project_id } : {}),
    ...(turn.conversation_id ? { conversationId: turn.conversation_id } : {}),
    ...(turn.rings ? { rings: turn.rings } : {}),
    role,
    content,
  };
}

function sourceDraftReplyRings(reply: SourceChatDraftReplyResponse): Record<string, unknown> {
  return {
    source_chat_draft: {
      schema: 't3x/source-chat-draft-v1',
      version: 1,
      display: reply.display,
      source_items: reply.source_items,
      provider: reply.provider,
      model: reply.model,
      ...(reply.usage ? { usage: reply.usage } : {}),
      ...(reply.warnings.length > 0 ? { warnings: reply.warnings } : {}),
    },
  };
}

function buildMemorySystemMessage(memoryContext: string): GenerationMessage | null {
  const content = memoryContext.trim();
  if (!content) return null;
  return {
    role: 'system',
    content,
  };
}

/**
 * Repository-facing Source Thread generation capability. It composes
 * persisted history, generation stream state, and warnings while keeping
 * the transport and durable turn lifecycle outside any product route.
 *
 * The retiring Chat workbench consumes this through a compatibility export;
 * repository Workspaces import this capability directly.
 */
export function useSourceThreadGeneration({
  projectId,
  conversationId,
  title,
  provider,
  model,
  parentCommitHash,
  sourceDraftReply,
  onConversationCreated,
  onTurnsSaved,
}: UseSourceThreadGenerationOptions): UseSourceThreadGenerationReturn {
  const history = useChatHistory(projectId, conversationId);
  const stream = useChatStreamState();
  const warnings = useChatWarnings();
  const isTemporaryMode = !projectId;

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
      let apiContent: string | GenerationContentBlock[];
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
      const fixtureAssistantResponse = options?.fixtureAssistantResponse;
      const isFixtureReply = Boolean(fixtureAssistantResponse);
      const currentTitle = title ?? useChatStore.getState().conversationTitle;
      const hasExistingConversation = Boolean(conversationIdRef.current);
      const hasExplicitNonPlaceholderTitle =
        Boolean(title?.trim()) && !isPlaceholderConversationTitle(title);
      const shouldAutoGenerateTitle =
        previousMessages.length === 0 &&
        (hasExistingConversation
          ? isPlaceholderConversationTitle(currentTitle)
          : !hasExplicitNonPlaceholderTitle);
      const generatedTitlePromise = shouldAutoGenerateTitle
        ? isFixtureReply
          ? null
          : generateConversationTitleFromFirstMessage(userMessage, { provider, model })
        : null;

      const applyGeneratedTitle = (targetConversationId: string, initialTitle: string) => {
        if (!generatedTitlePromise) return;

        void generatedTitlePromise.then(async (generatedTitle) => {
          if (!generatedTitle || generatedTitle === initialTitle) return;

          if (isTemporaryMode) {
            useTemporaryChatsStore.getState().renameChat(targetConversationId, generatedTitle);
            if (useChatStore.getState().activeConversationId === targetConversationId) {
              syncConversationTitle(generatedTitle);
            }
            return;
          }

          try {
            const updated = await sourceThreadApi.update(targetConversationId, {
              title: generatedTitle,
            });
            if (useChatStore.getState().activeConversationId === targetConversationId) {
              syncConversationTitle(updated.title || generatedTitle);
            } else {
              useChatStore.getState().refreshSidebar();
            }
          } catch {
            // Title refresh is cosmetic; keep the saved chat turn.
          }
        });
      };

      const replaceLocalMessageWithSavedTurn = (
        localMessageId: string,
        turn: Turn | undefined,
        role: 'user' | 'assistant',
        content: string
      ) => {
        if (!turn?.turn_hash) return;
        const savedMessage = savedTurnMessage(turn, role, content);
        history.setMessages((prev) => {
          const next = prev.map((msg) => (msg.id === localMessageId ? savedMessage : msg));
          history.messagesRef.current = next;
          return next;
        });
      };

      const newUserMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'user' as const,
        content: userMessage,
      };
      history.setMessages((prev) => [...prev, newUserMessage]);

      stream.setIsChatStreaming(true);
      stream.setStreamingContent('');

      let stableConversationId: string | null = null;
      const saveAssistantResponse = async (
        content: string,
        localMessageId: string | null,
        rings?: Record<string, unknown>
      ): Promise<void> => {
        const conversationForSave = stableConversationId;
        if (!projectId || !conversationForSave || content.trim().length === 0) return;
        try {
          const assistantTurn = await saveTurnWithRetry(() => {
            if (rings) {
              return sourceThreadApi.appendTurn(
                projectId,
                conversationForSave,
                'assistant',
                content,
                undefined,
                { rings }
              );
            }
            return sourceThreadApi.appendTurn(projectId, conversationForSave, 'assistant', content);
          });
          mirrorSavedTurn(conversationForSave, assistantTurn, 'assistant', content);
          if (localMessageId) {
            replaceLocalMessageWithSavedTurn(localMessageId, assistantTurn, 'assistant', content);
          }
        } catch {
          warnings.showWarning('Assistant reply not saved — API may be unavailable');
        }
      };

      try {
        let convId = conversationIdRef.current;
        let initialTitleForGeneratedTitle = currentTitle ?? messageTitle;
        let savedUserTurnHash: string | null = null;
        if (!convId && isTemporaryMode) {
          const newTitle = title?.trim() ? title : messageTitle;
          const chat = useTemporaryChatsStore.getState().createChat(newTitle);
          convId = chat.id;
          conversationIdRef.current = convId;
          initialTitleForGeneratedTitle = chat.title;
          syncConversationTitle(chat.title);
          useChatStore.getState().setActiveConversation(convId, null);
          onConversationCreated?.(convId);
        } else if (!convId && projectId) {
          const newTitle = title?.trim() ? title : messageTitle;
          const newConv = await sourceThreadApi.create(projectId, newTitle, parentCommitHash);
          convId = newConv.conversation_id;
          conversationIdRef.current = convId;
          initialTitleForGeneratedTitle = newConv.title || newTitle;
          syncConversationTitle(newConv.title || newTitle);
          onConversationCreated?.(convId);
        }

        if (!convId) {
          throw new Error('Conversation is not ready.');
        }

        const currentConversationId = convId;
        stableConversationId = currentConversationId;
        if (isTemporaryMode) {
          useTemporaryChatsStore.getState().addMessage(currentConversationId, newUserMessage);
          applyGeneratedTitle(currentConversationId, initialTitleForGeneratedTitle);
        } else {
          const userTurn = await saveTurnWithRetry(() =>
            sourceThreadApi.appendTurn(projectId, currentConversationId, 'user', userMessage)
          );
          savedUserTurnHash = userTurn.turn_hash;
          mirrorSavedTurn(currentConversationId, userTurn, 'user', userMessage);
          replaceLocalMessageWithSavedTurn(newUserMessage.id, userTurn, 'user', userMessage);
          applyGeneratedTitle(currentConversationId, initialTitleForGeneratedTitle);
        }
        setTurnsSavedCounter((c) => c + 1);
        onTurnsSaved?.();

        let memoryContext = '';
        if (!isTemporaryMode && !options?.skipMemoryFetch) {
          try {
            const ctx = await sourceThreadApi.memory(currentConversationId);
            if (ctx.text) memoryContext = ctx.text;
          } catch {
            // Memory fetch failed — proceed without context.
          }
        }

        const systemMessage = buildMemorySystemMessage(memoryContext);
        const messages: GenerationMessage[] = [
          ...(systemMessage ? [systemMessage] : []),
          ...previousMessages,
          { role: 'user' as const, content: apiContent },
        ];

        let fullResponse = '';
        let addedFinalMessage = false;
        let localAssistantMessageId: string | null = null;
        stream.tokenBufferRef.current = '';

        if (fixtureAssistantResponse) {
          await delay(450);
          fullResponse = fixtureAssistantResponse;
          localAssistantMessageId = `msg-${Date.now()}-assistant`;
          history.setMessages((prev) => [
            ...prev,
            {
              id: localAssistantMessageId!,
              role: 'assistant' as const,
              content: fullResponse,
            },
          ]);
          if (isTemporaryMode) {
            useTemporaryChatsStore.getState().addMessage(currentConversationId, {
              id: localAssistantMessageId,
              role: 'assistant',
              content: fullResponse,
            });
          }
          if (!isTemporaryMode) await saveAssistantResponse(fullResponse, localAssistantMessageId);
          return;
        }

        if (!isTemporaryMode && sourceDraftReply && savedUserTurnHash && !images?.length) {
          const reply = await sourceThreadApi.draftReply(projectId, sourceDraftReply.workspaceId, {
            conversation_id: currentConversationId,
            user_turn_hash: savedUserTurnHash,
            provider,
            model,
            ...(sourceDraftReply.workspaceRevision
              ? { if_revision: sourceDraftReply.workspaceRevision }
              : {}),
          });
          fullResponse = reply.content;
          if (reply.warnings.length > 0) {
            warnings.setWarning(reply.warnings.slice(0, 3).join(' '));
          }
          if (fullResponse.trim().length > 0) {
            localAssistantMessageId = `msg-${Date.now()}-assistant`;
            history.setMessages((prev) => [
              ...prev,
              {
                id: localAssistantMessageId!,
                role: 'assistant' as const,
                content: fullResponse,
              },
            ]);
            stream.setStreamingContent('');
            addedFinalMessage = true;
            await saveAssistantResponse(
              fullResponse,
              localAssistantMessageId,
              sourceDraftReplyRings(reply)
            );
            return;
          }
          warnings.setError('Model returned no content. Try again or check the provider key.');
          stream.setStreamingContent('');
          addedFinalMessage = true;
          return;
        }

        const flushBuffer = () => {
          if (stream.tokenBufferRef.current) {
            stream.setStreamingContent(stream.tokenBufferRef.current);
          }
          stream.rafIdRef.current = null;
        };

        const controller = new AbortController();
        stream.abortControllerRef.current = controller;

        for await (const event of generationApi.stream(
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
              localAssistantMessageId = `msg-${Date.now()}-assistant`;
              history.setMessages((prev) => [
                ...prev,
                {
                  id: localAssistantMessageId!,
                  role: 'assistant' as const,
                  content: fullResponse,
                },
              ]);
              if (isTemporaryMode) {
                useTemporaryChatsStore.getState().addMessage(currentConversationId, {
                  id: localAssistantMessageId,
                  role: 'assistant',
                  content: fullResponse,
                });
              }
              stream.setStreamingContent('');
              addedFinalMessage = true;
            } else if (!addedFinalMessage) {
              // Failed quietly — surface a hint instead of poisoning history.
              warnings.setError('Model returned no content. Try again or check the provider key.');
              stream.setStreamingContent('');
              addedFinalMessage = true;
            }
          } else if (event.type === 'error') {
            warnings.setError(formatUserFacingError(event.message, 'Chat request failed.'));
          }
        }

        if (fullResponse && !addedFinalMessage) {
          localAssistantMessageId = `msg-${Date.now()}-assistant`;
          history.setMessages((prev) => [
            ...prev,
            {
              id: localAssistantMessageId!,
              role: 'assistant' as const,
              content: fullResponse,
            },
          ]);
          if (isTemporaryMode && stableConversationId) {
            useTemporaryChatsStore.getState().addMessage(stableConversationId, {
              id: localAssistantMessageId,
              role: 'assistant',
              content: fullResponse,
            });
          }
          stream.setStreamingContent('');
        }

        if (!isTemporaryMode) await saveAssistantResponse(fullResponse, localAssistantMessageId);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          const partial = stream.tokenBufferRef.current;
          if (partial) {
            const localAssistantMessageId = `msg-${Date.now()}-assistant`;
            history.setMessages((prev) => [
              ...prev,
              {
                id: localAssistantMessageId,
                role: 'assistant' as const,
                content: partial,
              },
            ]);
            if (isTemporaryMode && stableConversationId) {
              useTemporaryChatsStore.getState().addMessage(stableConversationId, {
                id: localAssistantMessageId,
                role: 'assistant',
                content: partial,
              });
            } else {
              await saveAssistantResponse(partial, localAssistantMessageId);
            }
          }
          stream.setStreamingContent('');
          stream.setIsChatStreaming(false);
          history.setIsChatLoading(false);
          return;
        }
        warnings.setError(formatUserFacingError(err, 'Chat request failed.'));
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
      sourceDraftReply,
      onConversationCreated,
      onTurnsSaved,
      webSearchEnabled,
      thinkingEnabled,
      isTemporaryMode,
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
