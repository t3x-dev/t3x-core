'use client';

/**
 * MergeDiffLine - Single line in diff view
 *
 * Renders with Git-style +/- prefixes and colors.
 * Supports click-to-expand inline source context (VS Code Peek style).
 *
 * Interaction:
 * - Click 📍 icon → Toggle inline context expand/collapse
 * - Expanded view shows source context with "Jump to conversation" link
 */

import { Check, CheckSquare, ChevronDown, ChevronUp, MapPin, Square } from 'lucide-react';
import { useState } from 'react';
import { SourceContextView } from '@/components/shared/SourceContextView';
import type { Sentence, TurnContextData } from '@/types/merge';

type LineType = 'context' | 'added' | 'removed';

interface MergeDiffLineProps {
  type: LineType;
  sentence: Sentence;
  isSelected?: boolean;
  isKept?: boolean;
  onSelect?: () => void;
  onToggleKeep?: () => void;
  selectable?: boolean;
  checkable?: boolean;
  /** Enable inline expand mode (default: true) */
  useInlineExpand?: boolean;
  /** Pre-loaded context data (avoids re-fetch if provided) */
  contextData?: TurnContextData | null;
  /** Loading state for context */
  contextLoading?: boolean;
  /** Callback for "Jump to conversation" link */
  onJumpToConversation?: (conversationId: string) => void;
  /** Navigation anchor ID for sidebar scroll tracking */
  navId?: string;
}

const lineStyles: Record<LineType, { bg: string; text: string; prefix: string; border: string }> = {
  context: {
    bg: 'bg-[var(--surface-app)]',
    text: 'text-[var(--text-primary)]',
    prefix: ' ',
    border: 'border-transparent',
  },
  added: {
    bg: 'bg-[var(--diff-added-bg)]',
    text: 'text-[var(--text-primary)]',
    prefix: '+',
    border: 'border-[var(--diff-added-line)]',
  },
  removed: {
    bg: 'bg-[var(--diff-removed-bg)]',
    text: 'text-[var(--text-secondary)] line-through',
    prefix: '-',
    border: 'border-[var(--diff-removed-line)]',
  },
};

export function MergeDiffLine({
  type,
  sentence,
  isSelected,
  isKept,
  onSelect,
  onToggleKeep,
  selectable,
  checkable,
  useInlineExpand = true,
  contextData,
  contextLoading,
  onJumpToConversation,
  navId,
}: MergeDiffLineProps) {
  const styles = lineStyles[type];
  const isDiscarded = checkable && !isKept;
  const hasSource = !!sentence.source?.turn_hash;

  // Local expand state for inline context
  const [expanded, setExpanded] = useState(false);

  // Handle source icon click
  const handleSourceClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!hasSource) return;
    setExpanded(!expanded);
  };

  // Handle jump to conversation (receives conversationId from SourceContextView)
  const handleJumpClick = (conversationId: string) => {
    onJumpToConversation?.(conversationId);
  };

  return (
    <div className="space-y-0" data-merge-nav={navId}>
      {/* Main diff line */}
      <div
        className={`
          flex items-start gap-2 px-3 py-2 font-mono text-sm
          border-l-4 ${styles.border} ${styles.bg}
          ${isSelected ? 'ring-2 ring-primary ring-offset-1' : ''}
          ${isDiscarded ? 'text-[var(--text-tertiary)]' : ''}
          ${selectable ? 'cursor-pointer hover:brightness-95' : ''}
          ${expanded && hasSource ? 'rounded-t rounded-b-none' : 'rounded'}
        `}
        onClick={selectable ? onSelect : undefined}
      >
        {/* Prefix */}
        <span
          className={`
            shrink-0 w-4 text-center font-bold
            ${type === 'added' ? 'text-[var(--diff-added-accent)]' : ''}
            ${type === 'removed' ? 'text-[var(--diff-removed-accent)]' : ''}
          `}
        >
          {styles.prefix}
        </span>

        {/* Checkbox for keep/discard */}
        {checkable && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleKeep?.();
            }}
            className="shrink-0 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          >
            {isKept ? (
              <CheckSquare className="h-4 w-4 text-[var(--diff-added-accent)]" />
            ) : (
              <Square className="h-4 w-4" />
            )}
          </button>
        )}

        {/* Radio for selection */}
        {selectable && (
          <div className="shrink-0">
            <div
              className={`
                w-4 h-4 rounded-full border-2
                ${isSelected ? 'border-primary bg-primary' : 'border-muted-foreground'}
                flex items-center justify-center
              `}
            >
              {isSelected && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
            </div>
          </div>
        )}

        {/* Sentence Text */}
        <span className={`flex-1 ${styles.text} ${isDiscarded ? 'line-through' : ''}`}>
          {sentence.text}
        </span>

        {/* Source Trace Button - always shown, disabled when no source */}
        <button
          type="button"
          onClick={handleSourceClick}
          disabled={!hasSource}
          className={`shrink-0 flex items-center gap-0.5 p-1 rounded transition-colors ${
            hasSource
              ? expanded
                ? 'text-[var(--accent-commit)] bg-[var(--hover-bg)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--accent-commit)] hover:bg-[var(--hover-bg)]'
              : 'text-[var(--text-tertiary)]/30 cursor-not-allowed'
          }`}
          title={
            hasSource
              ? expanded
                ? 'Collapse source context'
                : 'View source context'
              : 'Source context not available'
          }
        >
          <MapPin className="h-4 w-4" />
          {hasSource &&
            useInlineExpand &&
            (expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
        </button>
      </div>

      {/* Inline source context - shown when expanded */}
      {expanded && hasSource && (
        <div
          className={`
            px-3 pb-2 rounded-b border-l-4 ${styles.border}
            bg-muted/10
          `}
        >
          <SourceContextView
            turnHash={sentence.source!.turn_hash!}
            highlightStart={sentence.source?.start_char}
            highlightEnd={sentence.source?.end_char}
            mode="compact"
            highlightColor="yellow"
            contextData={contextData}
            autoFetch={contextData === undefined}
            loading={contextLoading}
            showHeader={true}
            showJumpLink={!!onJumpToConversation}
            onJumpClick={handleJumpClick}
          />
        </div>
      )}
    </div>
  );
}
