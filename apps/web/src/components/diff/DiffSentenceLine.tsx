'use client';

import { Expand, Loader2, MapPin } from 'lucide-react';
import { WordDiffDisplay } from '@/components/merge/WordDiffDisplay';
import type { TurnContextData } from '@/lib/api';
import type { WordDiffSegment } from '@/types/merge';
import { TurnBubble } from './DiffSourceContextModal';

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
  onExpandModal?: () => void;
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
  onExpandModal,
}: DiffSentenceLineProps) {
  const styles = lineStyles[type];

  return (
    <div>
      <div
        className={`flex items-start gap-2 px-3 py-2 font-mono text-sm border-l-2 ${styles.border} ${styles.bg}`}
      >
        <span className={`shrink-0 select-none ${styles.text} opacity-50`}>{styles.prefix}</span>
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

      {/* Inline source context */}
      {expanded && (
        <div className="mx-2 mb-1 rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-card)] overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)]">
            <span className="text-[0.65rem] font-medium text-[var(--text-tertiary)] uppercase tracking-wide">
              Source Context
            </span>
            {onExpandModal && (
              <button
                type="button"
                onClick={onExpandModal}
                className="inline-flex items-center gap-1 text-[0.6rem] text-[var(--text-tertiary)] hover:text-[var(--accent-commit)] transition-colors"
                title="Open in full modal"
              >
                <Expand size={10} />
                Expand
              </button>
            )}
          </div>
          <div className="px-3 py-2 max-h-[200px] overflow-y-auto">
            {inlineContextLoading && (
              <div className="flex items-center gap-2 py-4 justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-[var(--text-tertiary)]" />
                <span className="text-xs text-[var(--text-tertiary)]">Loading context...</span>
              </div>
            )}
            {!inlineContextLoading && inlineContextData && (
              <div className="space-y-2">
                {inlineContextData.context.map((turn, idx) => (
                  <TurnBubble key={turn.turn_hash || idx} turn={turn} />
                ))}
              </div>
            )}
            {!inlineContextLoading && !inlineContextData && (
              <div className="text-xs text-[var(--text-tertiary)] py-3 text-center">
                Could not load conversation context.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
