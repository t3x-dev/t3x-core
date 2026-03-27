'use client';

/**
 * DiffSourceContextModal - Standalone source context modal for Diff page
 *
 * Features:
 * - Shows conversation context around the source node
 * - Fullscreen toggle (Maximize2/Minimize2)
 * - Auto-scroll to target turn on open
 * - "Open in new tab" for full conversation page
 */

import {
  Bot,
  ExternalLink,
  Loader2,
  Maximize2,
  Minimize2,
  Settings,
  Terminal,
  User,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { glass } from '@/lib/theme';
import { cn } from '@/lib/utils';
import type { ContentNode, TurnContextData, TurnWithContext, WordDiffSegment } from '@/types/merge';

const roleIcons: Record<string, React.ReactNode> = {
  user: <User className="h-4 w-4" />,
  assistant: <Bot className="h-4 w-4" />,
  system: <Settings className="h-4 w-4" />,
  tool: <Terminal className="h-4 w-4" />,
};

const roleLabels: Record<string, string> = {
  user: 'User',
  assistant: 'Assistant',
  system: 'System',
  tool: 'Tool',
};

export function TurnBubble({
  turn,
  targetRef,
  wordDiff,
}: {
  turn: TurnWithContext;
  targetRef?: React.RefObject<HTMLDivElement | null>;
  wordDiff?: WordDiffSegment[];
}) {
  const isUser = turn.role === 'user';

  const renderContent = () => {
    if (!turn.highlight || !turn.is_target) {
      return turn.content;
    }
    const { start, end } = turn.highlight;
    const before = turn.content.slice(0, start);
    const after = turn.content.slice(end);

    // When wordDiff is provided, highlight only changed words
    if (wordDiff && wordDiff.length > 0) {
      return (
        <>
          {before && <span className="text-[var(--text-tertiary)]">{before}</span>}
          {wordDiff.map((seg, i) => {
            if (seg.type === 'unchanged') {
              return <span key={i}>{seg.text}</span>;
            }
            if (seg.type === 'added') {
              return (
                <mark key={i} className="bg-green-500 text-white font-medium px-0.5 rounded-sm">
                  {seg.text}
                </mark>
              );
            }
            if (seg.type === 'removed') {
              return (
                <mark
                  key={i}
                  className="bg-red-500 text-white font-medium px-0.5 rounded-sm line-through"
                >
                  {seg.text}
                </mark>
              );
            }
            return <span key={i}>{seg.text}</span>;
          })}
          {after && <span className="text-[var(--text-tertiary)]">{after}</span>}
        </>
      );
    }

    // Fallback: highlight entire range
    const highlighted = turn.content.slice(start, end);
    return (
      <>
        {before}
        <mark className="bg-amber-200 dark:bg-amber-500/40 text-[var(--text-primary)] font-medium px-1 py-0.5 rounded border-b-2 border-amber-400 dark:border-amber-500">
          {highlighted}
        </mark>
        {after}
      </>
    );
  };

  return (
    <div
      ref={turn.is_target ? targetRef : undefined}
      className={cn(
        'flex gap-3 p-3 rounded-lg',
        turn.is_target &&
          'ring-2 ring-[var(--accent-branch)]/50 ring-offset-1 ring-offset-[var(--surface-card)] border-l-4 border-[var(--accent-branch)]',
        isUser ? 'bg-[var(--accent-commit)]/8' : 'bg-[var(--surface-panel)]',
        !turn.is_target && 'opacity-70'
      )}
    >
      <div
        className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isUser ? 'bg-[var(--accent-commit)]/15 text-[var(--accent-commit)]' : 'bg-[var(--hover-bg)] text-[var(--text-tertiary)]'}`}
      >
        {roleIcons[turn.role] || <User className="h-4 w-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-sm">{roleLabels[turn.role] || turn.role}</span>
          <span className="text-xs text-[var(--text-tertiary)]">
            {new Date(turn.created_at).toLocaleTimeString()}
          </span>
        </div>
        <p className="text-sm whitespace-pre-wrap break-words">{renderContent()}</p>
      </div>
    </div>
  );
}

/** Flexible node type that accepts both required and optional source */
interface NodeWithOptionalSource {
  id: string;
  text: string;
  source?: {
    turn_hash?: string;
    start_char?: number;
    end_char?: number;
  };
}

interface DiffSourceContextModalProps {
  open: boolean;
  node: NodeWithOptionalSource | ContentNode | null;
  data: TurnContextData | null;
  loading: boolean;
  onClose: () => void;
  projectId?: string;
  /** Conversation ID for "Open in new tab" link */
  conversationId?: string;
  /** Turn hash for highlight params in URL */
  turnHash?: string;
  /** Highlight start char for URL params */
  highlightStart?: number;
  /** Highlight end char for URL params */
  highlightEnd?: number;
  /** Word-level diff segments for highlighting only changed words */
  wordDiff?: WordDiffSegment[];
}

export function DiffSourceContextModal({
  open,
  node,
  data,
  loading,
  onClose,
  projectId,
  conversationId: propConversationId,
  turnHash: propTurnHash,
  highlightStart,
  highlightEnd,
  wordDiff,
}: DiffSourceContextModalProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const targetTurnRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const effectiveConversationId = propConversationId || data?.conversation_id;

  // Auto-scroll to target turn when modal opens or data loads
  useEffect(() => {
    if (open && data && targetTurnRef.current) {
      // Small delay to let the modal render
      const timer = setTimeout(() => {
        targetTurnRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [open, data]);

  // Reset fullscreen when modal closes
  useEffect(() => {
    if (!open) setFullscreen(false);
  }, [open]);

  const handleOpenInNewTab = () => {
    if (effectiveConversationId && projectId) {
      const params = new URLSearchParams();
      if (propTurnHash) params.set('turn', propTurnHash);
      if (highlightStart != null && highlightEnd != null) {
        params.set('highlight', `${highlightStart}-${highlightEnd}`);
      }
      const qs = params.toString();
      const url = `/chat/${effectiveConversationId}${qs ? `?${qs}` : ''}`;
      window.open(url, '_blank');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={cn(
          'overflow-hidden flex flex-col rounded-2xl transition-all duration-200',
          fullscreen ? 'w-[95vw] h-[95vh] max-w-none max-h-none' : 'max-w-2xl max-h-[80vh]',
          glass.elevatedBase,
          glass.highlight
        )}
      >
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-[var(--text-primary)]">Source Context</DialogTitle>
              {data && (
                <p className="text-sm text-[var(--text-tertiary)] mt-1">
                  Conversation: {data.conversation_title || data.conversation_id}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFullscreen((f) => !f)}
                className="h-8 w-8 p-0"
                title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
              {effectiveConversationId && projectId && (
                <Button variant="outline" size="sm" onClick={handleOpenInNewTab}>
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Open in new tab
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto py-4" ref={scrollContainerRef}>
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--text-tertiary)]" />
              <span className="ml-2 text-[var(--text-tertiary)]">Loading context...</span>
            </div>
          )}

          {!loading && data && (
            <div className="space-y-3">
              {data.context.map((turn, idx) => (
                <TurnBubble
                  key={turn.turn_hash || idx}
                  turn={turn}
                  targetRef={targetTurnRef}
                  wordDiff={turn.is_target ? wordDiff : undefined}
                />
              ))}
            </div>
          )}

          {!loading && !data && node && (
            <div className="text-center py-12 text-[var(--text-tertiary)]">
              <p>Could not load conversation context.</p>
              {node.source?.turn_hash && (
                <p className="mt-2 text-sm font-mono break-all text-[var(--text-secondary)]">
                  Turn: {node.source.turn_hash}
                </p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
