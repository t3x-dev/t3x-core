'use client';

/**
 * ConflictSourceContext - Truncated turn display for conflict sides
 *
 * Shows conversation context with highlighted sentence.
 * Reuses the truncation algorithm concept from TruncatedCommitView.
 */

import { Loader2, MessageCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import type { TurnContextData } from '@/types/merge';

/** Minimum content length to show expand/collapse button */
const EXPAND_THRESHOLD = 150;

interface ConflictSourceContextProps {
  turnHash: string | undefined;
  sentenceText: string;
  startChar?: number;
  endChar?: number;
  contextData: TurnContextData | null;
  loading: boolean;
  error?: string;
}

interface HighlightRange {
  start: number;
  end: number;
}

interface TruncatedSegment {
  type: 'text' | 'highlight' | 'ellipsis';
  content: string;
}

/**
 * Find word boundary - expands position to nearest word boundary
 */
function findWordBoundary(text: string, pos: number, direction: 'left' | 'right'): number {
  if (pos <= 0) return 0;
  if (pos >= text.length) return text.length;

  if (direction === 'left') {
    while (pos > 0 && !/\s/.test(text[pos - 1])) {
      pos--;
    }
    return pos;
  }
  while (pos < text.length && !/\s/.test(text[pos])) {
    pos++;
  }
  return pos;
}

/**
 * Smart truncation algorithm that preserves highlights
 */
function truncateWithHighlight(
  text: string,
  highlight: HighlightRange | null,
  contextChars = 50
): TruncatedSegment[] {
  if (text.length === 0) return [];

  // If no highlight or short text, show full text (maybe truncated)
  if (!highlight || text.length <= contextChars * 2 + 20) {
    if (text.length <= contextChars * 3) {
      return [{ type: 'text', content: text }];
    }
    // Truncate long text without highlight
    const endPos = findWordBoundary(text, contextChars * 2, 'right');
    return [
      { type: 'text', content: text.slice(0, endPos) },
      { type: 'ellipsis', content: '...' },
    ];
  }

  // Calculate context boundaries with word-aware truncation
  let contextStart = Math.max(0, highlight.start - contextChars);
  let contextEnd = Math.min(text.length, highlight.end + contextChars);

  // Adjust to word boundaries
  if (contextStart > 0) {
    contextStart = findWordBoundary(text, contextStart, 'right');
  }
  if (contextEnd < text.length) {
    contextEnd = findWordBoundary(text, contextEnd, 'left');
  }

  // Ensure highlight is still fully visible
  contextStart = Math.min(contextStart, highlight.start);
  contextEnd = Math.max(contextEnd, highlight.end);

  // Build segments
  const segments: TruncatedSegment[] = [];

  // Leading ellipsis
  if (contextStart > 0) {
    segments.push({ type: 'ellipsis', content: '...' });
  }

  // Text before highlight
  if (highlight.start > contextStart) {
    segments.push({ type: 'text', content: text.slice(contextStart, highlight.start) });
  }

  // Highlight
  segments.push({ type: 'highlight', content: text.slice(highlight.start, highlight.end) });

  // Text after highlight
  if (contextEnd > highlight.end) {
    segments.push({ type: 'text', content: text.slice(highlight.end, contextEnd) });
  }

  // Trailing ellipsis
  if (contextEnd < text.length) {
    segments.push({ type: 'ellipsis', content: '...' });
  }

  return segments;
}

export function ConflictSourceContext({
  turnHash,
  sentenceText,
  startChar,
  endChar,
  contextData,
  loading,
  error,
}: ConflictSourceContextProps) {
  const [expanded, setExpanded] = useState(false);

  // No turn hash - show unavailable state
  if (!turnHash) {
    return (
      <div className="text-xs text-muted-foreground italic mt-2">
        Source context unavailable
      </div>
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
    return (
      <div className="text-xs text-amber-600 mt-2">
        {error}
      </div>
    );
  }

  // No context data - show fallback
  if (!contextData) {
    return null;
  }

  const targetTurn = contextData.target_turn;
  if (!targetTurn) return null;

  // Build highlight range
  const highlight: HighlightRange | null =
    startChar !== undefined && endChar !== undefined
      ? { start: startChar, end: endChar }
      : null;

  // Get truncated segments
  const segments = truncateWithHighlight(targetTurn.content, highlight);

  // Role label
  const roleLabel = targetTurn.role === 'user' ? 'User' : 'Assistant';

  return (
    <div className="mt-2 space-y-1">
      {/* Conversation info */}
      <div className="flex items-center gap-1.5 text-[0.65rem] text-muted-foreground">
        <MessageCircle className="h-3 w-3" />
        <span>{contextData.conversation_title || 'Conversation'}</span>
        <span className="text-muted-foreground/50">|</span>
        <span className="font-medium">{roleLabel}</span>
      </div>

      {/* Truncated content with highlight */}
      <div className="text-xs leading-relaxed text-muted-foreground bg-muted/30 rounded px-2 py-1.5">
        {expanded ? (
          // Full content
          <>
            {highlight ? (
              <>
                {targetTurn.content.slice(0, highlight.start)}
                <mark className="bg-yellow-200 text-yellow-900 px-0.5 rounded-sm">
                  {targetTurn.content.slice(highlight.start, highlight.end)}
                </mark>
                {targetTurn.content.slice(highlight.end)}
              </>
            ) : (
              targetTurn.content
            )}
          </>
        ) : (
          // Truncated content
          segments.map((seg, idx) => {
            if (seg.type === 'ellipsis') {
              return (
                <span key={idx} className="text-muted-foreground/50">
                  {seg.content}
                </span>
              );
            }
            if (seg.type === 'highlight') {
              return (
                <mark key={idx} className="bg-yellow-200 text-yellow-900 px-0.5 rounded-sm">
                  {seg.content}
                </mark>
              );
            }
            return <span key={idx}>{seg.content}</span>;
          })
        )}
      </div>

      {/* Expand/Collapse toggle */}
      {targetTurn.content.length > EXPAND_THRESHOLD && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-0.5 text-[0.65rem] text-blue-600 hover:text-blue-700"
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
