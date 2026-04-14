'use client';

/**
 * TurnBubble - Renders a conversation turn with optional highlights
 *
 * Used for displaying turns with highlighted text in:
 * - SourceContextModal (merge UI) - yellow highlights
 * - CommitSourceContext (commit display) - green highlights
 */

import { Bot, Settings, Terminal, User } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { mergeHighlightRanges } from '@/domain/format/highlightUtils';
import type {
  ColoredHighlightRange,
  HighlightColor,
  HighlightRange,
  TurnBubbleData,
  TurnBubbleProps,
} from '@/types/sourceContext';
import { type ContentBlock, ContentBlockRenderer } from '@/components/shared/ContentBlockRenderer';
import { ImageLightbox } from '@/components/shared/ImageLightbox';

// Re-export types for backward compatibility
export type { ColoredHighlightRange, HighlightColor, TurnBubbleData, TurnBubbleProps };
export type TurnHighlight = HighlightRange;

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
  yellow: 'bg-[var(--status-warning-muted)]',
  green: 'bg-[var(--status-success-muted)]',
  deepGreen: 'bg-[var(--status-success)] text-white',
  deepRed: 'bg-[var(--status-error)] text-white',
  amber:
    'bg-[var(--status-warning-muted)] border border-dashed border-[var(--status-warning)]/40',
  blue: 'bg-[var(--status-info)]/10 border border-dotted border-[var(--status-info)]/40',
};

export function TurnBubble({
  turn,
  highlightColor = 'yellow',
  showTargetRing = true,
}: TurnBubbleProps) {
  const isUser = turn.role === 'user';
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

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
    // Path 0: Multimodal content blocks
    if (turn.content_blocks && turn.content_blocks.length > 0) {
      return (
        <div className="flex flex-col gap-2">
          {turn.content_blocks.map((block: ContentBlock, i: number) => (
            <ContentBlockRenderer
              // biome-ignore lint/suspicious/noArrayIndexKey: content blocks have no unique ID
              key={i}
              block={block}
              onImageClick={(url) => setLightboxUrl(url)}
            />
          ))}
        </div>
      );
    }

    // Path A: Multi-color highlights (each range has its own color)
    if (turn.coloredHighlights && turn.coloredHighlights.length > 0) {
      const sorted = [...turn.coloredHighlights].sort((a, b) => a.start - b.start);
      const segments: ReactNode[] = [];
      let lastEnd = 0;

      for (let i = 0; i < sorted.length; i++) {
        const { start: rawStart, end, color } = sorted[i];
        // Adjust for overlapping ranges: skip already-rendered text
        const start = Math.max(rawStart, lastEnd);
        if (start >= end) continue; // Completely overlapped by previous range

        if (start > lastEnd) {
          segments.push(turn.content.slice(lastEnd, start));
        }
        segments.push(
          <mark key={i} className={`${highlightColors[color]} px-0.5 rounded`}>
            {turn.content.slice(start, end)}
          </mark>
        );
        lastEnd = end;
      }

      if (lastEnd < turn.content.length) {
        segments.push(turn.content.slice(lastEnd));
      }
      return <>{segments}</>;
    }

    // Path B: Uniform-color highlights (original behavior)
    if (allHighlights.length === 0) {
      return turn.content;
    }

    // Merge overlapping highlights
    const merged = mergeHighlightRanges(allHighlights);
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

  const ringColorMap: Record<HighlightColor, string> = {
    yellow: 'ring-2 ring-[var(--status-warning)] ring-offset-2',
    green: 'ring-2 ring-[var(--status-success)] ring-offset-2',
    deepGreen: 'ring-2 ring-[var(--status-success)] ring-offset-2',
    deepRed: 'ring-2 ring-[var(--status-error)] ring-offset-2',
    amber: 'ring-2 ring-[var(--status-warning)] ring-offset-2',
    blue: 'ring-2 ring-[var(--status-info)] ring-offset-2',
  };

  const ringClass = showTargetRing && turn.is_target ? ringColorMap[highlightColor] : '';

  return (
    <div
      className={`
        flex gap-3 p-3 rounded-lg
        ${ringClass}
        ${isUser ? 'bg-[var(--status-info-muted)] dark:bg-[var(--surface-elevated)] dark:border-l-2 dark:border-l-[var(--accent-commit)]' : 'bg-muted dark:bg-[var(--surface-card)]'}
      `}
    >
      {/* Role Icon */}
      <div
        className={`
          shrink-0 w-8 h-8 rounded-full flex items-center justify-center
          ${isUser ? 'bg-[var(--accent-commit)]/15 text-[var(--accent-commit)]' : 'bg-muted-foreground/20 text-muted-foreground'}
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
        <p className="text-sm whitespace-pre-wrap break-words text-[var(--text-primary)]">
          {renderContent()}
        </p>
        {lightboxUrl && (
          <ImageLightbox
            url={lightboxUrl}
            open={!!lightboxUrl}
            onClose={() => setLightboxUrl(null)}
          />
        )}
      </div>
    </div>
  );
}
