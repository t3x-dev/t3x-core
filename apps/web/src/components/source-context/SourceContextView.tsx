'use client';

/**
 * SourceContextView - Unified inline expandable source context component
 *
 * VS Code Peek-style UX for showing conversation context with highlighted nodes.
 * Supports both compact (truncated) and expanded (full content) display modes.
 *
 * Features:
 * - Compact mode: Shows truncated context around highlight with expand button
 * - Expanded mode: Shows full turn content with highlight
 * - Loading/error state handling
 * - Configurable highlight color (yellow for merge, green for commits)
 * - Auto-fetch or external data support
 *
 * @example
 * // With auto-fetch
 * <SourceContextView
 *   turnHash="sha256:abc..."
 *   highlightStart={10}
 *   highlightEnd={50}
 *   mode="compact"
 * />
 *
 * // With external data
 * <SourceContextView
 *   turnHash="sha256:abc..."
 *   highlightStart={10}
 *   highlightEnd={50}
 *   mode="compact"
 *   contextData={preLoadedData}
 *   autoFetch={false}
 * />
 */

import { ChevronDown, ChevronUp, Loader2, MessageCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { useTurnContext } from '@/hooks/useTurnContext';
import { truncateWithHighlights } from '@/domain/format/truncationUtils';
import type { TurnContextData, WordDiffSegment } from '@/types/merge';
import type { HighlightColor, HighlightRange } from '@/types/sourceContext';

// ============================================================================
// Constants
// ============================================================================

/** Minimum content length to show expand/collapse button */
const EXPAND_THRESHOLD = 150;

/** Default context chars for compact mode */
const DEFAULT_COMPACT_CHARS = 50;

// ============================================================================
// Types
// ============================================================================

export interface SourceContextViewProps {
  /** Turn hash to fetch/display context for */
  turnHash: string;
  /** Start character position for highlight (0-indexed, inclusive) */
  highlightStart?: number;
  /** End character position for highlight (0-indexed, exclusive) */
  highlightEnd?: number;

  /** Display mode: 'compact' shows truncated view, 'expanded' shows full content */
  mode?: 'compact' | 'expanded';
  /** Number of context chars to show in compact mode (default: 50) */
  compactChars?: number;

  /** Highlight color: 'yellow' for merge UI, 'green' for commit display */
  highlightColor?: HighlightColor;

  /** Word-level diff segments — when provided, only changed words are highlighted */
  wordDiff?: WordDiffSegment[];

  /** Pre-loaded context data (skips fetch if provided) */
  contextData?: TurnContextData | null;
  /** Whether to auto-fetch context data (default: true) */
  autoFetch?: boolean;

  /** Show conversation header with role */
  showHeader?: boolean;
  /** Show "Jump to conversation" link */
  showJumpLink?: boolean;
  /** Callback when jump link is clicked, receives conversation_id */
  onJumpClick?: (conversationId: string) => void;

  /** External loading state (overrides internal loading) */
  loading?: boolean;
  /** External error message (overrides internal error) */
  error?: string;
}

// ============================================================================
// Highlight color classes
// ============================================================================

const highlightColorClasses: Record<HighlightColor, string> = {
  yellow:
    'bg-[var(--status-warning-muted)] font-medium border-b-2 border-[var(--status-warning)]',
  green:
    'bg-[var(--status-success-muted)] font-medium border-b-2 border-[var(--status-success)]',
  deepGreen: 'bg-[var(--status-success)] text-white font-medium',
  deepRed: 'bg-[var(--status-error)] text-white font-medium',
  amber:
    'bg-[var(--status-warning-muted)] border border-dashed border-[var(--status-warning)]/40 font-medium',
  blue: 'bg-[var(--status-info)]/10 border border-dotted border-[var(--status-info)]/40 font-medium',
};

// ============================================================================
// Component
// ============================================================================

export function SourceContextView({
  turnHash,
  highlightStart,
  highlightEnd,
  mode = 'compact',
  compactChars = DEFAULT_COMPACT_CHARS,
  highlightColor = 'yellow',
  wordDiff,
  contextData: externalData,
  autoFetch = true,
  showHeader = true,
  showJumpLink = false,
  onJumpClick,
  loading: externalLoading,
  error: externalError,
}: SourceContextViewProps) {
  // Internal state for auto-fetch mode
  const [internalData, setInternalData] = useState<TurnContextData | null>(null);
  const [internalLoading, setInternalLoading] = useState(false);
  const [internalError, setInternalError] = useState<string | undefined>();

  // Local expand state
  const [expanded, setExpanded] = useState(mode === 'expanded');
  const { loadTurnContext } = useTurnContext();

  // Use external or internal state
  const contextData = externalData !== undefined ? externalData : internalData;
  const loading = externalLoading !== undefined ? externalLoading : internalLoading;
  const error = externalError !== undefined ? externalError : internalError;

  // Auto-fetch when turnHash changes
  const fetchContext = useCallback(async () => {
    if (!turnHash || !autoFetch || externalData !== undefined) return;

    setInternalLoading(true);
    setInternalError(undefined);

    try {
      const data = await loadTurnContext(turnHash, {
        before: 0,
        after: 0,
        highlightStart,
        highlightEnd,
      });
      setInternalData(data);
    } catch (err) {
      setInternalError(err instanceof Error ? err.message : 'Failed to load context');
    } finally {
      setInternalLoading(false);
    }
  }, [turnHash, autoFetch, externalData, highlightStart, highlightEnd, loadTurnContext]);

  useEffect(() => {
    fetchContext();
  }, [fetchContext]);

  // Sync expanded state with mode prop
  useEffect(() => {
    setExpanded(mode === 'expanded');
  }, [mode]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render states
  // ─────────────────────────────────────────────────────────────────────────

  // No turn hash - show unavailable state
  if (!turnHash) {
    return (
      <div className="text-xs text-muted-foreground italic mt-2">Source context unavailable</div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Loading context...</span>
      </div>
    );
  }

  // Error state
  if (error) {
    return <div className="text-xs text-[var(--status-warning)] mt-2">{error}</div>;
  }

  // No context data
  if (!contextData) {
    return null;
  }

  const targetTurn = contextData.target_turn;
  if (!targetTurn) return null;

  // Build highlight ranges array
  const highlights: HighlightRange[] =
    highlightStart !== undefined && highlightEnd !== undefined
      ? [{ start: highlightStart, end: highlightEnd }]
      : [];

  // Get role label
  const roleLabels: Record<string, string> = {
    user: 'User',
    assistant: 'Assistant',
    system: 'System',
    tool: 'Tool',
  };
  const roleLabel = roleLabels[targetTurn.role] || targetTurn.role;

  // Highlight class for marks
  const highlightClass = `${highlightColorClasses[highlightColor]} px-1 py-0.5 rounded`;

  // Get truncated segments for compact mode
  const segments = truncateWithHighlights(targetTurn.content, highlights, {
    contextChars: compactChars,
  });

  // Check if content is long enough to need expand/collapse
  const canExpand = targetTurn.content.length > EXPAND_THRESHOLD;

  // ─────────────────────────────────────────────────────────────────────────
  // Render content
  // ─────────────────────────────────────────────────────────────────────────

  /** Render word-diff segments within the highlighted node range */
  const renderWordDiffContent = (contentBefore: string, contentAfter: string) => {
    const addedClass = `${highlightColorClasses.deepGreen} px-0.5 rounded-sm`;
    const removedClass = `${highlightColorClasses.deepRed} px-0.5 rounded-sm line-through`;
    return (
      <>
        {contentBefore && <span className="text-[var(--text-tertiary)]">{contentBefore}</span>}
        {wordDiff!.map((seg, i) => {
          if (seg.type === 'unchanged') {
            return <span key={i}>{seg.text}</span>;
          }
          if (seg.type === 'added') {
            return (
              <mark key={i} className={addedClass}>
                {seg.text}
              </mark>
            );
          }
          if (seg.type === 'removed') {
            return (
              <mark key={i} className={removedClass}>
                {seg.text}
              </mark>
            );
          }
          return <span key={i}>{seg.text}</span>;
        })}
        {contentAfter && <span className="text-[var(--text-tertiary)]">{contentAfter}</span>}
      </>
    );
  };

  const renderExpandedContent = () => {
    // When wordDiff is provided, highlight only changed words
    if (wordDiff && wordDiff.length > 0 && highlights.length > 0) {
      const { start, end } = highlights[0];
      return renderWordDiffContent(
        targetTurn.content.slice(0, start),
        targetTurn.content.slice(end)
      );
    }

    if (highlights.length === 0) {
      return targetTurn.content;
    }

    // Fallback: Single highlight (most common case)
    const { start, end } = highlights[0];
    return (
      <>
        {targetTurn.content.slice(0, start)}
        <mark className={highlightClass}>{targetTurn.content.slice(start, end)}</mark>
        {targetTurn.content.slice(end)}
      </>
    );
  };

  const renderTruncatedContent = () => {
    // When wordDiff is provided, show word-level diffs in compact mode too
    if (wordDiff && wordDiff.length > 0 && highlights.length > 0) {
      const { start, end } = highlights[0];
      // Show truncated before/after context around the word diff
      const beforeFull = targetTurn.content.slice(0, start);
      const afterFull = targetTurn.content.slice(end);
      const beforeTrunc =
        beforeFull.length > compactChars ? `...${beforeFull.slice(-compactChars)}` : beforeFull;
      const afterTrunc =
        afterFull.length > compactChars ? `${afterFull.slice(0, compactChars)}...` : afterFull;
      return renderWordDiffContent(beforeTrunc, afterTrunc);
    }

    return segments.map((seg, idx) => {
      // Segments are static once rendered (content doesn't reorder)
      const key = `${seg.type}-${idx}`;
      if (seg.type === 'ellipsis') {
        return (
          <span key={key} className="text-muted-foreground/50">
            {seg.content}
          </span>
        );
      }
      if (seg.type === 'highlight') {
        return (
          <mark key={key} className={highlightClass}>
            {seg.content}
          </mark>
        );
      }
      return <span key={key}>{seg.content}</span>;
    });
  };

  return (
    <div className="mt-2 space-y-1">
      {/* Header with conversation info */}
      {showHeader && (
        <div className="flex items-center gap-1.5 text-[0.65rem] text-muted-foreground">
          <MessageCircle className="h-3 w-3" />
          <span>{contextData.conversation_title || 'Conversation'}</span>
          <span className="text-muted-foreground/50">|</span>
          <span className="font-medium">{roleLabel}</span>
          {showJumpLink && onJumpClick && contextData.conversation_id && (
            <>
              <span className="text-muted-foreground/50">|</span>
              <button
                type="button"
                onClick={() => onJumpClick(contextData.conversation_id)}
                className="text-[var(--status-info)] hover:underline"
              >
                View full context
              </button>
            </>
          )}
        </div>
      )}

      {/* Content with highlight */}
      <div className="text-xs leading-relaxed text-[var(--text-secondary)] bg-muted/50 border border-[var(--stroke-divider)] rounded px-2.5 py-2">
        {expanded ? renderExpandedContent() : renderTruncatedContent()}
      </div>

      {/* Expand/Collapse toggle */}
      {canExpand && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-0.5 text-[0.65rem] text-[var(--status-info)] hover:text-[var(--status-info)]"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3" />
              <span>Show less</span>
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" />
              <span>Show more context</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
