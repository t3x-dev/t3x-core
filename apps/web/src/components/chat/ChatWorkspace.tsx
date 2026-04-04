'use client';

import type { TreeNode } from '@t3x-dev/core';
import { AlertCircle, GitCommit, Loader2, MessageSquarePlus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { DriftPopup } from '@/components/chat/DriftPopup';
import { useAutoProject } from '@/hooks/useAutoProject';
import { useCommittedHighlights } from '@/hooks/useCommittedHighlights';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { useConversationChat } from '@/hooks/useConversationChat';
import { useTextSelection } from '@/hooks/useTextSelection';
import { getCommitAsNodes } from '@/lib/api/commitUnified';
import { listTopics, updateTopicApi } from '@/lib/api/topics';
import { extractNodes, getSemanticDraft, listYOpsLog } from '@/lib/api/trees';
import { getIntentSummary } from '@/lib/intentSummary';
import { buildSourceMap } from '@/lib/sourceMap';
import { treesToNodes } from '@/lib/treeCompat';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/chatStore';
import { useCommitStore } from '@/store/commitStore';
import { useDraftStore } from '@/store/draftStore';
import { useHoverStore } from '@/store/hoverStore';
import { usePhaseStore } from '@/store/phaseStore';
import { useSessionStore } from '@/store/sessionStore';
import { ChatAddForm } from './ChatAddForm';
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

  // Track whether inheritance hydration has been done (prevents re-hydration loop)
  const inheritedRef = useRef(false);
  // Parent conversation link (for child conversations created via "Create Unit")
  const [parentConversationId, setParentConversationId] = useState<string | null>(null);

  // Sync active conversation + session into stores; load existing draft
  useEffect(() => {
    const convId = resolvedConversationId ?? conversationId;
    useChatStore.getState().setActiveConversation(convId, resolvedProjectId || null);
    // Skip resetDraft if we just hydrated from parent (prevents wipe on re-render)
    if (!inheritedRef.current) {
      useDraftStore.getState().resetDraft();
    }
    useDraftStore.getState().setConversationId(convId === 'new' ? null : convId);
    if (resolvedProjectId) {
      useSessionStore.getState().setLastSession(resolvedProjectId, convId);
    }

    useCommitStore.getState().setProjectId(resolvedProjectId || null);

    // Initialize commit state (load branch head) — skip when inheriting
    // because inheritance sets lastCommitHash to the parent commit hash
    if (resolvedProjectId && !inheritFromCommitHash) {
      useCommitStore.getState().initCommitState(resolvedProjectId);
    }

    // If no project ID yet, try to get it from the conversation
    if (!resolvedProjectId && convId && convId !== 'new') {
      import('@/lib/api').then(({ getConversation }) => {
        getConversation(convId)
          .then((conv) => {
            if (conv?.project_id) {
              setResolvedProjectId(conv.project_id);
              useCommitStore.getState().setProjectId(conv.project_id);
              if (!inheritFromCommitHash) {
                useCommitStore.getState().initCommitState(conv.project_id);
              }
              useChatStore.getState().setActiveConversation(convId, conv.project_id);
            }
          })
          .catch(() => {});
      });
    }

    // Helper: hydrate extraction panel from parent commit
    const hydrateFromParent = (hash: string) => {
      getCommitAsNodes(hash)
        .then((parentCommit) => {
          // Extract parent conversation ID for "View parent" link
          const sources = (parentCommit as { sources?: Array<{ type?: string; id?: string }> })
            .sources;
          const parentConvSource = sources?.find((s) => s.type === 'conversation');
          if (parentConvSource?.id) {
            setParentConversationId(parentConvSource.id);
          }
          const trees = (parentCommit.content?.trees as TreeNode[]) ?? [];
          const relations = parentCommit.content?.relations ?? [];
          if (trees.length > 0) {
            useDraftStore.getState().setDraft({ trees, relations });
            // Set parent as lastCommitHash so commit B gets correct parent_hashes
            useCommitStore.setState({ lastCommitHash: hash });
            // Mark all inherited trees as confirmed
            const confirmed: Record<string, boolean> = {};
            const nodes = treesToNodes(trees);
            for (const f of nodes) {
              confirmed[f.id] = true;
            }
            useCommitStore.setState({ confirmedNodeIds: confirmed });
            if (usePhaseStore.getState().panelMode === 'collapsed') {
              usePhaseStore.getState().setPanelMode('default');
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

    // Load existing semantic draft + full yops history + topics for this conversation
    if (convId && convId !== 'new') {
      Promise.all([getSemanticDraft(convId), listYOpsLog(convId), listTopics(convId)])
        .then(([draft, yopsEntries, topicsList]) => {
          if (draft && draft.trees.length > 0) {
            useDraftStore.getState().setDraft(draft);
            if (usePhaseStore.getState().panelMode === 'collapsed') {
              usePhaseStore.getState().setPanelMode('default');
            }
          } else if (inheritFromCommitHash) {
            // No existing draft — hydrate from parent commit
            hydrateFromParent(inheritFromCommitHash);
          }
          if (yopsEntries && yopsEntries.length > 0) {
            useDraftStore.getState().hydrateYOpsLog(yopsEntries);
          }
          // Note: we intentionally do NOT lock conversation after commit.
          // Users should be able to continue chatting and extract more knowledge.
          if (topicsList && topicsList.length > 0) {
            useDraftStore.getState().setTopics(topicsList);
            // Auto-select the first active topic
            const activeTopic = topicsList.find((t) => t.status === 'active');
            if (activeTopic) {
              useDraftStore.getState().setActiveTopicId(activeTopic.id);
            }
          }
        })
        .catch(() => {
          // Draft/delta/topics load failed — non-critical
        });
    } else if (inheritFromCommitHash) {
      // New conversation with inheritance — hydrate from parent commit
      useCommitStore.getState().setProjectId(resolvedProjectId || null);
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

  const isExtracting = useDraftStore((s) => s.isExtracting);
  const focusIntentEnabled = useHoverStore((s) => s.focusIntentEnabled);
  const setLlmHighlightedNodeIds = useHoverStore((s) => s.setLlmHighlightedNodeIds);
  const draft = useDraftStore((s) => s.draft);
  const activeTopicId = useDraftStore((s) => s.activeTopicId);
  const startExtraction = useDraftStore((s) => s.startExtraction);
  const setNodeSourceTags = useDraftStore((s) => s.setNodeSourceTags);
  const setDraft = useDraftStore((s) => s.setDraft);
  const setDriftDetected = usePhaseStore((s) => s.setDriftDetected);
  const setAdvisoryQuestions = usePhaseStore((s) => s.setAdvisoryQuestions);
  const setGateIssues = usePhaseStore((s) => s.setGateIssues);
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

  // User-initiated extraction callback (called by ExtractionPanel's Extract button)
  const handleExtract = useCallback(async () => {
    // Use resolved ID, or fallback to store's active conversation
    const extractConvId =
      resolvedConversationId ?? useChatStore.getState().activeConversationId ?? undefined;
    if (!extractConvId || isExtracting) return;

    startExtraction();

    // Expand panel if collapsed
    if (usePhaseStore.getState().panelMode === 'collapsed') {
      usePhaseStore.getState().setPanelMode('default');
    }

    try {
      const result = await extractNodes(
        extractConvId,
        undefined,
        undefined,
        activeTopicId ? { topicId: activeTopicId } : undefined
      );

      if (result.status === 'skipped') {
        usePhaseStore.getState().setPhase('idle');
        useDraftStore.setState({ isExtracting: false });
        toast.info(
          result.reason || 'Not enough new content to extract. Continue the conversation first.'
        );
        return;
      }

      if (result.status === 'drift_detected') {
        setDriftDetected(
          result.drift ?? { new_topic: 'New topic' },
          result.choices ?? ['keep_current', 'switch_topic']
        );
        useDraftStore.setState({ isExtracting: false });
        usePhaseStore.getState().setPhase('idle');
        return;
      }

      // status === 'completed'
      if (result.snapshot) {
        setDraft(result.snapshot);
      }

      // delta is YOp[]
      const rawDelta = result.delta;
      const deltaOps: unknown[] | undefined = Array.isArray(rawDelta) ? rawDelta : undefined;

      if (deltaOps && deltaOps.length > 0) {
        // Has delta ops — show YOps feed animation first
        useDraftStore.setState({ feedYops: deltaOps, isExtracting: false });
        // Now that ops are loaded, switch phase to yops for feed animation
        usePhaseStore.getState().setPhase('yops');

        // Derive source tags
        const { deriveSourceTags } = await import('@/lib/sourceTag');
        const tags = deriveSourceTags(
          deltaOps as import('@t3x-dev/core').YOp[],
          messages.map((m) => ({ role: m.role }))
        );
        setNodeSourceTags(tags);

        // Auto-accept USER-sourced nodes via triageStore
        const { useTriageStore } = await import('@/store/triageStore');
        for (const [key, tag] of Object.entries(tags)) {
          if (tag === 'user' || tag === 'both') {
            useTriageStore.getState().acceptItem(key);
          }
        }
      } else {
        // No delta ops — skip YOps feed, go straight to triage
        usePhaseStore.getState().setPhase('triage');
        useDraftStore.setState({ isExtracting: false });
      }

      if (result.advisory_questions) {
        setAdvisoryQuestions(result.advisory_questions);
      }

      if (result.gate_result) {
        const gate = result.gate_result as {
          semantic?: {
            issues?: Array<{
              tree_id?: string;
              severity: 'error' | 'warning' | 'info';
              description: string;
            }>;
          };
        };
        if (gate.semantic?.issues) {
          const issuesByNode: Record<
            string,
            { severity: 'error' | 'warning' | 'info'; description: string }[]
          > = {};
          for (const issue of gate.semantic.issues) {
            if (issue.tree_id) {
              if (!issuesByNode[issue.tree_id]) issuesByNode[issue.tree_id] = [];
              issuesByNode[issue.tree_id].push({
                severity: issue.severity,
                description: issue.description,
              });
            }
          }
          setGateIssues(issuesByNode);
        }
      }

      // Reload topics after extraction (new topic may have been auto-created)
      listTopics(extractConvId)
        .then((topicsList) => {
          const ds = useDraftStore.getState();
          ds.setTopics(topicsList);
          // Auto-sync topic name with root tree type
          if (result.snapshot && result.snapshot.trees.length > 0 && topicsList.length > 0) {
            const rootType = result.snapshot.trees[0].key;
            const currentTopic = topicsList.find((t) => t.id === ds.activeTopicId);
            if (currentTopic && currentTopic.name !== rootType) {
              updateTopicApi(currentTopic.id, { name: rootType }).catch(() => {});
              ds.setTopics(
                topicsList.map((t) => (t.id === currentTopic.id ? { ...t, name: rootType } : t))
              );
            }
          }
        })
        .catch(() => {});

      if (focusIntentEnabled && result.snapshot && result.snapshot.trees.length > 0) {
        const controller = new AbortController();
        getIntentSummary(result.snapshot.trees, controller.signal)
          .then((intentResult) => {
            const ids: Record<string, boolean> = {};
            for (const id of intentResult.coreNodeIds) ids[id] = true;
            setLlmHighlightedNodeIds(ids);
          })
          .catch(() => {});
      }
    } catch (_err) {
      usePhaseStore.getState().setPhase('idle');
      useDraftStore.setState({ isExtracting: false });
    }
  }, [
    resolvedConversationId,
    isExtracting,
    activeTopicId,
    messages,
    startExtraction,
    setNodeSourceTags,
    setDraft,
    setDriftDetected,
    setAdvisoryQuestions,
    setGateIssues,
    focusIntentEnabled,
    setLlmHighlightedNodeIds,
  ]);

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
