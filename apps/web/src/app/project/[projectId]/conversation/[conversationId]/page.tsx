'use client';

import type { Delta, SemanticContent } from '@t3x/core';
import { ArrowLeft, MessageSquare, MessagesSquare, Network } from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { forwardRef, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ErrorMessage, LoadingSpinner } from '@/components/ApiStatus';
import { AddToDraftButton } from '@/components/conversation/AddToDraftButton';
import { ContextPanelWrapper } from '@/components/conversation/ContextPanelWrapper';
import { SemanticPanel } from '@/components/conversation/SemanticPanel';
import { Breadcrumb } from '@/components/shared/Breadcrumb';
import { parseHighlightParam } from '@/components/shared/ViewSourceLink';
import { Button } from '@/components/ui/button';
import { PinButton } from '@/components/ui/PinButton';
import { useTextSelection } from '@/hooks/useTextSelection';
import type { Conversation, Turn } from '@/lib/api';
import { extractFrames, getConversation, getSemanticDraft, listTurns } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useProjectStore } from '@/store/projectStore';

export default function ConversationPage() {
  return (
    <Suspense>
      <ConversationPageContent />
    </Suspense>
  );
}

function computeDeltaState(delta: Delta): {
  deltaState: Record<string, 'added' | 'updated' | 'removed'>;
  updatedSlots: Record<string, string[]>;
} {
  const ds: Record<string, 'added' | 'updated' | 'removed'> = {};
  const us: Record<string, string[]> = {};
  for (const change of delta.changes) {
    if (change.action === 'add') {
      ds[change.frame.id] = 'added';
    } else if (change.action === 'update') {
      ds[change.target] = 'updated';
      us[change.target] = Object.keys(change.slots);
    } else if (change.action === 'remove') {
      ds[change.target] = 'removed';
    }
  }
  return { deltaState: ds, updatedSlots: us };
}

function ConversationPageContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = params.projectId as string;
  const conversationId = params.conversationId as string;
  const projectName = useProjectStore((s) => s.getProject(projectId))?.name;

  // URL parameters for source navigation
  const targetTurnHash = searchParams.get('turn');
  const highlightParam = searchParams.get('highlight');
  const highlight = parseHighlightParam(highlightParam);

  // Refs for scroll-to-turn functionality
  const turnRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const hasScrolled = useRef(false);

  // Ref for text selection tracking
  const mainRef = useRef<HTMLElement>(null);
  const { selection, clearSelection } = useTextSelection(mainRef);

  const [conversation, setConversation] = useState<
    (Conversation & { turns_count?: number }) | null
  >(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Semantic panel state
  const [activeTab, setActiveTab] = useState<'context' | 'semantic'>('context');
  const [semanticSnapshot, setSemanticSnapshot] = useState<SemanticContent | null>(null);
  const [deltaState, setDeltaState] = useState<Record<string, 'added' | 'updated' | 'removed'>>({});
  const [updatedSlots, setUpdatedSlots] = useState<Record<string, string[]>>({});
  const [extracting, setExtracting] = useState(false);

  // Load conversation and turns data
  useEffect(() => {
    if (!conversationId || !projectId) return;

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Load conversation and turns in parallel
        const [convData, turnsData] = await Promise.all([
          getConversation(conversationId),
          listTurns(projectId, conversationId, 100, 0),
        ]);

        setConversation(convData);
        setTurns(turnsData.turns);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load conversation'));
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [conversationId, projectId]);

  // Scroll to target turn when data is loaded
  useEffect(() => {
    if (loading || !targetTurnHash || hasScrolled.current) return;

    // Wait a tick for refs to be populated
    const timer = setTimeout(() => {
      const targetEl = turnRefs.current.get(targetTurnHash);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        hasScrolled.current = true;
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [loading, targetTurnHash, turns]);

  // Auto-extraction: fetch existing draft on load, extract on new turns
  const prevTurnCountRef = useRef(0);
  const animTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  useEffect(() => {
    if (turns.length === 0) return;
    if (prevTurnCountRef.current === 0) {
      // Initial load — fetch existing draft
      prevTurnCountRef.current = turns.length;
      getSemanticDraft(conversationId)
        .then((draft) => {
          if (draft && draft.frames.length > 0) {
            setSemanticSnapshot(draft);
          }
        })
        .catch(() => {});
      return;
    }
    if (turns.length <= prevTurnCountRef.current) return;
    prevTurnCountRef.current = turns.length;

    // New turn — trigger extraction (stale-request guard for streaming chat)
    let cancelled = false;
    const doExtract = async () => {
      setExtracting(true);
      try {
        const result = await extractFrames(conversationId);
        if (cancelled) return; // Newer extraction superseded this one
        setSemanticSnapshot(result.snapshot);
        const anim = computeDeltaState(result.delta);
        setDeltaState(anim.deltaState);
        setUpdatedSlots(anim.updatedSlots);
        clearTimeout(animTimeoutRef.current);
        animTimeoutRef.current = setTimeout(() => {
          setDeltaState({});
          setUpdatedSlots({});
        }, 3000);
        if (activeTabRef.current === 'context') {
          setActiveTab('semantic');
        }
      } catch (err) {
        if (cancelled) return;
        if (process.env.NODE_ENV !== 'production') {
          console.error('Frame extraction failed:', err);
        }
      } finally {
        if (!cancelled) setExtracting(false);
      }
    };
    doExtract();

    return () => {
      cancelled = true;
      clearTimeout(animTimeoutRef.current);
    };
  }, [turns.length, conversationId]);

  const handleDraftDone = useCallback(() => {
    clearSelection();
    window.getSelection()?.removeAllRanges();
  }, [clearSelection]);

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <LoadingSpinner message="Loading conversation..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col">
        <ErrorMessage
          error={error}
          onRetry={() => {
            setError(null);
            setLoading(true);
            Promise.all([
              getConversation(conversationId),
              listTurns(projectId, conversationId, 100, 0),
            ])
              .then(([convData, turnsData]) => {
                setConversation(convData);
                setTurns(turnsData.turns);
              })
              .catch((err) => setError(err instanceof Error ? err : new Error(String(err))))
              .finally(() => setLoading(false));
          }}
        />
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Conversation not found</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push(`/project/${projectId}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Breadcrumb
            segments={[
              { label: 'Home', href: '/' },
              { label: projectName || 'Project', href: `/project/${projectId}` },
              { label: conversation.title || 'Untitled Conversation' },
            ]}
          />
          <span className="text-xs text-muted-foreground">{turns.length} turns</span>
        </div>
        <div className="flex items-center gap-2">
          <PinButton projectId={projectId} type="conversation" refId={conversationId} />
        </div>
      </header>

      {/* Main content area with sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Conversation content */}
        <main ref={mainRef} className="flex-1 overflow-auto p-[var(--space-page)]">
          <div className="mx-auto max-w-3xl space-y-[var(--space-group)]">
            {turns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <MessageSquare className="h-12 w-12 mb-[var(--space-group)] opacity-50" />
                <p className="font-medium">Start a conversation to capture knowledge</p>
                <p className="text-sm">Type your first message below</p>
              </div>
            ) : (
              turns.map((turn) => (
                <TurnMessage
                  key={turn.turn_hash}
                  turn={turn}
                  isTarget={turn.turn_hash === targetTurnHash}
                  highlight={turn.turn_hash === targetTurnHash ? highlight : null}
                  ref={(el) => {
                    if (el) turnRefs.current.set(turn.turn_hash, el);
                  }}
                />
              ))
            )}
          </div>
        </main>

        {/* Context + Semantic Panel Sidebar */}
        <aside className="w-80 border-l bg-muted/30 flex flex-col overflow-hidden">
          <div className="flex border-b shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('context')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors',
                activeTab === 'context'
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <MessagesSquare className="h-3.5 w-3.5" />
              Context
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('semantic')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors',
                activeTab === 'semantic'
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Network className="h-3.5 w-3.5" />
              Semantic
              {extracting && <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />}
            </button>
          </div>
          <div className="flex-1 overflow-auto">
            {activeTab === 'context' ? (
              <ContextPanelWrapper projectId={projectId} conversationId={conversationId} />
            ) : (
              <SemanticPanel
                conversationId={conversationId}
                snapshot={semanticSnapshot}
                deltaState={deltaState}
                updatedSlots={updatedSlots}
                extracting={extracting}
                onSnapshotChange={setSemanticSnapshot}
              />
            )}
          </div>
        </aside>
      </div>

      {/* Floating Add to Draft button */}
      {selection && (
        <AddToDraftButton
          selection={selection}
          projectId={projectId}
          conversationId={conversationId}
          conversationTitle={conversation.title || undefined}
          onDone={handleDraftDone}
        />
      )}
    </div>
  );
}

// ============================================================================
// Turn Message Component
// ============================================================================

interface TurnMessageProps {
  turn: Turn;
  /** Whether this turn is the navigation target */
  isTarget?: boolean;
  /** Highlight range within the turn content */
  highlight?: { start: number; end: number } | null;
}

const TurnMessage = forwardRef<HTMLDivElement, TurnMessageProps>(function TurnMessage(
  { turn, isTarget, highlight },
  ref
) {
  const isUser = turn.role === 'user';
  const isAssistant = turn.role === 'assistant';
  const isSystem = turn.role === 'system';
  const isTool = turn.role === 'tool';

  // Render content with optional highlight
  const renderContent = () => {
    if (!highlight || highlight.start < 0 || highlight.end > turn.content.length) {
      return turn.content;
    }

    const before = turn.content.slice(0, highlight.start);
    const highlighted = turn.content.slice(highlight.start, highlight.end);
    const after = turn.content.slice(highlight.end);

    return (
      <>
        {before}
        <mark className="bg-[var(--status-success-muted)] text-[var(--color-text)] px-0.5 rounded-sm">
          {highlighted}
        </mark>
        {after}
      </>
    );
  };

  return (
    <div
      ref={ref}
      data-turn-hash={turn.turn_hash}
      data-turn-role={turn.role}
      className={cn(
        'rounded-lg p-[var(--space-group)] transition-all duration-[var(--duration-slow)]',
        isUser && 'bg-primary/10 ml-8',
        isAssistant && 'bg-[var(--color-bg-subtle)] mr-8',
        isSystem && 'bg-[var(--status-warning-muted)] border border-[var(--status-warning)]/25',
        isTool &&
          'bg-[var(--status-info-muted)] border border-[var(--color-border)] font-mono text-sm',
        isTarget && 'ring-2 ring-blue-500 ring-offset-2'
      )}
    >
      <div className="flex items-center gap-2 mb-[var(--space-item)]">
        <span
          className={cn(
            'text-xs font-medium px-2 py-0.5 rounded',
            isUser && 'bg-primary/20 text-primary',
            isAssistant && 'bg-muted-foreground/20 text-muted-foreground',
            isSystem && 'bg-[var(--status-warning-muted)] text-[var(--status-warning)]',
            isTool && 'bg-[var(--status-info-muted)] text-[var(--status-info)]'
          )}
        >
          {turn.role.toUpperCase()}
        </span>
        <span className="text-xs text-muted-foreground">
          {new Date(turn.created_at).toLocaleTimeString()}
        </span>
        {isTarget && (
          <span className="text-xs bg-[var(--status-info-muted)] text-[var(--status-info)] px-1.5 py-0.5 rounded">
            Source
          </span>
        )}
      </div>
      <div data-turn-content className="whitespace-pre-wrap text-sm">
        {renderContent()}
      </div>
    </div>
  );
});
