'use client';

/**
 * TurnBubble - Renders a conversation turn with optional highlights
 *
 * Used for displaying turns with highlighted text in:
 * - SourceContextModal (merge UI) - yellow highlights
 * - CommitSourceContext (commit display) - green highlights
 */

import { Bot, Settings, Terminal, User } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Highlight range within turn content
 */
export interface TurnHighlight {
  start: number;
  end: number;
}

/**
 * Turn data for TurnBubble rendering
 */
export interface TurnBubbleData {
  turn_hash: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  created_at: string;
  is_target?: boolean;
  /** Single highlight (legacy support) */
  highlight?: TurnHighlight;
  /** Multiple highlights (for multiple sentences from same turn) */
  highlights?: TurnHighlight[];
}

export type HighlightColor = 'yellow' | 'green';

const roleIcons: Record<string, ReactNode> = {
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

const highlightColors: Record<HighlightColor, string> = {
  yellow: 'bg-yellow-200',
  green: 'bg-green-200',
};

/**
 * Merge overlapping or adjacent highlight ranges
 */
function mergeHighlights(highlights: TurnHighlight[]): TurnHighlight[] {
  if (highlights.length === 0) return [];

  // Sort by start position
  const sorted = [...highlights].sort((a, b) => a.start - b.start);

  const merged: TurnHighlight[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    // Merge if overlapping or adjacent (within 1 char)
    if (current.start <= last.end + 1) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push(current);
    }
  }

  return merged;
}

interface TurnBubbleProps {
  turn: TurnBubbleData;
  /** Highlight color: 'yellow' for merge UI, 'green' for commit display */
  highlightColor?: HighlightColor;
  /** Whether to show ring around target turn */
  showTargetRing?: boolean;
}

export function TurnBubble({
  turn,
  highlightColor = 'yellow',
  showTargetRing = true,
}: TurnBubbleProps) {
  const isUser = turn.role === 'user';

  // Collect all highlights (from both single and multiple sources)
  const allHighlights: TurnHighlight[] = [];
  if (turn.highlight && turn.is_target) {
    allHighlights.push(turn.highlight);
  }
  if (turn.highlights) {
    allHighlights.push(...turn.highlights);
  }

  // Render content with highlights
  const renderContent = () => {
    if (allHighlights.length === 0) {
      return turn.content;
    }

    // Merge overlapping highlights
    const merged = mergeHighlights(allHighlights);
    const highlightClass = `${highlightColors[highlightColor]} px-0.5 rounded`;

    // Build segments
    const segments: ReactNode[] = [];
    let lastEnd = 0;

    for (let i = 0; i < merged.length; i++) {
      const { start, end } = merged[i];

      // Add text before highlight
      if (start > lastEnd) {
        segments.push(turn.content.slice(lastEnd, start));
      }

      // Add highlighted text
      segments.push(
        <mark key={i} className={highlightClass}>
          {turn.content.slice(start, end)}
        </mark>
      );

      lastEnd = end;
    }

    // Add remaining text after last highlight
    if (lastEnd < turn.content.length) {
      segments.push(turn.content.slice(lastEnd));
    }

    return <>{segments}</>;
  };

  const ringClass =
    showTargetRing && turn.is_target
      ? highlightColor === 'yellow'
        ? 'ring-2 ring-yellow-400 ring-offset-2'
        : 'ring-2 ring-green-400 ring-offset-2'
      : '';

  return (
    <div
      className={`
        flex gap-3 p-3 rounded-lg
        ${ringClass}
        ${isUser ? 'bg-blue-50' : 'bg-muted'}
      `}
    >
      {/* Role Icon */}
      <div
        className={`
          shrink-0 w-8 h-8 rounded-full flex items-center justify-center
          ${isUser ? 'bg-blue-100 text-blue-600' : 'bg-muted-foreground/20 text-muted-foreground'}
        `}
      >
        {roleIcons[turn.role] || <User className="h-4 w-4" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-sm">{roleLabels[turn.role] || turn.role}</span>
          <span className="text-xs text-muted-foreground">
            {new Date(turn.created_at).toLocaleTimeString()}
          </span>
        </div>
        <p className="text-sm whitespace-pre-wrap break-words">{renderContent()}</p>
      </div>
    </div>
  );
}
