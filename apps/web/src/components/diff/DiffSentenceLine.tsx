'use client';

import { MapPin } from 'lucide-react';
import { WordDiffDisplay } from '@/components/merge/WordDiffDisplay';
import { SourceContextView } from '@/components/shared/SourceContextView';
import type { TurnContextData } from '@/lib/api';
import type { WordDiffSegment } from '@/types/merge';

interface DiffSentenceLineProps {
  text: string;
  type: 'context' | 'added' | 'removed';
  wordDiff?: WordDiffSegment[];
  onSourceClick?: () => void;
  hasSource?: boolean;
  /** Inline source context props */
  expanded?: boolean;
  inlineContextData?: TurnContextData | null;
  inlineContextLoading?: boolean;
  /** Turn hash for SourceContextView */
  turnHash?: string;
  /** Highlight start char for SourceContextView */
  highlightStart?: number;
  /** Highlight end char for SourceContextView */
  highlightEnd?: number;
  /** Callback when "Jump to conversation" is clicked */
  onJumpToConversation?: (conversationId: string) => void;
}

const lineStyles = {
  context: {
    bg: 'bg-[var(--surface-app)]',
    text: 'text-[var(--text-primary)]',
    border: 'border-transparent',
    prefix: ' ',
    decoration: '',
  },
  added: {
    bg: 'bg-[var(--diff-added-bg)]',
    text: 'text-[var(--text-primary)]',
    border: 'border-[var(--diff-added-line)]',
    prefix: '+',
    decoration: '',
  },
  removed: {
    bg: 'bg-[var(--diff-removed-bg)]',
    text: 'text-[var(--text-primary)]',
    border: 'border-[var(--diff-removed-line)]',
    prefix: '-',
    decoration: 'line-through',
  },
};

export function DiffSentenceLine({
  text,
  type,
  wordDiff,
  onSourceClick,
  hasSource = false,
  expanded = false,
  inlineContextData,
  inlineContextLoading = false,
  turnHash,
  highlightStart,
  highlightEnd,
  onJumpToConversation,
}: DiffSentenceLineProps) {
  const styles = lineStyles[type];

  return (
    <div>
      <div
        className={`flex items-start gap-2 px-3 py-2 font-mono text-sm border-l-2 ${styles.border} ${styles.bg}`}
      >
        <span className="shrink-0 select-none text-[var(--text-tertiary)]">{styles.prefix}</span>
        <div
          className={`flex-1 min-w-0 break-words whitespace-pre-wrap ${styles.text} ${wordDiff && wordDiff.length > 0 ? '' : styles.decoration}`}
        >
          {wordDiff && wordDiff.length > 0 ? <WordDiffDisplay segments={wordDiff} /> : text}
        </div>
        {/* Source Trace Button - always shown, disabled when no source */}
        <button
          type="button"
          onClick={hasSource && onSourceClick ? onSourceClick : undefined}
          disabled={!hasSource}
          className={`shrink-0 p-1 rounded transition-colors ${
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
          <MapPin className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Inline source context via SourceContextView */}
      {expanded && turnHash && (
        <div className="mx-2 mb-1">
          <SourceContextView
            turnHash={turnHash}
            highlightStart={highlightStart}
            highlightEnd={highlightEnd}
            contextData={inlineContextData}
            autoFetch={false}
            loading={inlineContextLoading}
            showJumpLink={!!onJumpToConversation}
            onJumpClick={onJumpToConversation}
          />
        </div>
      )}
    </div>
  );
}
