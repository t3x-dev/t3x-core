'use client';

import { AlertCircle, GitCommit, Loader2, MessageSquarePlus } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getExtractDisabledReason } from '@/domain/extractionReadiness';
import { buildSourceMap } from '@/domain/sourceMap';
import { useCommittedHighlights } from '@/hooks/commits/useCommittedHighlights';
import { useChatInit } from '@/hooks/conversations/useChatInit';
import { useConversationChat } from '@/hooks/conversations/useConversationChat';
import { useExtraction } from '@/hooks/drafts/useExtraction';
import { usePinEnrichment } from '@/hooks/pins/usePinEnrichment';
import { usePinsCrud } from '@/hooks/pins/usePinsCrud';
import { useChatModelSelection } from '@/hooks/shared/useChatModelSelection';
import { useRealtimeSync } from '@/hooks/shared/useRealtimeSync';
import { useTextSelection } from '@/hooks/shared/useTextSelection';
import { useUndo } from '@/hooks/shared/useUndo';
import { useChatStore } from '@/store/chatStore';
import { usePinsStore } from '@/store/pinsStore';
import { getTemporaryChat } from '@/store/temporaryChatsStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { cn } from '@/utils/cn';
import { ChatHeader } from './ChatHeader';
import type { AttachedImage } from './ChatInput';
import { ChatInput } from './ChatInput';
import { ChatMessage } from './ChatMessage';
import { ChatSpanActions } from './ChatSpanActions';
import { CommittedBar } from './CommittedBar';
import { ProviderSetupBanner } from './ProviderSetupBanner';
import { SourceMaterialPanel } from './SourceMaterialPanel';

interface ChatWorkspaceProps {
  conversationId: string;
  projectId?: string;
  firstMessage?: string;
  initialProvider?: string;
  initialModel?: string;
  className?: string;
  style?: CSSProperties;
  /** Called when a new conversation is created (e.g. from /chat/new). Overrides default URL update. */
  onConversationCreated?: (conversationId: string) => void;
  /** Parent commit hash — if set, hydrate extraction panel with parent's trees */
  inheritFromCommitHash?: string;
  /** Callback to clear inheritFromCommitHash after hydration (prevents re-hydration on remount) */
  onInheritComplete?: () => void;
}

