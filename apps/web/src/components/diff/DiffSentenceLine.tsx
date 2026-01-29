'use client';

import { MapPin } from 'lucide-react';
import { WordDiffDisplay } from '@/components/merge/WordDiffDisplay';
import type { WordDiffSegment } from '@/types/merge';

interface DiffSentenceLineProps {
  text: string;
  type: 'context' | 'added' | 'removed';
  wordDiff?: WordDiffSegment[];
  onSourceClick?: () => void;
  hasSource?: boolean;
}

const lineStyles = {
  context: { bg: 'bg-muted/20', text: 'text-foreground', border: 'border-transparent', prefix: ' ' },
  added: { bg: 'bg-green-50', text: 'text-green-900', border: 'border-green-300', prefix: '+' },
  removed: { bg: 'bg-red-50', text: 'text-red-900', border: 'border-red-300', prefix: '-' },
};

export function DiffSentenceLine({
  text,
  type,
  wordDiff,
  onSourceClick,
  hasSource = false,
}: DiffSentenceLineProps) {
  const styles = lineStyles[type];

  return (
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
          className="shrink-0 p-1 text-muted-foreground hover:text-primary transition-colors"
          title="View source context"
        >
          <MapPin className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
