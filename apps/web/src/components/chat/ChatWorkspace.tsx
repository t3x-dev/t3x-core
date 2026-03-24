'use client';

import type { Frame } from '@t3x-dev/core';
import { AlertCircle, GitCommit, Loader2, MessageSquarePlus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DriftPopup } from '@/components/chat/DriftPopup';
import { useAutoProject } from '@/hooks/useAutoProject';
import { useConversationChat } from '@/hooks/useConversationChat';
import { getCommitAsFrames } from '@/lib/api/commitUnified';
import { extractFrames, getSemanticDraft, listDeltas } from '@/lib/api/frames';
import { listTopics, updateTopicApi } from '@/lib/api/topics';
import { getIntentSummary } from '@/lib/intentSummary';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/chatStore';
import { useExtractionPanelStore } from '@/store/extractionPanelStore';
import { useSessionStore } from '@/store/sessionStore';
import { ChatHeader } from './ChatHeader';
import type { AttachedImage } from './ChatInput';
import { ChatInput } from './ChatInput';
import { ChatMessage } from './ChatMessage';

interface ChatWorkspaceProps {
  conversationId: string;
  projectId?: string;
  firstMessage?: string;
  className?: string;
  /** Called when a new conversation is created (e.g. from /chat/new). Overrides default URL update. */
  onConversationCreated?: (conversationId: string) => void;
  /** Parent commit hash — if set, hydrate extraction panel with parent's frames */
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

  // Track whether inheritance hydration has been done (prevents re-hydration loop)
  const inheritedRef = useRef(false);
  // Lock conversation input after a commit has been made from it
  const [isConversationCommitted, setIsConversationCommitted] = useState(false);
  // Parent conversation link (for child conversations created via "Create Unit")
  const [parentConversationId, setParentConversationId] = useState<string | null>(null);