export function ChatWorkspace({
  conversationId,
  projectId,
  firstMessage,
  initialProvider,
  initialModel,
  className,
  style,
  onConversationCreated: onConversationCreatedProp,
  inheritFromCommitHash,
  onInheritComplete,
}: ChatWorkspaceProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const { selection, clearSelection } = useTextSelection(chatContainerRef);
  useUndo({ bindKeyboard: true });
  const isCommitted = useWorkspaceStore((s) => s.isCommitted);
  const pins = usePinsStore((s) => s.pins);
  const conversationTitle = useChatStore((s) => s.conversationTitle);
  const { fetch: fetchPins } = usePinsCrud();
  const [showSourcePanel, setShowSourcePanel] = useState(false);
  const [coverageMode, setCoverageMode] = useState(false);
  const enrichedPinData = usePinEnrichment(pins, showSourcePanel);
  const showAddForm =
    !isCommitted && selection && selection.turnRole !== 'user' && selection.text.length > 3;
  const firstMessageSentRef = useRef(false);
  const {
    loading: modelsLoading,
    hasConfiguredGenerationProvider,
    selectedProvider,
    selectedModel,
    handleModelChange,
    isSelectionReady,
    availabilityError,
  } = useChatModelSelection({
    initialProvider,
    initialModel,
  });

  // For "/chat/new" routes: create either a temporary local chat or a project conversation.
  const isNewChat = conversationId === 'new';
  const [resolvedProjectId, setResolvedProjectId] = useState(projectId ?? '');
  const [resolvedConversationId, setResolvedConversationId] = useState<string | undefined>(
    isNewChat ? undefined : conversationId
  );
  const isTemporaryChat = !resolvedProjectId;
  const chatInputDraftKey = resolvedConversationId
    ? isTemporaryChat
      ? `temporary:${resolvedConversationId}`
      : `conversation:${resolvedConversationId}`
    : isNewChat && resolvedProjectId
      ? `new:${resolvedProjectId}`
      : 'temporary:new';
  const pendingMessageRef = useRef<string | null>(null);

  // Real-time sync — WebSocket connection to receive backend state changes
  useRealtimeSync(resolvedProjectId ? (resolvedConversationId ?? conversationId) : null);

  // Load project pins for multi-source extraction
  useEffect(() => {
    if (resolvedProjectId) fetchPins(resolvedProjectId);
  }, [resolvedProjectId, fetchPins]);

  const {
    messages,
    isLoading,
    isStreaming,
    streamingContent,
    error,
    warning,
    sendMessage,
    stopGenerating,
    searchQuery,
    citations,
    thinkingContent,
    isThinking,
  } = useConversationChat({
    projectId: resolvedProjectId,
    conversationId: resolvedConversationId,
    title: conversationTitle ?? undefined,
    provider: selectedProvider ?? undefined,
    model: selectedModel ?? undefined,
    parentCommitHash: inheritFromCommitHash,
    onConversationCreated: useCallback(
      (newConvId: string) => {
        setResolvedConversationId(newConvId);
        if (onConversationCreatedProp) {
          onConversationCreatedProp(newConvId);
        } else {
          // Update URL without triggering Next.js navigation (avoids re-mount)
          window.history.replaceState(null, '', `/chat/${newConvId}`);
        }
      },
      [onConversationCreatedProp]
    ),
  });

  // Sync resolved IDs when props change (e.g. sidebar navigation between conversations)
  useEffect(() => {
    if (projectId) setResolvedProjectId(projectId);
  }, [projectId]);

  useEffect(() => {
    if (!isNewChat) setResolvedConversationId(conversationId);
  }, [conversationId, isNewChat]);

  // Flush pending message once projectId is resolved and sendMessage is recreated
  useEffect(() => {
    if (isCommitted) {
      pendingMessageRef.current = null;
      return;
    }
    if ((resolvedProjectId || isTemporaryChat) && pendingMessageRef.current && isSelectionReady) {
      const msg = pendingMessageRef.current;
      pendingMessageRef.current = null;
      sendMessage(msg);
    }
  }, [resolvedProjectId, sendMessage, isSelectionReady, isCommitted, isTemporaryChat]);

  // Store initialization, draft loading, inheritance hydration, topic loading
  const { parentConversationId } = useChatInit({
    conversationId,
    resolvedConversationId,
    resolvedProjectId,
    setResolvedProjectId,
    inheritFromCommitHash,
    onInheritComplete,
  });

  useEffect(() => {
    if (!isTemporaryChat || !resolvedConversationId) return;
    const chat = getTemporaryChat(resolvedConversationId);
    useChatStore.getState().setConversationTitle(chat?.title ?? 'Temporary chat');
  }, [isTemporaryChat, resolvedConversationId]);

  // Auto-scroll to bottom on new messages or streaming content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Extraction handler + related state
  const { handleExtract, isExtracting } = useExtraction({
    resolvedConversationId,
    selectedProvider,
    selectedModel,
  });

  // Precompute source map from sourceIndex — positions are already known
  // (every LLMSource carries turn_hash + start_char/end_char).
  const sourceIndex = useWorkspaceStore((s) => s.sourceIndex);
  const turns = useWorkspaceStore((s) => s.turns);
  const sourceTextDrafts = useWorkspaceStore((s) => s.sourceTextDrafts);
  const workspaceMode = useWorkspaceStore((s) => s.mode);
  const hasDraft = useWorkspaceStore((s) => s.hasDraft);
  const workspaceConversationId = useWorkspaceStore((s) => s.conversationId);
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId);
  const workspaceLastError = useWorkspaceStore((s) => s.lastError);
  const sourceMapByTurn = useMemo(() => buildSourceMap(sourceIndex, turns), [sourceIndex, turns]);

  // Load persistent committed highlights for this conversation
  const committedHighlightsByTurn = useCommittedHighlights(
    resolvedProjectId,
    resolvedConversationId
  );

  // Listen for extraction request (via custom event)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const disabledReason = getExtractDisabledReason({
        activeProjectId: activeProjectId || resolvedProjectId,
        workspaceConversationId,
        routeConversationId: resolvedConversationId,
        turnCount: turns.length,
        workspaceMode,
        isCommitted,
        hasDraft,
        isChatLoading: isLoading,
        isChatStreaming: isStreaming,
        modelsLoading,
        selectedProvider,
        selectedModel,
        lastError: workspaceLastError,
      });
      if (disabledReason) {
        toast.message(disabledReason);
        return;
      }

      if (detail?.sourcePinIds) {
        // Came from source panel confirm — extract with selected pins
        handleExtract(detail.sourcePinIds);
      } else if (detail?.chooseSources) {
        if (pins.length === 0) {
          toast.message('No pinned sources yet');
          return;
        }

        setShowSourcePanel(true);
        requestAnimationFrame(() => {
          chatContainerRef.current?.scrollTo({
            top: chatContainerRef.current.scrollHeight,
            behavior: 'smooth',
          });
        });
      } else {
        // Default behavior: extract immediately, even when pins exist.
        handleExtract();
      }
    };
    window.addEventListener('t3x:extract-requested', handler);
    return () => window.removeEventListener('t3x:extract-requested', handler);
  }, [
    activeProjectId,
    handleExtract,
    hasDraft,
    isCommitted,
    isLoading,
    isStreaming,
    modelsLoading,
    pins.length,
    resolvedConversationId,
    resolvedProjectId,
    selectedModel,
    selectedProvider,
    turns.length,
    workspaceConversationId,
    workspaceLastError,
    workspaceMode,
  ]);

  // Hide source panel when extraction starts
  useEffect(() => {
    if (isExtracting) setShowSourcePanel(false);
  }, [isExtracting]);

  // Send firstMessage on mount (once only)
  useEffect(() => {
    if (firstMessage && !firstMessageSentRef.current && !isLoading) {
      firstMessageSentRef.current = true;
      pendingMessageRef.current = firstMessage;

      if (isSelectionReady) {
        pendingMessageRef.current = null;
        sendMessage(firstMessage);
      }
    }
  }, [firstMessage, isLoading, sendMessage, isSelectionReady]);

  const handleSend = useCallback(
    async (message: string, images?: AttachedImage[]) => {
      if (isCommitted) {
        pendingMessageRef.current = null;
        return;
      }
      if (!isSelectionReady) {
        pendingMessageRef.current = message;
        return;
      }

      sendMessage(message, images ? { images } : undefined);
    },
    [sendMessage, isSelectionReady, isCommitted]
  );

  return (
    <div className={cn('flex flex-col h-full min-h-0 relative', className)} style={style}>
      {/* Header */}
      <ChatHeader
        conversationId={resolvedConversationId ?? null}
        selectedProvider={selectedProvider}
        selectedModel={selectedModel ?? ''}
        onModelChange={handleModelChange}
        isChatLoading={isLoading}
        isChatStreaming={isStreaming}
        modelsLoading={modelsLoading}
      />

      {/* Coverage toggle — visible after extraction */}
      {sourceMapByTurn.size > 0 && (
        <button
          type="button"
          onClick={() => setCoverageMode((p) => !p)}
          className={cn(
            'absolute top-12 right-4 z-10 flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md border transition-colors',
            coverageMode
              ? 'bg-[var(--status-warning)]/10 border-[var(--status-warning)]/30 text-[var(--status-warning)]'
              : 'bg-[var(--surface-elevated)] border-[var(--stroke-default)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
          )}
        >
          {coverageMode ? 'Hide coverage' : 'Show coverage'}
        </button>
      )}

      {/* Message list */}
      <div
        ref={chatContainerRef}
        className="chat-scrollbar flex-1 overflow-y-auto overflow-x-hidden bg-[var(--chat-panel)]"
      >
        {/* Parent conversation banner */}
        {parentConversationId && (
          <div className="w-full py-2 bg-[var(--accent-commit)]/5 border-b border-[var(--accent-commit)]/10">
            <div className="mx-auto flex max-w-[620px] items-center gap-2 px-5 text-xs text-[var(--text-secondary)]">
              <GitCommit size={12} className="text-[var(--accent-commit)]" />
              <span>Continuing from previous commit</span>
              <a
                href={`/chat/${parentConversationId}`}
                className="text-[var(--accent-commit)] hover:underline font-medium"
              >
                View parent conversation
              </a>
            </div>
          </div>
        )}
        {isLoading ? (
          <div className="flex h-full flex-col items-center justify-center text-[var(--text-tertiary)] gap-2">
            <Loader2 size={40} strokeWidth={1} className="animate-spin" />
            <p className="text-sm font-medium">Loading conversation...</p>
          </div>
        ) : messages.length === 0 && !isStreaming ? (
          <div className="flex h-full flex-col items-center justify-center text-[var(--text-tertiary)] gap-2">
            {!modelsLoading && !hasConfiguredGenerationProvider && (
              <div className="w-full max-w-[620px] px-5 pb-2">
                <ProviderSetupBanner
                  variant={availabilityError === 'api_unavailable' ? 'api-unavailable' : 'setup'}
                />
              </div>
            )}
            <MessageSquarePlus size={40} strokeWidth={1} />
            <p className="text-sm font-medium text-[var(--text-primary)]">No messages yet</p>
            <span className="text-xs text-[var(--text-tertiary)]">
              Type a message below to start the conversation
            </span>
          </div>
        ) : (
          <div className="space-y-1 py-2">
            {messages.map((msg, i) => {
              const sourceDraft = sourceTextDrafts[msg.id];
              return (
                <ChatMessage
                  key={msg.id}
                  sender={msg.role}
                  content={sourceDraft?.content ?? msg.content}
                  projectId={msg.projectId}
                  conversationId={msg.conversationId}
                  turnHash={msg.id}
                  turnIndex={i + 1}
                  citations={
                    msg.role === 'assistant' && i === messages.length - 1 ? citations : undefined
                  }
                  sourceMap={sourceMapByTurn.get(i + 1)}
                  committedHighlights={committedHighlightsByTurn.get(msg.id)}
                  inlineEditSpans={sourceDraft?.spans}
                  coverageMode={coverageMode}
                />
              );
            })}

            {/* Search indicator */}
            {searchQuery && (
              <div className="mx-auto flex max-w-[620px] items-center gap-2 px-5 py-2 text-xs text-[var(--text-tertiary)]">
                <span className="animate-spin h-3 w-3 border border-[var(--text-tertiary)] border-t-transparent rounded-full" />
                Searching: {searchQuery}
              </div>
            )}

            {/* Streaming response */}
            {isStreaming && streamingContent && (
              <ChatMessage
                sender="assistant"
                content={streamingContent}
                isStreaming
                thinkingContent={thinkingContent}
                isThinking={isThinking}
              />
            )}

            {/* Waiting indicator */}
            {isStreaming && !streamingContent && (
              <div className="w-full py-4">
                <div className="mx-auto max-w-[620px] px-5">
                  <div className="flex gap-3">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-conversation-soft)] text-xs font-medium text-[var(--accent-conversation)] ring-1 ring-[var(--accent-conversation)]/20">
                      T3
                    </div>
                    <div className="flex items-center gap-2 text-[var(--text-tertiary)] text-sm pt-1">
                      <div className="flex gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-tertiary)] animate-bounce [animation-delay:0ms]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-tertiary)] animate-bounce [animation-delay:150ms]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-tertiary)] animate-bounce [animation-delay:300ms]" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="w-full py-3">
                <div className="mx-auto max-w-[620px] px-5">
                  <div className="flex items-center gap-2 py-2.5 px-3.5 bg-[var(--status-error-muted)] border border-[var(--status-error)]/20 rounded-lg text-[var(--status-error)] text-xs">
                    <AlertCircle size={14} />
                    <span>{error}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Non-critical warning */}
            {warning && !error && (
              <div className="w-full py-3">
                <div className="mx-auto max-w-[620px] px-5">
                  <div className="flex items-center gap-2 py-2 px-3.5 bg-[var(--status-warning-muted)] border border-[var(--status-warning)]/20 rounded-lg text-[var(--status-warning)] text-xs">
                    <AlertCircle size={14} />
                    <span>{warning}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Pinned source material panel */}
            {showSourcePanel && pins.length > 0 && (
              <SourceMaterialPanel
                pins={pins.map((p) => ({
                  ...p,
                  title: enrichedPinData.get(p.id)?.title ?? p.ref_id.slice(0, 12),
                  assertionLessons: enrichedPinData.get(p.id)?.assertionLessons,
                  turnCount: enrichedPinData.get(p.id)?.turnCount,
                }))}
                onConfirm={(selectedPinIds) => {
                  setShowSourcePanel(false);
                  handleExtract(selectedPinIds);
                }}
                onCancel={() => setShowSourcePanel(false)}
              />
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Inline source-text actions (visible whenever editable chat text is selected) */}
      {showAddForm && selection && (
        <ChatSpanActions selection={selection} onDone={clearSelection} />
      )}

      {/* Input area — committed bar replaces input after commit */}
      {isCommitted ? (
        <CommittedBar projectId={resolvedProjectId || undefined} />
      ) : (
        <div className="shrink-0 bg-[var(--chat-panel)] pb-3 pt-4">
          <div className="mx-auto max-w-[620px] px-5">
            <ChatInput
              onSend={handleSend}
              onStop={stopGenerating}
              isStreaming={isStreaming}
              draftKey={chatInputDraftKey}
              disabled={
                isLoading || isExtracting || modelsLoading || !selectedProvider || !selectedModel
              }
              placeholder="Reply..."
              conversationId={resolvedConversationId}
              selectedProvider={selectedProvider ?? ''}
              selectedModel={selectedModel ?? ''}
              onModelChange={handleModelChange}
            />
          </div>
        </div>
      )}
    </div>
  );
}
