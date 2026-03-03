'use client';

import { MapPin } from 'lucide-react';
import { WordDiffDisplay } from '@/components/merge/WordDiffDisplay';
import { SourceContextView } from '@/components/shared/SourceContextView';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { TurnContextData } from '@/lib/api';
import type { WordDiffSegment } from '@/types/merge';

interface DiffSentenceLineProps {
  text: string;
  type: 'context' | 'added' | 'removed';
  wordDiff?: WordDiffSegment[];
  onSourceClick?: () => void;
  hasSource?: boolean;
  /** 1-based line number displayed in the gutter (split mode) */
  lineNumber?: number;
  /** 1-based base line number for unified dual-gutter */
  baseLineNumber?: number;
  /** 1-based target line number for unified dual-gutter */
  targetLineNumber?: number;
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
  /** Source conversation title for hover tooltip preview */
  sourceTitle?: string;
}

const lineStyles = {
  context: {
    bg: 'bg-[var(--surface-app)]',
    text: 'text-[var(--text-primary)]',
    border: 'border-transparent',
    prefix: ' ',
    prefixColor: 'text-[var(--text-tertiary)]',
  },
  added: {
    bg: 'bg-[var(--diff-added-bg)]',
    text: 'text-[var(--text-primary)]',
    border: 'border-[var(--diff-added-line)]',
    prefix: '+',
    prefixColor: 'text-[var(--diff-added-accent)] font-bold',
  },
  removed: {
    bg: 'bg-[var(--diff-removed-bg)]',
    text: 'text-[var(--text-primary)]',
    border: 'border-[var(--diff-removed-line)]',
    prefix: '-',
    prefixColor: 'text-[var(--diff-removed-accent)] font-bold',
  },
};

export function DiffSentenceLine({
  text,
  type,
  wordDiff,
  onSourceClick,
  hasSource = false,
  lineNumber,
  baseLineNumber,
  targetLineNumber,
  expanded = false,
  inlineContextData,
  inlineContextLoading = false,
  turnHash,
  highlightStart,
  highlightEnd,
  onJumpToConversation,
  sourceTitle,
}: DiffSentenceLineProps) {
  const styles = lineStyles[type];
  const hasDualGutter = baseLineNumber !== undefined || targetLineNumber !== undefined;

  return (
    <div>
      <div
        className={`flex items-start gap-2 px-3 py-2 font-mono text-sm border-l-2 ${styles.border} ${styles.bg}`}
      >
        {hasDualGutter ? (
          <>
            <span className="w-8 shrink-0 select-none text-right text-[var(--text-tertiary)]/50 text-xs leading-5">
              {baseLineNumber ?? ''}
            </span>
            <span className="w-8 shrink-0 select-none text-right text-[var(--text-tertiary)]/50 text-xs leading-5">
              {targetLineNumber ?? ''}
            </span>
          </>
        ) : (
          <span className="w-8 shrink-0 select-none text-right text-[var(--text-tertiary)]/50 text-xs leading-5">
            {lineNumber ?? ''}
          </span>
        )}
        <span className={`shrink-0 select-none w-4 text-center ${styles.prefixColor}`}>
          {styles.prefix}
        </span>
        <div className={`flex-1 min-w-0 break-words whitespace-pre-wrap ${styles.text}`}>
          {wordDiff && wordDiff.length > 0 ? <WordDiffDisplay segments={wordDiff} /> : text}
        </div>
        {/* Source Trace Button - always shown, disabled when no source */}
        <Tooltip>
          <TooltipTrigger asChild>
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
            >
              <MapPin className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-xs">
            {hasSource ? (
              <div className="space-y-0.5">
                {sourceTitle && (
                  <div className="font-medium text-[10px] opacity-70">From: {sourceTitle}</div>
                )}
                <div>
                  {expanded ? 'Click to collapse source context' : 'Click to view source context'}
                </div>
              </div>
            ) : (
              'No source reference available'
            )}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Inline source context via SourceContextView */}
      {expanded && turnHash && (
        <div className="mx-2 mb-1">
          <SourceContextView
            turnHash={turnHash}
            highlightStart={highlightStart}
            highlightEnd={highlightEnd}
            wordDiff={wordDiff}
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
