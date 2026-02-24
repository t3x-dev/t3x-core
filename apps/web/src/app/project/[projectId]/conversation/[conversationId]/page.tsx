'use client';

import { ArrowLeft, MessageSquare } from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { forwardRef, useEffect, useRef, useState } from 'react';
import { ErrorMessage, LoadingSpinner } from '@/components/ApiStatus';
import { ContextPanelWrapper } from '@/components/conversation/ContextPanelWrapper';
import { Breadcrumb } from '@/components/shared/Breadcrumb';
import { parseHighlightParam } from '@/components/shared/ViewSourceLink';
import { Button } from '@/components/ui/button';
import { PinButton } from '@/components/ui/PinButton';
import type { Conversation, Turn } from '@/lib/api';
import { getConversation, listTurns } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useProjectStore } from '@/store/projectStore';

export default function ConversationPage() {
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

  const [conversation, setConversation] = useState<
    (Conversation & { turns_count?: number }) | null
  >(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

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
        <main className="flex-1 overflow-auto p-[var(--space-page)]">
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

        {/* Context Panel Sidebar */}
        <aside className="w-64 border-l bg-muted/30 overflow-auto">
          <ContextPanelWrapper projectId={projectId} conversationId={conversationId} />
        </aside>
      </div>
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
      <div className="whitespace-pre-wrap text-sm">{renderContent()}</div>
    </div>
  );
});
