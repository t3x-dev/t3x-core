'use client';

import { AlertCircle, GitCommit, Loader2, MessageSquarePlus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DriftPopup } from '@/components/chat/DriftPopup';
import { useAutoProject } from '@/hooks/useAutoProject';
import { useCommittedHighlights } from '@/hooks/useCommittedHighlights';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { useConversationChat } from '@/hooks/useConversationChat';
import { useTextSelection } from '@/hooks/useTextSelection';
import { buildSourceMap } from '@/lib/sourceMap';
import { cn } from '@/lib/utils';
import { useDraftStore } from '@/store/draftStore';
import { usePhaseStore } from '@/store/phaseStore';
import { ChatAddForm } from './ChatAddForm';
import { ChatHeader } from './ChatHeader';
import type { AttachedImage } from './ChatInput';
import { ChatInput } from './ChatInput';
import { ChatMessage } from './ChatMessage';
import { useChatInit } from './useChatInit';
import { useExtraction } from './useExtraction';

interface ChatWorkspaceProps {
  conversationId: string;
  projectId?: string;
  firstMessage?: string;
  className?: string;
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
  className,
  onConversationCreated: onConversationCreatedProp,
  inheritFromCommitHash,
  onInheritComplete,
}: ChatWorkspaceProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const { selection, clearSelection } = useTextSelection(chatContainerRef);
  const extractionPhase = usePhaseStore((s) => s.phase);
  const isReviewPhase = extractionPhase === 'review' || extractionPhase === 'committing';
  const showAddForm = isReviewPhase && selection && selection.text.length > 3;
  const firstMessageSentRef = useRef(false);
  const prevTurnsSavedRef = useRef(0);

  // For "/chat/new" routes: auto-create project + conversation
  const isNewChat = conversationId === 'new';
  const { ensureProject } = useAutoProject();
  const [resolvedProjectId, setResolvedProjectId] = useState(projectId ?? '');
  const [resolvedConversationId, setResolvedConversationId] = useState<string | undefined>(
    isNewChat ? undefined : conversationId
  );
  const pendingMessageRef = useRef<string | null>(null);

  // Real-time sync — WebSocket connection to receive backend state changes
  useRealtimeSync(resolvedConversationId ?? conversationId);

  // Model selection state
  const [selectedModel, setSelectedModel] = useState('claude-sonnet-4-20250514');
  const [selectedProvider, setSelectedProvider] = useState('anthropic');

  const handleModelChange = useCallback((provider: string, model: string) => {
    setSelectedProvider(provider);
    setSelectedModel(model);
  }, []);

  const {
    messages,
    input,
    setInput,
    isLoading,
    isStreaming,
    streamingContent,
    error,
    warning,
    sendMessage,
    regenerate,
    editAndResend,
    stopGenerating,
    turnsSavedCounter,
    searchQuery,
    citations,
    thinkingContent,
    isThinking,
  } = useConversationChat({
    projectId: resolvedProjectId,
    conversationId: resolvedConversationId,
    provider: selectedProvider,
    model: selectedModel,
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
    if (resolvedProjectId && pendingMessageRef.current) {
      const msg = pendingMessageRef.current;
      pendingMessageRef.current = null;
      sendMessage(msg);
    }
  }, [resolvedProjectId, sendMessage]);

  // Store initialization, draft loading, inheritance hydration, topic loading
  const { parentConversationId } = useChatInit({
    conversationId,
    resolvedConversationId,
    resolvedProjectId,
    setResolvedProjectId,
    inheritFromCommitHash,
    onInheritComplete,
  });

  // Auto-scroll to bottom on new messages or streaming content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Extraction handler + related state
  const { handleExtract, isExtracting, draft } = useExtraction({
    resolvedConversationId,
    messages,
  });
  const incrementTurnsSinceLastExtract = useDraftStore((s) => s.incrementTurnsSinceLastExtract);

  // Precompute source map: quote positions in all messages for bidirectional highlighting
  const sourceMapByTurn = useMemo(() => {
    if (!draft || draft.trees.length === 0 || messages.length === 0) {
      return new Map<number, import('@/lib/sourceMap').SourceMapping[]>();
    }
    const msgInput = messages.map((msg, i) => ({
      content: msg.content,
      turnIndex: i + 1,
    }));
    return buildSourceMap(draft, msgInput);
  }, [draft, messages]);

  // Load persistent committed highlights for this conversation
  const committedHighlightsByTurn = useCommittedHighlights(
    resolvedProjectId,
    resolvedConversationId
  );

  // Count turns since last extraction (for nudge badge)
  useEffect(() => {
    const prev = prevTurnsSavedRef.current;
    prevTurnsSavedRef.current = turnsSavedCounter;

    if (turnsSavedCounter === 0 || turnsSavedCounter === prev) return;
    if (!resolvedConversationId) return;

    incrementTurnsSinceLastExtract();
  }, [resolvedConversationId, turnsSavedCounter, incrementTurnsSinceLastExtract]);

  // Listen for extraction request from ExtractionPanel (via custom event)
  useEffect(() => {
    const handler = () => handleExtract();
    window.addEventListener('t3x:extract-requested', handler);
    return () => window.removeEventListener('t3x:extract-requested', handler);
  }, [handleExtract]);

  // Send firstMessage on mount (once only)
  useEffect(() => {
    if (firstMessage && !firstMessageSentRef.current && !isLoading) {
      firstMessageSentRef.current = true;

      if (isNewChat && !resolvedProjectId) {
        pendingMessageRef.current = firstMessage;
        ensureProject(firstMessage).then((projId) => {
          setResolvedProjectId(projId);
          // pendingMessageRef will be flushed by the effect above
        });
      } else {
        sendMessage(firstMessage);
      }
    }
  }, [firstMessage, isLoading, isNewChat, resolvedProjectId, ensureProject, sendMessage]);

  const handleSend = useCallback(
    async (message: string, images?: AttachedImage[]) => {
      if (!resolvedProjectId) {
        pendingMessageRef.current = message;
        const projId = await ensureProject(message);
        setResolvedProjectId(projId);
      } else {
        sendMessage(message, images ? { images } : undefined);
      }
    },
    [resolvedProjectId, ensureProject, sendMessage]
  );

  return (
    <div className={cn('flex flex-col h-full min-h-0 relative', className)}>
      {/* Drift popup overlay */}
      <DriftPopup />

      {/* Header */}
      <ChatHeader
        conversationId={resolvedConversationId ?? null}
        selectedModel={selectedModel}
        onModelChange={handleModelChange}
      />

      {/* Message list */}
      <div ref={chatContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        {/* Parent conversation banner */}
        {parentConversationId && (
          <div className="w-full py-2 bg-[var(--accent-commit)]/5 border-b border-[var(--accent-commit)]/10">
            <div className="mx-auto max-w-3xl px-4 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
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
            <MessageSquarePlus size={40} strokeWidth={1} />
            <p className="text-sm font-medium text-[var(--text-primary)]">No messages yet</p>
            <span className="text-xs text-[var(--text-tertiary)]">
              Type a message below to start the conversation
            </span>
          </div>
        ) : (
          <div className="divide-y divide-[var(--stroke-divider)]/50">
            {messages.map((msg, i) => (
              <ChatMessage
                key={msg.id}
                sender={msg.role}
                content={msg.content}
                turnHash={msg.id}
                turnIndex={i + 1}
                onRegenerate={msg.role === 'assistant' ? () => regenerate(i) : undefined}
                onEdit={
                  msg.role === 'user'
                    ? (newContent: string) => editAndResend(i, newContent)
                    : undefined
                }
                citations={
                  msg.role === 'assistant' && i === messages.length - 1 ? citations : undefined
                }
                sourceMap={sourceMapByTurn.get(i + 1)}
                committedHighlights={committedHighlightsByTurn.get(msg.id)}
              />
            ))}

            {/* Search indicator */}
            {searchQuery && (
              <div className="mx-auto max-w-3xl px-4 py-2 text-xs text-[var(--text-tertiary)] flex items-center gap-2">
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
                <div className="mx-auto max-w-3xl px-4">
                  <div className="flex gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium mt-0.5 bg-gradient-to-br from-[var(--accent-commit)]/20 to-[var(--accent-conversation)]/20 text-[var(--accent-commit)] ring-1 ring-[var(--accent-commit)]/20">
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
                <div className="mx-auto max-w-3xl px-4">
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
                <div className="mx-auto max-w-3xl px-4">
                  <div className="flex items-center gap-2 py-2 px-3.5 bg-[var(--status-warning-muted)] border border-[var(--status-warning)]/20 rounded-lg text-[var(--status-warning)] text-xs">
                    <AlertCircle size={14} />
                    <span>{warning}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Add-to-extraction form (visible in Review phase when text is selected) */}
      {showAddForm && selection && <ChatAddForm selection={selection} onDone={clearSelection} />}

      {/* Input area — centered like messages */}
      <div className="border-t border-[var(--stroke-divider)] shrink-0 py-3">
        <div className="mx-auto max-w-3xl px-4">
          <ChatInput
            onSend={handleSend}
            onStop={stopGenerating}
            isStreaming={isStreaming}
            provider={selectedProvider}
            disabled={isLoading || isExtracting}
            placeholder="Message... (Enter to send, Shift+Enter for new line)"
          />
        </div>
      </div>
    </div>
  );
}
