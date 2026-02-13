'use client';

/**
 * ConflictEditPanel - Inline text editor for custom merge text
 */

import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Combine two texts with appropriate separator
 * Handles punctuation at the end of sourceText
 */
function combineTexts(sourceText: string, targetText: string): string {
  const trimmedSource = sourceText.trim();
  const trimmedTarget = targetText.trim();

  // If source ends with sentence-ending punctuation, just add space
  if (/[.!?。！？]$/.test(trimmedSource)) {
    return `${trimmedSource} ${trimmedTarget}`;
  }

  // Otherwise, add a period before the second text
  return `${trimmedSource}. ${trimmedTarget}`;
}

interface ConflictEditPanelProps {
  text: string;
  onChange: (text: string) => void;
  sourceText: string;
  targetText: string;
}

export function ConflictEditPanel({
  text,
  onChange,
  sourceText,
  targetText,
}: ConflictEditPanelProps) {
  const isEmpty = !text.trim();

  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-muted-foreground">
          Write your merged version:
        </label>
        {isEmpty && (
          <div className="flex items-center gap-1 text-xs text-[var(--diff-modified-accent)]">
            <AlertCircle className="h-3 w-3" />
            <span>Required to complete resolution</span>
          </div>
        )}
      </div>

      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter your merged text here..."
        className={cn(
          'w-full min-h-[100px] p-3 text-sm rounded-md border resize-y',
          'focus:outline-none focus:ring-2 focus:ring-[var(--accent-conversation)] focus:border-[var(--accent-conversation)]',
          isEmpty
            ? 'border-[var(--diff-modified-border)] bg-[var(--diff-modified-bg)]'
            : 'border-muted bg-background'
        )}
      />

      {/* Reference text helper */}
      <div className="flex gap-2 text-xs">
        <button
          type="button"
          onClick={() => onChange(sourceText)}
          className="text-[var(--diff-removed-accent)] hover:underline"
        >
          Use A
        </button>
        <span className="text-muted-foreground">|</span>
        <button
          type="button"
          onClick={() => onChange(targetText)}
          className="text-[var(--diff-added-accent)] hover:underline"
        >
          Use B
        </button>
        <span className="text-muted-foreground">|</span>
        <button
          type="button"
          onClick={() => onChange(combineTexts(sourceText, targetText))}
          className="text-[var(--status-info)] hover:underline"
        >
          Combine both
        </button>
      </div>
    </div>
  );
}
