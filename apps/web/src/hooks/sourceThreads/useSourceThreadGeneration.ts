import { useCallback, useEffect } from 'react';
import {
  attachedImageFile,
  attachmentContentBlocks,
  type TurnAttachment,
} from '@/domain/conversations/turnAttachments';
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
import { type GenerationCitation, generationApi } from '@/infrastructure/generation';
import { uploadDocumentMaterial } from '@/infrastructure/materials';
import { getSharedApiClient } from '@/infrastructure/sharedApiClient';
import type { SourceChatDraftReplyResponse } from '@/infrastructure/sourceChatDraftReplies';
import { sourceThreadApi } from '@/infrastructure/sourceThreads';
import type { Turn } from '@/infrastructure/types';
import {
  recoverWorkspaceAssistantOperation,
  streamWorkspaceAssistant,
  type WorkspaceAssistantContext,
} from '@/infrastructure/workspaceAssistant';
import { useChatSessionStore } from '@/store/chatSessionStore';
import { useChatStore } from '@/store/chatStore';
import { useCommitStore } from '@/store/commitStore';
import { useTemporaryChatsStore } from '@/store/temporaryChatsStore';
import type { AttachedImage } from '@/types/generation';
import {
  sessionValue,
  useSourceThreadSessionRef,
  useSourceThreadSessionState,
  useWorkspaceAssistantSession,
} from './sourceThreadSession';

export type SourceThreadMessage = ChatMessage;

const TURN_SAVE_RETRY_DELAY_MS = 250;

interface SendMessageOptions {
  confirmedSettingsId?: string;
  historyOverride?: Array<{ role: string; content: string }>;
  skipMemoryFetch?: boolean;
  images?: AttachedImage[];
  /** Workspace Assistant only: stored as Source materials on the user turn. */
  files?: File[];
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
  workspaceAssistant?: WorkspaceAssistantContext;
  onConversationCreated?: (conversationId: string) => void;
  onConversationReady?: (conversationId: string) => void | Promise<void>;
  createConversation?: () => Promise<string>;
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
  workspaceActivity: WorkspaceAssistantActivity | null;
}

export interface WorkspaceAssistantActivity {
  turnId: string;
  phase: 'saving' | 'reading' | 'generating' | 'responding' | 'complete' | 'error';
  operations: Array<{
    id: string;
    name: string;
    status: 'started' | 'completed';
    transitionId?: string;
  }>;
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

function assistantStreamStatusRings(
  reason: 'stream_eof' | 'stream_error' | 'user_aborted'
): Record<string, unknown> {
  return {
    assistant_stream_status: {
      schema: 't3x/assistant-stream-status-v1',
      version: 1,
      status: 'partial',
      reason,
    },
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
  workspaceAssistant,
  onConversationCreated,
  onConversationReady,
  createConversation,
  onTurnsSaved,
}: UseSourceThreadGenerationOptions): UseSourceThreadGenerationReturn {
  const session = useWorkspaceAssistantSession(projectId, workspaceAssistant?.workspaceId);
  const history = useChatHistory(projectId, conversationId, session);
  const stream = useChatStreamState(session);
  const warnings = useChatWarnings(session);
  const isTemporaryMode = !projectId;

  const [turnsSavedCounter, setTurnsSavedCounter] = useSourceThreadSessionState(
    session,
    'generation.savedCounter',
    0
  );
  const [workspaceActivity, setWorkspaceActivity] =
    useSourceThreadSessionState<WorkspaceAssistantActivity | null>(
      session,
      'generation.activity',
      null
    );

  const conversationIdRef = useSourceThreadSessionRef(
    session,
    'generation.conversation',
    conversationId
  );
  const assistantRef = useSourceThreadSessionRef(
    session,
    'generation.assistant',
    workspaceAssistant
  );
  useEffect(() => {
    if (conversationId || !session) conversationIdRef.current = conversationId;
    assistantRef.current = workspaceAssistant;
  }, [conversationId, workspaceAssistant, conversationIdRef, assistantRef, session]);

  const reasoningEffort = useChatSessionStore((s) => s.reasoningEffort);
  const contextMode = useChatSessionStore((s) => s.contextMode);
  const fastEnabled = useChatSessionStore((s) => s.fastEnabled);

  const sendMessage = useCallback(
    async (messageOverride?: string, options?: SendMessageOptions) => {
      const rawMessage = messageOverride ?? history.input;
      if (
        !rawMessage.trim() ||
        stream.isChatStreaming ||
        sessionValue<boolean>(session, 'stream.running') ||
        history.isChatLoading
      )
        return;

      const userMessage = rawMessage.trim();

      const images = options?.images;
      const files = workspaceAssistant ? options?.files : undefined;

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
          const next = prev.map((msg) =>
            msg.id === localMessageId
              ? {
                  ...savedMessage,
                  ...(msg.images ? { images: msg.images } : {}),
                  ...(msg.files ? { files: msg.files } : {}),
                }
              : msg
          );
          history.messagesRef.current = next;
          return next;
        });
      };

