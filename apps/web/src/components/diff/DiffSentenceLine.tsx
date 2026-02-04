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
    bg: 'bg-muted/20',
    text: 'text-foreground',
    border: 'border-transparent',
    prefix: ' ',
  },
  added: {
    bg: 'bg-green-50 dark:bg-green-950/30',
    text: 'text-green-900 dark:text-green-100',
    border: 'border-green-300 dark:border-green-700',
    prefix: '+',
  },
  removed: {
    bg: 'bg-red-50 dark:bg-red-950/30',
    text: 'text-red-900 dark:text-red-100',
    border: 'border-red-300 dark:border-red-700',
    prefix: '-',
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
        className={`flex items-start gap-2 px-3 py-2 font-mono text-sm border-l-4 ${styles.border} ${styles.bg}`}
      >
        <span className={`shrink-0 select-none ${styles.text} opacity-50`}>{styles.prefix}</span>
        <div className={`flex-1 min-w-0 break-words whitespace-pre-wrap ${styles.text}`}>
          {wordDiff && wordDiff.length > 0 ? <WordDiffDisplay segments={wordDiff} /> : text}
        </div>
        {hasSource && onSourceClick && (
          <button
            type="button"
            onClick={onSourceClick}
            className={`shrink-0 p-1 transition-colors ${
              expanded
                ? 'text-primary bg-primary/10 rounded'
                : 'text-muted-foreground hover:text-primary'
            }`}
            title={expanded ? 'Collapse source context' : 'View source context'}
          >
            <MapPin className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Inline source context */}
      {expanded && (
        <div className="mx-2 mb-1 rounded-lg border border-border/60 bg-muted/30 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/40 bg-muted/50">
            <span className="text-[0.65rem] font-medium text-muted-foreground uppercase tracking-wide">
              Source Context
            </span>
            {onExpandModal && (
              <button
                type="button"
                onClick={onExpandModal}
                className="inline-flex items-center gap-1 text-[0.6rem] text-muted-foreground hover:text-primary transition-colors"
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
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Loading context...</span>
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
              <div className="text-xs text-muted-foreground py-3 text-center">
                Could not load conversation context.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
