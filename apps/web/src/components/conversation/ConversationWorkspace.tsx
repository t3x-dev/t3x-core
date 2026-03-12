'use client';

import type { Delta, DeltaSource, SemanticContent } from '@t3x-dev/core';
import {
  AlertCircle,
  Code2,
  Loader2,
  MessageSquarePlus,
  Network,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FrameGraphView } from '@/components/frame-graph';
import { FrameYAMLEditor } from '@/components/frame-graph/FrameYAMLEditor';
import { GateQualityTab } from '@/components/frame-graph/GateQualityTab';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import type { ChatMessage } from '@/hooks/useConversationChat';
import { createDelta, extractFrames, getSemanticDraft } from '@/lib/api';
import type { GateCheckResult } from '@/lib/api/frames';
import { cn } from '@/lib/utils';

// ── Types ──

export interface ConversationWorkspaceProps {
  projectId: string;
  conversationId: string | undefined;
  // Chat props (from useConversationChat return)
  messages: ChatMessage[];
  input: string;
  setInput: (value: string) => void;
  sendMessage: () => void;
  isLoading: boolean;
  isStreaming: boolean;
  streamingContent: string;
  error: string | null;
  warning: string | null;
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMore: () => void;
  // Optional left sidebar content (metadata for modal, nothing for page)
  leftSidebar?: React.ReactNode;
  className?: string;
}

type RightTab = 'graph' | 'yaml' | 'quality';

// ── Helpers ──

function computeDeltaState(delta: Delta) {
  const ds: Record<string, 'added' | 'updated' | 'removed'> = {};
  const us: Record<string, string[]> = {};
  for (const change of delta.changes) {
    if (change.action === 'add') ds[change.frame.id] = 'added';
    else if (change.action === 'update') {
      ds[change.target] = 'updated';
      us[change.target] = Object.keys(change.slots);
    } else if (change.action === 'remove') ds[change.target] = 'removed';
  }
  return { deltaState: ds, updatedSlots: us };
}

// ── Component ──

