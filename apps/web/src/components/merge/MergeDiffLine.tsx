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
    bg: 'bg-green-50',
    text: 'text-green-900',
    prefix: '+',
    border: 'border-green-300',
  },
  removed: {
    bg: 'bg-red-50',
    text: 'text-red-900',
    prefix: '-',
    border: 'border-red-300',
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
          ${type === 'added' ? 'text-green-600' : ''}
          ${type === 'removed' ? 'text-red-600' : ''}
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
            <CheckSquare className="h-4 w-4 text-green-600" />
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
        className="shrink-0 text-muted-foreground hover:text-primary"
        title="View source context"
      >
        <MapPin className="h-4 w-4" />
      </button>
    </div>
  );
}
