'use client';

import { AlertCircle, Loader2, MessageSquarePlus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAutoProject } from '@/hooks/useAutoProject';
import { useConversationChat } from '@/hooks/useConversationChat';
import { extractFrames, getSemanticDraft, listDeltas } from '@/lib/api/frames';
import { getIntentSummary } from '@/lib/intentSummary';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/chatStore';
import { useExtractionPanelStore } from '@/store/extractionPanelStore';
import { useSessionStore } from '@/store/sessionStore';
import { ChatHeader } from './ChatHeader';
import { ChatInput } from './ChatInput';
import { ChatMessage } from './ChatMessage';
import { DriftPopup } from './DriftPopup';
import { listTopics } from '@/lib/api/topics';

interface ChatWorkspaceProps {
  conversationId: string;
  projectId?: string;
  firstMessage?: string;
  className?: string;
  /** Called when a new conversation is created (e.g. from /chat/new). Overrides default URL update. */
  onConversationCreated?: (conversationId: string) => void;
}

export function ChatWorkspace({
  conversationId,
  projectId,
  firstMessage,
  className,
  onConversationCreated: onConversationCreatedProp,
}: ChatWorkspaceProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const firstMessageSentRef = useRef(false);
  const prevTurnsSavedRef = useRef(0);
  const extractionInFlightRef = useRef<Promise<void> | null>(null);
  const pendingExtractionRef = useRef(false);

  // For "/chat/new" routes: auto-create project + conversation
  const isNewChat = conversationId === 'new';
  const { ensureProject } = useAutoProject();
  const [resolvedProjectId, setResolvedProjectId] = useState(projectId ?? '');
  const [resolvedConversationId, setResolvedConversationId] = useState<string | undefined>(
    isNewChat ? undefined : conversationId
  );
  const pendingMessageRef = useRef<string | null>(null);

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
    turnsSavedCounter,
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

  // Sync active conversation + session into stores; load existing draft
  useEffect(() => {
    const convId = resolvedConversationId ?? conversationId;
    useChatStore.getState().setActiveConversation(convId, resolvedProjectId || null);
    useExtractionPanelStore.getState().setConversationId(convId === 'new' ? null : convId);
    if (resolvedProjectId) {
      useSessionStore.getState().setLastSession(resolvedProjectId, convId);
    }

    useExtractionPanelStore.getState().setProjectId(resolvedProjectId || null);

    // Initialize commit state (load branch head)
    if (resolvedProjectId) {
      useExtractionPanelStore.getState().initCommitState(resolvedProjectId);
    }

    // If no project ID yet, try to get it from the conversation
    if (!resolvedProjectId && convId && convId !== 'new') {
      import('@/lib/api').then(({ getConversation }) => {
        getConversation(convId)
          .then((conv) => {
            if (conv?.project_id) {
              setResolvedProjectId(conv.project_id);
              useExtractionPanelStore.getState().setProjectId(conv.project_id);
              useExtractionPanelStore.getState().initCommitState(conv.project_id);
              useChatStore.getState().setActiveConversation(convId, conv.project_id);
            }
          })
          .catch(() => {});
      });
    }

    // Draft loading moved to activeTopicId effect below
  }, [conversationId, resolvedConversationId, resolvedProjectId]);

  // Load topics + draft + deltas when conversation changes
  const activeTopicId = useExtractionPanelStore((s) => s.activeTopicId);
  useEffect(() => {
    const convId = resolvedConversationId;
    if (!convId || convId === 'new') return;

    // Load everything in parallel
    Promise.all([
      listTopics(convId),
      getSemanticDraft(convId),
      listDeltas(convId),
    ])
      .then(([topics, draft, deltas]) => {
        const store = useExtractionPanelStore.getState();

        // Set topics
        store.setTopics(topics ?? []);
        if (topics && topics.length > 0 && !store.activeTopicId) {
          const active = topics.find((t: any) => t.status === 'active') ?? topics[0];
          store.setActiveTopicId(active.id);
        }

        // Set draft
        store.setDraft(draft ?? { frames: [], relations: [] });
        if (draft && draft.frames.length > 0 && store.panelMode === 'collapsed') {
          store.setPanelMode('default');
        }

        // Set delta log
        store.hydrateDeltaLog(deltas ?? []);
      })
      .catch(() => {});
  }, [resolvedConversationId]);

  // Auto-scroll to bottom on new messages or streaming content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const focusIntentEnabled = useExtractionPanelStore((s) => s.focusIntentEnabled);
  const setLlmHighlightedFrameIds = useExtractionPanelStore((s) => s.setLlmHighlightedFrameIds);
  const isExtracting = useExtractionPanelStore((s) => s.isExtracting);

  // Extract frames after turns are saved — queued to prevent duplicate concurrent extractions
  useEffect(() => {
    const prev = prevTurnsSavedRef.current;
    prevTurnsSavedRef.current = turnsSavedCounter;

    if (turnsSavedCounter === 0 || turnsSavedCounter === prev) return;
    const convId = resolvedConversationId;
    if (!convId) return;

    const runExtraction = async () => {
      const store = useExtractionPanelStore.getState();
      store.setExtracting(true);
      try {
        const topicId = store.activeTopicId ?? undefined;
        const result = await extractFrames(convId, undefined, topicId);

        // Check for drift detection before applying delta
        if (result.status === 'drift_detected' && result.drift_info) {
          useExtractionPanelStore.getState().setDriftDetected(result.drift_info);
          return;
        }

        const s = useExtractionPanelStore.getState();
        s.applyDelta(result.delta, 'llm_extraction');
        if (result.snapshot.frames.length > 0 && s.panelMode === 'collapsed') {
          s.setPanelMode('default');
        }
        if (focusIntentEnabled && result.snapshot.frames.length > 0) {
          const controller = new AbortController();
          getIntentSummary(result.snapshot.frames, controller.signal)
            .then((intentResult) => setLlmHighlightedFrameIds(intentResult.coreFrameIds))
            .catch(() => {});
        }

        // Reload topics after extraction (API may have auto-created a topic)
        // Also update topic name to match root frame type if it changed
        listTopics(convId).then(async (topics) => {
          const st = useExtractionPanelStore.getState();
          st.setTopics(topics);
          if (topics.length > 0 && !st.activeTopicId) {
            const active = topics.find((t) => t.status === 'active') ?? topics[0];
            st.setActiveTopicId(active.id);
          }
          // Sync topic name with root frame type
          const activeTopic = topics.find((t) => t.id === st.activeTopicId);
          if (activeTopic && result.snapshot?.frames?.length > 0) {
            const rootFrame = result.snapshot.frames[0];
            if (rootFrame?.type && rootFrame.type !== activeTopic.name && activeTopic.name === 'new_topic') {
              const { updateTopicApi } = await import('@/lib/api/topics');
              updateTopicApi(activeTopic.id, { name: rootFrame.type }).then(() => {
                st.setTopics(topics.map((t) => t.id === activeTopic.id ? { ...t, name: rootFrame.type } : t));
              }).catch(() => {});
            }
          }
        }).catch(() => {});
      } catch {
        // Extraction failed silently — non-critical
      } finally {
        useExtractionPanelStore.getState().setExtracting(false);
      }
    };

    // Queue: if extraction is in flight, mark pending and wait
    if (extractionInFlightRef.current) {
      pendingExtractionRef.current = true;
      return;
    }

    const run = async () => {
      await runExtraction();
      // After finishing, check if another extraction was requested while we were running
      while (pendingExtractionRef.current) {
        pendingExtractionRef.current = false;
        await runExtraction();
      }
      extractionInFlightRef.current = null;
    };

    extractionInFlightRef.current = run();
  }, [resolvedConversationId, turnsSavedCounter, focusIntentEnabled, setLlmHighlightedFrameIds]);

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
    async (message: string) => {
      if (!resolvedProjectId) {
        pendingMessageRef.current = message;
        const projId = await ensureProject(message);
        setResolvedProjectId(projId);
      } else {
        sendMessage(message);
      }
    },
    [resolvedProjectId, ensureProject, sendMessage]
  );

  return (
    <div className={cn('relative flex flex-col h-full min-h-0', className)}>
      {/* Header */}
      <ChatHeader
        conversationId={resolvedConversationId ?? null}
        selectedModel={selectedModel}
        onModelChange={handleModelChange}
      />

      {/* Drift detection popup */}
      <DriftPopup />

      {/* Message list */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {isLoading ? (
          <div className="flex h-full flex-col items-center justify-center text-muted-foreground gap-2">
            <Loader2 size={40} strokeWidth={1} className="animate-spin" />
            <p className="text-sm font-medium">Loading conversation...</p>
          </div>
        ) : messages.length === 0 && !isStreaming ? (
          <div className="flex h-full flex-col items-center justify-center text-muted-foreground gap-2">
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
              />
            ))}

            {/* Streaming response */}
            {isStreaming && streamingContent && (
              <ChatMessage sender="assistant" content={streamingContent} isStreaming />
            )}

            {/* Waiting indicator */}
            {isStreaming && !streamingContent && (
              <div className="w-full py-4">
                <div className="mx-auto max-w-3xl px-4">
                  <div className="flex gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium mt-0.5 bg-gradient-to-br from-[var(--accent-commit)]/20 to-indigo-500/20 text-[var(--accent-commit)] ring-1 ring-[var(--accent-commit)]/20">
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
                  <div className="flex items-center gap-2 py-2 px-3.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-600 dark:text-amber-400 text-xs">
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

      {/* Input area — centered like messages */}
      <div className="border-t border-[var(--stroke-divider)] shrink-0 py-3">
        <div className="mx-auto max-w-3xl px-4">
          <ChatInput
            onSend={handleSend}
            disabled={isStreaming || isLoading || isExtracting}
            placeholder={isExtracting ? "Updating knowledge tree..." : "Message... (Enter to send, Shift+Enter for new line)"}
          />
        </div>
      </div>
    </div>
  );
}