export function ConversationWorkspace({
  projectId,
  conversationId,
  messages,
  input,
  setInput,
  sendMessage,
  isLoading,
  isStreaming,
  streamingContent,
  error,
  warning,
  hasMore,
  isLoadingMore,
  loadMore,
  leftSidebar,
  className,
}: ConversationWorkspaceProps) {
  // ── Semantic state ──
  const [semanticSnapshot, setSemanticSnapshot] = useState<SemanticContent | null>(null);
  const [deltaState, setDeltaState] = useState<Record<string, 'added' | 'updated' | 'removed'>>({});
  const [updatedSlots, setUpdatedSlots] = useState<Record<string, string[]>>({});
  const [extracting, setExtracting] = useState(false);

  // ── Right panel state ──
  const [activeTab, setActiveTab] = useState<RightTab>('graph');
  const [gateResult, setGateResult] = useState<GateCheckResult | null>(null);

  // ── Refs ──
  const prevMessageCountRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const deltaClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Scroll to bottom on new messages ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Auto-extraction on new messages ──
  useEffect(() => {
    if (!conversationId) return;

    const prevCount = prevMessageCountRef.current;
    const currentCount = messages.length;
    prevMessageCountRef.current = currentCount;

    // Initial load: fetch existing draft
    if (prevCount === 0 && currentCount > 0) {
      getSemanticDraft(conversationId)
        .then((draft) => {
          if (draft && draft.frames.length > 0) {
            setSemanticSnapshot(draft);
          }
        })
        .catch(() => {
          // No existing draft — that's fine
        });
      return;
    }

    // New messages arrived: run extraction
    if (currentCount > prevCount && prevCount > 0) {
      setExtracting(true);
      extractFrames(conversationId)
        .then((result) => {
          setSemanticSnapshot(result.snapshot);
          // Compute delta state for visual indicators
          const { deltaState: ds, updatedSlots: us } = computeDeltaState(result.delta);
          setDeltaState(ds);
          setUpdatedSlots(us);
          // Auto-clear delta indicators after 3s
          if (deltaClearTimerRef.current) clearTimeout(deltaClearTimerRef.current);
          deltaClearTimerRef.current = setTimeout(() => {
            setDeltaState({});
            setUpdatedSlots({});
          }, 3000);
        })
        .catch(() => {
          // Extraction failed silently
        })
        .finally(() => {
          setExtracting(false);
        });
    }
  }, [conversationId, messages.length]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (deltaClearTimerRef.current) clearTimeout(deltaClearTimerRef.current);
    };
  }, []);

  // ── Delta handler for user edits (graph or YAML) ──
  const handleDeltaCreated = useCallback(
    async (delta: Delta, source: DeltaSource) => {
      if (!conversationId) return;
      try {
        await createDelta(conversationId, delta, source);
        const updatedDraft = await getSemanticDraft(conversationId);
        setSemanticSnapshot(updatedDraft);
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('Failed to save delta:', err);
        }
      }
    },
    [conversationId]
  );

  // ── Gate result handler ──
  const handleGateResult = useCallback((result: GateCheckResult) => {
    setGateResult(result);
  }, []);

  // ── Chat key handler ──
  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ── Handle scroll for load-more at top ──
  const handleChatScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.target as HTMLDivElement;
      if (target.scrollTop < 50 && hasMore && !isLoadingMore && !isLoading) {
        loadMore();
      }
    },
    [hasMore, isLoadingMore, isLoading, loadMore]
  );

  // ── Status bar content ──
  const frameCount = semanticSnapshot?.frames.length ?? 0;
  const relationCount = semanticSnapshot?.relations?.length ?? 0;

  // Gate quality dot color
  const gateDotColor = gateResult ? (gateResult.passed ? 'bg-emerald-500' : 'bg-red-500') : null;

  return (
    <div className={cn('flex h-full w-full overflow-hidden', className)}>
      {/* Optional left sidebar (metadata panel for modal usage) */}
      {leftSidebar && (
        <>
          <aside className="min-w-[200px] max-w-[320px] shrink-0 overflow-y-auto bg-[var(--surface-app)]">
            {leftSidebar}
          </aside>
          <div className="w-px bg-[var(--stroke-divider)] shrink-0" />
        </>
      )}

      {/* Left panel: Chat */}
      <div className="flex flex-1 min-w-0 flex-col h-full">
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto p-[var(--space-page)] flex flex-col gap-[var(--space-group)]"
          onScroll={handleChatScroll}
        >
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-center gap-2">
              <Loader2 size={48} strokeWidth={1} className="animate-spin" />
              <p className="text-base font-medium text-muted-foreground">Loading conversation...</p>
            </div>
          ) : messages.length === 0 && !isStreaming ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-center gap-2">
              <MessageSquarePlus size={48} strokeWidth={1} />
              <p className="text-base font-medium text-foreground">No messages yet</p>
              <span className="text-[0.85rem] text-muted-foreground">
                Type a message below to start the conversation
              </span>
            </div>
          ) : (
            <>
              {/* Load more indicator at top */}
              {isLoadingMore && (
                <div className="flex items-center justify-center gap-2 py-3 text-[var(--text-tertiary)] text-[13px]">
                  <Loader2 size={16} className="animate-spin" />
                  <span>Loading older messages...</span>
                </div>
              )}
              {hasMore && !isLoadingMore && (
                <div className="flex items-center justify-center gap-2 py-3 text-[var(--text-tertiary)] text-[13px]">
                  <Button variant="outline" size="sm" onClick={loadMore}>
                    Load older messages
                  </Button>
                </div>
              )}
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    'max-w-[80%] py-3 px-4 rounded-2xl animate-in fade-in slide-in-from-bottom-2 duration-[var(--duration-normal)]',
                    msg.role === 'user'
                      ? 'self-end bg-blue-500 text-white rounded-br-sm'
                      : 'self-start bg-[var(--hover-bg)] text-[var(--text-primary)] rounded-bl-sm'
                  )}
                >
                  <div className="text-[0.9rem] leading-relaxed whitespace-pre-wrap">
                    {msg.content}
                  </div>
                </div>
              ))}
              {/* Streaming response */}
              {isStreaming && streamingContent && (
                <div className="max-w-[80%] self-start py-3 px-4 rounded-2xl rounded-bl-sm bg-[var(--status-info-muted)] text-[var(--text-primary)]">
                  <div className="text-[0.9rem] leading-relaxed whitespace-pre-wrap">
                    {streamingContent}
                    <span className="animate-pulse text-blue-500">{'\u2588'}</span>
                  </div>
                </div>
              )}
              {/* Loading indicator when streaming starts */}
              {isStreaming && !streamingContent && (
                <div className="max-w-[80%] self-start py-3 px-4 rounded-2xl rounded-bl-sm bg-[var(--hover-bg)] text-[var(--text-primary)]">
                  <div className="flex items-center gap-2 text-[var(--text-tertiary)]">
                    <Loader2 size={16} className="animate-spin" />
                    <span>Thinking...</span>
                  </div>
                </div>
              )}
              {/* Chat error */}
              {error && (
                <div className="flex items-center gap-2 py-3 px-4 mx-6 my-2 bg-[var(--status-error-muted)] border border-[var(--status-error)]/20 rounded-lg text-[var(--status-error)] text-[0.85rem]">
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}
              {/* Non-critical warning (auto-dismiss) */}
              {warning && !error && (
                <div className="flex items-center gap-2 py-2 px-4 mx-6 my-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-600 dark:text-amber-400 text-[0.8rem]">
                  <AlertCircle size={14} />
                  <span>{warning}</span>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Chat input */}
        <div className="px-6 py-4 border-t border-[var(--stroke-divider)] bg-[var(--surface-app)] flex gap-3 items-end">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleChatKeyDown}
            placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
            rows={3}
            disabled={isStreaming || isLoading}
            className="flex-1 resize-none"
          />
          <Button
            size="icon"
            onClick={sendMessage}
            disabled={!input.trim() || isStreaming || isLoading}
            className="h-11 w-11 rounded-xl shrink-0"
          >
            {isStreaming || isLoading ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <Send size={20} />
            )}
          </Button>
        </div>
      </div>

      {/* Divider */}
      <div className="w-px bg-[var(--stroke-divider)] shrink-0" />

      {/* Right panel: Tabbed (Graph / YAML / Quality) */}
      <div className="flex flex-col w-[45%] min-w-[360px] shrink-0 h-full">
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as RightTab)}
          className="flex flex-col h-full"
        >
          {/* Tab header with status */}
          <div className="flex items-center justify-between border-b border-[var(--stroke-divider)] px-3 shrink-0">
            <TabsList className="bg-transparent h-10">
              <TabsTrigger value="graph" className="gap-1.5 text-xs">
                <Network size={14} />
                Graph
              </TabsTrigger>
              <TabsTrigger value="yaml" className="gap-1.5 text-xs">
                <Code2 size={14} />
                YAML
              </TabsTrigger>
              <TabsTrigger value="quality" className="gap-1.5 text-xs relative">
                <ShieldCheck size={14} />
                Quality
                {gateDotColor && (
                  <span
                    className={cn(
                      'absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full',
                      gateDotColor
                    )}
                  />
                )}
              </TabsTrigger>
            </TabsList>
            {/* Frame/relation count */}
            {semanticSnapshot && frameCount > 0 && (
              <span className="text-[11px] text-[var(--text-tertiary)] tabular-nums">
                {frameCount} frame{frameCount !== 1 ? 's' : ''}
                {relationCount > 0 && (
                  <>
                    {' \u00B7 '}
                    {relationCount} relation{relationCount !== 1 ? 's' : ''}
                  </>
                )}
              </span>
            )}
          </div>

          {/* Graph tab */}
          <TabsContent value="graph" className="flex-1 min-h-0 m-0 relative">
            {extracting && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 size={16} className="animate-spin" />
                  <span>Extracting frames...</span>
                </div>
              </div>
            )}
            {semanticSnapshot && frameCount > 0 ? (
              <FrameGraphView
                content={semanticSnapshot}
                deltaState={Object.keys(deltaState).length > 0 ? deltaState : undefined}
                updatedSlots={Object.keys(updatedSlots).length > 0 ? updatedSlots : undefined}
                onDeltaCreated={handleDeltaCreated}
                className="h-full"
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                <Network size={40} strokeWidth={1} className="opacity-40" />
                <p className="text-sm font-medium">No frames yet</p>
                <p className="text-xs text-center max-w-[240px]">
                  Start a conversation and frames will be extracted automatically.
                </p>
              </div>
            )}
          </TabsContent>

          {/* YAML tab */}
          <TabsContent value="yaml" className="flex-1 min-h-0 m-0 p-3">
            {semanticSnapshot && frameCount > 0 ? (
              <FrameYAMLEditor
                content={semanticSnapshot}
                onDeltaCreated={handleDeltaCreated}
                className="h-full"
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                <Code2 size={40} strokeWidth={1} className="opacity-40" />
                <p className="text-sm font-medium">No frames to edit</p>
                <p className="text-xs text-center max-w-[240px]">
                  Frames will appear here as YAML once extracted from the conversation.
                </p>
              </div>
            )}
          </TabsContent>

          {/* Quality tab */}
          <TabsContent value="quality" className="flex-1 min-h-0 m-0">
            {conversationId ? (
              <GateQualityTab
                conversationId={conversationId}
                projectId={projectId}
                snapshot={semanticSnapshot}
                onLocateFrame={() => setActiveTab('graph')}
                onSwitchToFrames={() => setActiveTab('graph')}
                onGateResult={handleGateResult}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                <ShieldCheck size={40} strokeWidth={1} className="opacity-40" />
                <p className="text-sm font-medium">No conversation yet</p>
                <p className="text-xs text-center max-w-[240px]">
                  Start a conversation to enable quality checks.
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
