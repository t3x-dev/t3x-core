'use client';

/**
 * ConflictSourceContext - Truncated turn display for conflict sides
 *
 * Shows conversation context with highlighted sentence.
 * Uses shared truncation utilities from lib/truncationUtils.
 */

import { ChevronDown, ChevronUp, Loader2, MessageCircle } from 'lucide-react';
import { useState } from 'react';

import { truncateWithHighlights } from '@/lib/truncationUtils';
import type { TurnContextData } from '@/types/merge';
import type { HighlightRange } from '@/types/sourceContext';

/** Minimum content length to show expand/collapse button */
const EXPAND_THRESHOLD = 150;

/** Default context chars for conflict context */
const CONFLICT_CONTEXT_CHARS = 50;

interface ConflictSourceContextProps {
  turnHash: string | undefined;
  sentenceText: string;
  startChar?: number;
  endChar?: number;
  contextData: TurnContextData | null;
  loading: boolean;
  error?: string;
  /** Callback when "Jump to conversation" is clicked */
  onJumpToConversation?: (conversationId: string) => void;
}

export function ConflictSourceContext({
  turnHash,
  sentenceText: _sentenceText, // Reserved for future fallback display
  startChar,
  endChar,
  contextData,
  loading,
  error,
  onJumpToConversation,
}: ConflictSourceContextProps) {
  const [expanded, setExpanded] = useState(false);

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
    return <div className="text-xs text-amber-600 dark:text-amber-400 mt-2">{error}</div>;
  }

  // No context data - show fallback
  if (!contextData) {
    return null;
  }

  const targetTurn = contextData.target_turn;
  if (!targetTurn) return null;

  // Build highlight ranges array (truncateWithHighlights expects array)
  const highlights: HighlightRange[] =
    startChar !== undefined && endChar !== undefined ? [{ start: startChar, end: endChar }] : [];

  // Get truncated segments using shared utility
  const segments = truncateWithHighlights(targetTurn.content, highlights, {
    contextChars: CONFLICT_CONTEXT_CHARS,
  });

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
        {onJumpToConversation && contextData.conversation_id && (
          <>
            <span className="text-muted-foreground/50">|</span>
            <button
              type="button"
              onClick={() => onJumpToConversation(contextData.conversation_id)}
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              Jump to conversation
            </button>
          </>
        )}
      </div>

      {/* Truncated content with highlight */}
      <div className="text-xs leading-relaxed text-muted-foreground bg-muted/30 rounded px-2 py-1.5">
        {expanded ? (
          // Full content
          highlights.length > 0 ? (
            <>
              {targetTurn.content.slice(0, highlights[0].start)}
              <mark className="bg-yellow-200 dark:bg-yellow-800/50 text-yellow-900 dark:text-yellow-100 px-0.5 rounded-sm">
                {targetTurn.content.slice(highlights[0].start, highlights[0].end)}
              </mark>
              {targetTurn.content.slice(highlights[0].end)}
            </>
          ) : (
            targetTurn.content
          )
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
                <mark
                  key={idx}
                  className="bg-yellow-200 dark:bg-yellow-800/50 text-yellow-900 dark:text-yellow-100 px-0.5 rounded-sm"
                >
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
          className="flex items-center gap-0.5 text-[0.65rem] text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
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