  // Sync active conversation + session into stores; load existing draft
  useEffect(() => {
    const convId = resolvedConversationId ?? conversationId;
    useChatStore.getState().setActiveConversation(convId, resolvedProjectId || null);
    // Skip resetDraft if we just hydrated from parent (prevents wipe on re-render)
    if (!inheritedRef.current) {
      useExtractionPanelStore.getState().resetDraft();
    }
    useExtractionPanelStore.getState().setConversationId(convId === 'new' ? null : convId);
    if (resolvedProjectId) {
      useSessionStore.getState().setLastSession(resolvedProjectId, convId);
    }

    useExtractionPanelStore.getState().setProjectId(resolvedProjectId || null);

    // Initialize commit state (load branch head) — skip when inheriting
    // because inheritance sets lastCommitHash to the parent commit hash
    if (resolvedProjectId && !inheritFromCommitHash) {
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
              if (!inheritFromCommitHash) {
                useExtractionPanelStore.getState().initCommitState(conv.project_id);
              }
              useChatStore.getState().setActiveConversation(convId, conv.project_id);
            }
          })
          .catch(() => {});
      });
    }

    // Helper: hydrate extraction panel from parent commit
    const hydrateFromParent = (hash: string) => {
      getCommitAsFrames(hash)
        .then((parentCommit) => {
          // Extract parent conversation ID for "View parent" link
          const sources = (parentCommit as { sources?: Array<{ type?: string; id?: string }> })
            .sources;
          const parentConvSource = sources?.find((s) => s.type === 'conversation');
          if (parentConvSource?.id) {
            setParentConversationId(parentConvSource.id);
          }
          const store = useExtractionPanelStore.getState();
          const frames = (parentCommit.content?.frames as Frame[]) ?? [];
          const relations = parentCommit.content?.relations ?? [];
          if (frames.length > 0) {
            store.setDraft({ frames, relations });
            // Set parent as lastCommitHash so commit B gets correct parent_hashes
            useExtractionPanelStore.setState({ lastCommitHash: hash });
            // Mark all inherited frames as confirmed
            const confirmed: Record<string, boolean> = {};
            for (const f of frames) {
              confirmed[f.id] = true;
            }
            useExtractionPanelStore.setState({ confirmedFrameIds: confirmed });
            if (store.panelMode === 'collapsed') {
              store.setPanelMode('default');
            }
          }
          // Mark as hydrated so resetDraft() is skipped on re-render
          inheritedRef.current = true;
          // Clear the flag to prevent re-hydration on remount
          onInheritComplete?.();
        })
        .catch(() => {
          // Parent fetch failed — fall back to empty panel
        });
    };

    // Load existing semantic draft + full delta history + topics for this conversation
    if (convId && convId !== 'new') {
      Promise.all([getSemanticDraft(convId), listDeltas(convId), listTopics(convId)])
        .then(([draft, deltas, topicsList]) => {
          const store = useExtractionPanelStore.getState();
          if (draft && draft.frames.length > 0) {
            store.setDraft(draft);
            if (store.panelMode === 'collapsed') {
              store.setPanelMode('default');
            }
          } else if (inheritFromCommitHash) {
            // No existing draft — hydrate from parent commit
            hydrateFromParent(inheritFromCommitHash);
          }
          if (deltas && deltas.length > 0) {
            store.hydrateDeltaLog(deltas);
            // Lock input if a commit was made from this conversation
            if (deltas.some((d: { source?: string }) => d.source === 'commit_marker')) {
              setIsConversationCommitted(true);
            }
          }
          if (topicsList && topicsList.length > 0) {
            store.setTopics(topicsList);
            // Auto-select the first active topic
            const activeTopic = topicsList.find((t) => t.status === 'active');
            if (activeTopic) {
              store.setActiveTopicId(activeTopic.id);
            }
          }
        })
        .catch(() => {
          // Draft/delta/topics load failed — non-critical
        });
    } else if (inheritFromCommitHash) {
      // New conversation with inheritance — hydrate from parent commit
      useExtractionPanelStore.getState().setProjectId(resolvedProjectId || null);
      hydrateFromParent(inheritFromCommitHash);
    }
  }, [
    conversationId,
    resolvedConversationId,
    resolvedProjectId,
    inheritFromCommitHash,
    // Note: onInheritComplete intentionally excluded — including it causes a
    // resetDraft → hydrate → onInheritComplete → resetDraft wipe cycle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ]);

  // Auto-scroll to bottom on new messages or streaming content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const isExtracting = useExtractionPanelStore((s) => s.isExtracting);
  const focusIntentEnabled = useExtractionPanelStore((s) => s.focusIntentEnabled);
  const setLlmHighlightedFrameIds = useExtractionPanelStore((s) => s.setLlmHighlightedFrameIds);

  // Extract frames after turns are saved
  useEffect(() => {
    const prev = prevTurnsSavedRef.current;
    prevTurnsSavedRef.current = turnsSavedCounter;

    if (turnsSavedCounter === 0 || turnsSavedCounter === prev) return;
    const convId = resolvedConversationId;
    if (!convId) return;

    const store = useExtractionPanelStore.getState();
    store.setExtracting(true);

    const activeTopicId = store.activeTopicId;
    extractFrames(
      convId,
      undefined,
      undefined,
      activeTopicId ? { topicId: activeTopicId } : undefined
    )
      .then((result) => {
        const s = useExtractionPanelStore.getState();

        // Handle pipeline response status
        if (result.status === 'skipped') {
          // ReadinessGate or SessionStateManager blocked — nothing to do
          return;
        }

        if (result.status === 'drift_detected') {
          if (result.drift && result.choices) {
            s.setDriftDetected(result.drift, result.choices);
          }
          return;
        }

        // status === 'completed' — normal flow
        if (result.delta) {
          s.applyDelta(result.delta, 'pipeline');
        }
        if (result.snapshot && result.snapshot.frames.length > 0 && s.panelMode === 'collapsed') {
          s.setPanelMode('default');
        }

        // Store advisory questions (Step 6)
        if (result.advisory_questions?.length) {
          s.setAdvisoryQuestions(result.advisory_questions);
        }

        // Store gate issues for frame annotation (Step 5)
        if (result.gate_result?.semantic?.issues) {
          const issuesByFrame: Record<
            string,
            { severity: 'error' | 'warning' | 'info'; description: string }[]
          > = {};
          for (const issue of result.gate_result.semantic.issues) {
            if (issue.frame_id) {
              if (!issuesByFrame[issue.frame_id]) issuesByFrame[issue.frame_id] = [];
              issuesByFrame[issue.frame_id].push({
                severity: issue.severity,
                description: issue.description,
              });
            }
          }
          s.setGateIssues(issuesByFrame);
        }

        // Reload topics after extraction (new topic may have been auto-created)
        listTopics(convId)
          .then((topicsList) => {
            const s2 = useExtractionPanelStore.getState();
            s2.setTopics(topicsList);
            // Auto-sync topic name with root frame type
            if (result.snapshot && result.snapshot.frames.length > 0 && topicsList.length > 0) {
              const rootType = result.snapshot.frames[0].type;
              const currentTopic = topicsList.find((t) => t.id === s2.activeTopicId);
              if (currentTopic && currentTopic.name !== rootType) {
                updateTopicApi(currentTopic.id, { name: rootType }).catch(() => {});
                s2.setTopics(
                  topicsList.map((t) => (t.id === currentTopic.id ? { ...t, name: rootType } : t))
                );
              }
            }
          })
          .catch(() => {});

        if (focusIntentEnabled && result.snapshot && result.snapshot.frames.length > 0) {
          const controller = new AbortController();
          getIntentSummary(result.snapshot.frames, controller.signal)
            .then((intentResult) => setLlmHighlightedFrameIds(intentResult.coreFrameIds))
            .catch(() => {}); // Silent fallback - degrades to deterministic-only
        }
      })
      .catch(() => {
        // Extraction failed silently — non-critical
      })
      .finally(() => {
        useExtractionPanelStore.getState().setExtracting(false);
      });
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
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
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
                onRegenerate={msg.role === 'assistant' ? () => regenerate(i) : undefined}
                onEdit={
                  msg.role === 'user'
                    ? (newContent: string) => editAndResend(i, newContent)
                    : undefined
                }
                citations={
                  msg.role === 'assistant' && i === messages.length - 1 ? citations : undefined
                }
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
            onStop={stopGenerating}
            isStreaming={isStreaming}
            provider={selectedProvider}
            disabled={isLoading || isExtracting || isConversationCommitted}
            placeholder={
              isConversationCommitted
                ? 'This conversation is locked — a commit was made from it'
                : 'Message... (Enter to send, Shift+Enter for new line)'
            }
          />
        </div>
      </div>
    </div>
  );
}
