'use client';

/**
 * MergeDiffLine - Single line in diff view
 *
 * Renders with Git-style +/- prefixes and colors.
 */

import { Check, CheckSquare, MapPin, Square } from 'lucide-react';
import type { Sentence } from '@/types/merge';

type LineType = 'context' | 'added' | 'removed';

interface MergeDiffLineProps {
  type: LineType;
  sentence: Sentence;
  isSelected?: boolean;
  isKept?: boolean;
  onSelect?: () => void;
  onToggleKeep?: () => void;
  onSourceClick: () => void;
  selectable?: boolean;
  checkable?: boolean;
}

const lineStyles: Record<LineType, { bg: string; text: string; prefix: string; border: string }> = {
  context: {
    bg: 'bg-muted/20',
    text: 'text-foreground',
    prefix: ' ',
    border: 'border-transparent',
  },
  added: {
    bg: 'bg-green-50 dark:bg-green-950/30',
    text: 'text-green-900 dark:text-green-100',
    prefix: '+',
    border: 'border-green-300 dark:border-green-700',
  },
  removed: {
    bg: 'bg-red-50 dark:bg-red-950/30',
    text: 'text-red-900 dark:text-red-100',
    prefix: '-',
    border: 'border-red-300 dark:border-red-700',
  },
};

export function MergeDiffLine({
  type,
  sentence,
  isSelected,
  isKept,
  onSelect,
  onToggleKeep,
  onSourceClick,
  selectable,
  checkable,
}: MergeDiffLineProps) {
  const styles = lineStyles[type];
  const isDiscarded = checkable && !isKept;
  const hasSource = !!sentence.source?.turn_hash;

  return (
    <div
      className={`
        flex items-start gap-2 px-3 py-2 font-mono text-sm rounded
        border-l-4 ${styles.border} ${styles.bg}
        ${isSelected ? 'ring-2 ring-primary ring-offset-1' : ''}
        ${isDiscarded ? 'opacity-50' : ''}
        ${selectable ? 'cursor-pointer hover:brightness-95' : ''}
      `}
      onClick={selectable ? onSelect : undefined}
    >
      {/* Prefix */}
      <span
        className={`
          shrink-0 w-4 text-center font-bold
          ${type === 'added' ? 'text-green-600 dark:text-green-400' : ''}
          ${type === 'removed' ? 'text-red-600 dark:text-red-400' : ''}
        `}
      >
        {styles.prefix}
      </span>

      {/* Checkbox for keep/discard */}
      {checkable && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleKeep?.();
          }}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          {isKept ? (
            <CheckSquare className="h-4 w-4 text-green-600 dark:text-green-400" />
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

      {/* Source Trace Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onSourceClick();
        }}
        className={`shrink-0 ${hasSource ? 'text-muted-foreground hover:text-primary cursor-pointer' : 'text-muted-foreground/30 cursor-not-allowed'}`}
        title={hasSource ? 'View source context' : 'Source context not available'}
        disabled={!hasSource}
      >
        <MapPin className="h-4 w-4" />
      </button>
    </div>
  );
}