      const newUserMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'user' as const,
        content: userMessage,
        ...(images?.length
          ? {
              images: images.map((img) => ({
                id: img.id,
                src: `data:${img.mediaType};base64,${img.base64}`,
              })),
            }
          : {}),
        ...(files?.length
          ? {
              files: files.map((file, index) => ({
                id: `${file.name}-${index}`,
                name: file.name,
                mimeType: file.type,
              })),
            }
          : {}),
      };
      history.setMessages((prev) => [...prev, newUserMessage]);

      if (workspaceAssistant) {
        setWorkspaceActivity({ turnId: newUserMessage.id, phase: 'saving', operations: [] });
      }

      stream.setIsChatStreaming(true);
      stream.setStreamingContent('');
      const requestController = new AbortController();
      stream.abortControllerRef.current = requestController;

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
          const newConv = createConversation
            ? { conversation_id: await createConversation(), title: newTitle }
            : await sourceThreadApi.create(projectId, newTitle, parentCommitHash);
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
          useTemporaryChatsStore.getState().addMessage(currentConversationId, {
            id: newUserMessage.id,
            role: newUserMessage.role,
            content: newUserMessage.content,
          });
          applyGeneratedTitle(currentConversationId, initialTitleForGeneratedTitle);
        } else {
          const attachments: TurnAttachment[] = [];
          if (workspaceAssistant) {
            const uploads = [
              ...(images ?? []).map((image) => ({
                kind: 'image' as const,
                file: attachedImageFile(image),
              })),
              ...(files ?? []).map((file) => ({ kind: 'file' as const, file })),
            ];
            for (const upload of uploads) {
              const material = await uploadDocumentMaterial(projectId, upload.file);
              attachments.push({
                materialId: material.id,
                kind: upload.kind,
                title: upload.file.name,
                mimeType: material.mime_type ?? upload.file.type,
              });
            }
          }
          const userTurn = await saveTurnWithRetry(() =>
            attachments.length
              ? sourceThreadApi.appendTurn(
                  projectId,
                  currentConversationId,
                  'user',
                  userMessage,
                  undefined,
                  { content_blocks: attachmentContentBlocks(projectId, userMessage, attachments) }
                )
              : sourceThreadApi.appendTurn(projectId, currentConversationId, 'user', userMessage)
          );
          savedUserTurnHash = userTurn.turn_hash;
          mirrorSavedTurn(currentConversationId, userTurn, 'user', userMessage);
          replaceLocalMessageWithSavedTurn(newUserMessage.id, userTurn, 'user', userMessage);
          applyGeneratedTitle(currentConversationId, initialTitleForGeneratedTitle);
        }
        setTurnsSavedCounter((c) => c + 1);
        onTurnsSaved?.();

        if (!isTemporaryMode && onConversationReady) {
          try {
            await onConversationReady(currentConversationId);
          } catch {
            // Context prep is best-effort; memory may be empty if it fails.
          }
        }

        let fullResponse = '';
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

        if (!isTemporaryMode && workspaceAssistant && savedUserTurnHash) {
          // Source turns and settings confirmations can advance the Workspace independently
          // of its last rendered authoring view. Pin each new chat run to the live revision.
          let assistantContext = workspaceAssistant;
          {
            const { workspace } = await getSharedApiClient().workspaces.get(
              projectId,
              workspaceAssistant.workspaceId
            );
            if (workspace.revision === undefined)
              throw new Error('Workspace revision is unavailable.');
            assistantContext = { ...workspaceAssistant, workspaceRevision: workspace.revision };
          }
          const controller = requestController;
          controller.signal.throwIfAborted();
          const unfinished = new Set<string>();
          const completedCandidates = new Set<string>();
          let receivedText = false;
          let completed = false;
          let completedTurnHash: string | undefined;
          let lastTextDeltaLength = 0;
          const flushWorkspaceStream = () => {
            stream.setStreamingContent(stream.tokenBufferRef.current);
            stream.rafIdRef.current = null;
          };
          try {
            for await (const event of streamWorkspaceAssistant(
              projectId,
              assistantContext,
              { conversationId: currentConversationId, userTurnHash: savedUserTurnHash },
              {
                signal: controller.signal,
                provider,
                model,
                reasoningEffort,
                contextMode,
                fast: fastEnabled,
                confirmedSettingsId: options?.confirmedSettingsId,
              }
            )) {
              if (event.type === 'context') {
                setWorkspaceActivity((current) =>
                  current ? { ...current, phase: 'reading' } : current
                );
              }
              if (event.type === 'text') {
                const delta = event.content ?? '';
                if (!receivedText) {
                  receivedText = true;
                  setWorkspaceActivity((current) =>
                    current ? { ...current, phase: 'responding' } : current
                  );
                }
                lastTextDeltaLength = delta.length;
                fullResponse += delta;
                stream.tokenBufferRef.current = fullResponse;
                if (stream.rafIdRef.current === null) {
                  stream.rafIdRef.current = requestAnimationFrame(flushWorkspaceStream);
                }
              }
              if (event.type === 'operation' && event.operationId) {
                if (event.status === 'started') {
                  unfinished.add(event.operationId);
                  setWorkspaceActivity((current) =>
                    current
                      ? {
                          ...current,
                          phase: event.name === 'requestProposal' ? 'generating' : 'reading',
                          operations: [
                            ...current.operations,
                            {
                              id: event.operationId!,
                              name: event.name ?? 'operation',
                              status: 'started',
                            },
                          ],
                        }
                      : current
                  );
                }
                if (event.status === 'completed') {
                  if (event.name === 'showSchemaSettings' || event.result?.kind === 'schema')
                    assistantRef.current?.onSchemaSettings?.(
                      event.result?.settings?.conversationId
                    );
                  unfinished.delete(event.operationId);
                  if (event.result?.transitionId)
                    completedCandidates.add(event.result.transitionId);
                  setWorkspaceActivity((current) =>
                    current
                      ? {
                          ...current,
                          phase: receivedText ? 'responding' : 'generating',
                          operations: current.operations.map((operation) =>
                            operation.id === event.operationId
                              ? {
                                  ...operation,
                                  status: 'completed',
                                  transitionId: event.result?.transitionId,
                                }
                              : operation
                          ),
                        }
                      : current
                  );
                }
              }
              if (event.type === 'error') throw new Error(event.message ?? 'Assistant failed');
              if (event.type === 'done') {
                completed = true;
                completedTurnHash = event.turnHash;
                if (event.content && event.content !== fullResponse) {
                  lastTextDeltaLength = Math.max(0, event.content.length - fullResponse.length);
                }
                fullResponse = event.content ?? fullResponse;
                stream.tokenBufferRef.current = fullResponse;
                if (stream.rafIdRef.current !== null) {
                  cancelAnimationFrame(stream.rafIdRef.current);
                  stream.rafIdRef.current = null;
                }
                if (fullResponse.trim()) stream.setStreamingContent(fullResponse);
                if (event.reason === 'step_limit')
                  warnings.setWarning(
                    'Assistant reached its step limit. Saved proposals remain available.'
                  );
              }
            }
          } finally {
            // Reconcile persisted business results; never replay tool calls after EOF or disconnect.
            for (const operationId of unfinished) {
              try {
                const result = await recoverWorkspaceAssistantOperation(
                  projectId,
                  workspaceAssistant.workspaceId,
                  operationId
                );
                if (result.status === 'candidate' && result.transitionId)
                  assistantRef.current?.onCandidate?.(result.transitionId);
              } catch {
                warnings.setWarning('Connection ended. Recheck saved proposals before retrying.');
              }
            }
          }
          if (!completed)
            warnings.setWarning(
              'Assistant stream ended before completion. Saved business results were checked.'
            );
          if (completed && fullResponse.trim()) {
            // Keep the streaming surface mounted just long enough for the last
            // provider delta to finish its visual reveal. This does not delay or
            // reshape the network stream; it only prevents the final static
            // message from replacing the animated text in the same frame.
            await delay(Math.min(450, Math.max(120, lastTextDeltaLength + 90)));
            history.setMessages((prev) => [
              ...prev,
              {
                id: completedTurnHash ?? `reply-${savedUserTurnHash}`,
                role: 'assistant',
                content: fullResponse,
              },
            ]);
          }
          stream.setStreamingContent('');
          // Publishing refreshes the workspace authoring projection. Wait until the
          // assistant turn has been persisted and the done event has updated local
          // history, otherwise that refresh can reload the conversation in the brief
          // gap where only the user turn exists and hide the completed reply until a
          // manual page reload.
          for (const transitionId of completedCandidates) {
            assistantRef.current?.onCandidate?.(transitionId, newUserMessage.id);
          }
          setWorkspaceActivity((current) =>
            current ? { ...current, phase: completed ? 'complete' : 'error' } : current
          );
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
            await saveAssistantResponse(
              fullResponse,
              localAssistantMessageId,
              sourceDraftReplyRings(reply)
            );
            return;
          }
          warnings.setError('Model returned no content. Try again or check the provider key.');
          stream.setStreamingContent('');
          return;
        }

        throw new Error('Workspace assistant context is required to send a message.');
      } catch (err) {
        if (workspaceAssistant)
          setWorkspaceActivity((current) => (current ? { ...current, phase: 'error' } : current));
        if (err instanceof DOMException && err.name === 'AbortError') {
          const partial = stream.tokenBufferRef.current;
          if (partial && !workspaceAssistant) {
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
              await saveAssistantResponse(
                partial,
                localAssistantMessageId,
                assistantStreamStatusRings('user_aborted')
              );
            }
          }
          stream.setStreamingContent('');
          stream.setIsChatStreaming(false);
          history.setIsChatLoading(false);
          return;
        }
        warnings.setError(formatUserFacingError(err, 'Chat request failed.'));
      } finally {
        if (stream.rafIdRef.current !== null) {
          cancelAnimationFrame(stream.rafIdRef.current);
          stream.rafIdRef.current = null;
        }
        stream.abortControllerRef.current = null;
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
      workspaceAssistant,
      onConversationCreated,
      onConversationReady,
      createConversation,
      onTurnsSaved,
      reasoningEffort,
      contextMode,
      fastEnabled,
      isTemporaryMode,
      session,
      conversationIdRef,
      assistantRef,
      setTurnsSavedCounter,
      setWorkspaceActivity,
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
    workspaceActivity,
  };
}
