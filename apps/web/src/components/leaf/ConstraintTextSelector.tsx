'use client';

import { CheckCircle, ShieldCheck, ShieldX, Trash2, XCircle } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { CommitV4Sentence, Constraint } from '@/lib/api';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ConstraintTextSelectorProps {
  sentences: CommitV4Sentence[];
  constraints: Constraint[];
  onAdd: (type: 'require' | 'exclude', value: string, sourceSentenceId: string) => void;
  onRemove: (constraintId: string) => void;
  saving?: boolean;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SelectionMode = 'require' | 'exclude';

interface HighlightRange {
  /** Absolute char offset in the merged text */
  start: number;
  end: number;
  type: 'require' | 'exclude';
  constraintId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a merged text string from sentences, tracking each sentence's offset */
function buildMergedText(sentences: CommitV4Sentence[]): {
  text: string;
  sentenceOffsets: { id: string; start: number; end: number }[];
} {
  let text = '';
  const sentenceOffsets: { id: string; start: number; end: number }[] = [];
  for (const s of sentences) {
    const start = text.length;
    text += s.text;
    sentenceOffsets.push({ id: s.id, start, end: text.length });
    text += ' '; // space separator between sentences
  }
  return { text: text.trimEnd(), sentenceOffsets };
}

/** Find which sentence a char offset belongs to */
function findSentenceAtOffset(
  offset: number,
  sentenceOffsets: { id: string; start: number; end: number }[]
): string | null {
  for (const s of sentenceOffsets) {
    if (offset >= s.start && offset < s.end) return s.id;
  }
  return null;
}

/** Build highlight ranges from constraints, mapped to merged text offsets */
function buildHighlightRanges(
  mergedText: string,
  sentenceOffsets: { id: string; start: number; end: number }[],
  constraints: Constraint[]
): HighlightRange[] {
  const ranges: HighlightRange[] = [];

  for (const c of constraints) {
    // Find which sentence this constraint links to
    const linkedSentenceId = ('source_sentence_id' in c && c.source_sentence_id) || null;
    const linkedByDescription = c.description
      ? sentenceOffsets.find((s) => c.description?.includes(s.id))?.id
      : null;
    const targetId = linkedSentenceId || linkedByDescription;
    if (!targetId) continue;

    const so = sentenceOffsets.find((s) => s.id === targetId);
    if (!so) continue;

    // Search within this sentence's range in the merged text
    const sentenceText = mergedText.slice(so.start, so.end);
    let searchFrom = 0;
    while (searchFrom < sentenceText.length) {
      const idx = sentenceText.indexOf(c.value, searchFrom);
      if (idx === -1) break;
      ranges.push({
        start: so.start + idx,
        end: so.start + idx + c.value.length,
        type: c.type,
        constraintId: c.id,
      });
      searchFrom = idx + c.value.length;
    }
  }

  // Sort and deduplicate overlaps
  ranges.sort((a, b) => a.start - b.start);
  const deduped: HighlightRange[] = [];
  let lastEnd = -1;
  for (const r of ranges) {
    if (r.start >= lastEnd) {
      deduped.push(r);
      lastEnd = r.end;
    }
  }
  return deduped;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ConstraintTextSelector({
  sentences,
  constraints,
  onAdd,
  onRemove,
  saving,
}: ConstraintTextSelectorProps) {
  const textRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<SelectionMode>('require');
  const [hoveredConstraintId, setHoveredConstraintId] = useState<string | null>(null);

  const { text: mergedText, sentenceOffsets } = buildMergedText(sentences);
  const highlightRanges = buildHighlightRanges(mergedText, sentenceOffsets, constraints);

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const selectedText = selection.toString().trim();
    if (!selectedText) return;

    // Find the selected text's position in the merged text
    const idx = mergedText.indexOf(selectedText);
    if (idx === -1) {
      selection.removeAllRanges();
      return;
    }

    // Determine which sentence the selection start belongs to
    const sentenceId = findSentenceAtOffset(idx, sentenceOffsets);
    if (!sentenceId) {
      selection.removeAllRanges();
      return;
    }

    onAdd(mode, selectedText, sentenceId);
    selection.removeAllRanges();
  }, [mergedText, sentenceOffsets, mode, onAdd]);

  const requireConstraints = constraints.filter((c) => c.type === 'require');
  const excludeConstraints = constraints.filter((c) => c.type === 'exclude');

  // Build rendered segments with highlights
  const segments: React.ReactNode[] = [];
  let cursor = 0;
  for (const range of highlightRanges) {
    if (range.start > cursor) {
      segments.push(<span key={`p-${cursor}`}>{mergedText.slice(cursor, range.start)}</span>);
    }
    const isHovered = hoveredConstraintId === range.constraintId;
    segments.push(
      <mark
        key={`hl-${range.constraintId}-${range.start}`}
        className={cn(
          'rounded-sm px-0.5 transition-all',
          range.type === 'require'
            ? 'bg-green-700/20 text-green-900 dark:text-green-100'
            : 'bg-red-700/20 text-red-900 dark:text-red-100',
          isHovered && 'ring-2 ring-offset-1',
          isHovered && range.type === 'require' && 'ring-green-500',
          isHovered && range.type === 'exclude' && 'ring-red-500'
        )}
      >
        {mergedText.slice(range.start, range.end)}
      </mark>
    );
    cursor = range.end;
  }
  if (cursor < mergedText.length) {
    segments.push(<span key={`p-${cursor}`}>{mergedText.slice(cursor)}</span>);
  }

  return (
    <div className="space-y-[var(--space-group)]">
      {/* Mode toggle */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={mode === 'require' ? 'default' : 'outline'}
          className={cn(
            mode === 'require' &&
              'bg-green-600 dark:bg-green-700 hover:bg-green-700 dark:hover:bg-green-600 text-white'
          )}
          onClick={() => setMode('require')}
        >
          <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
          Must Have
        </Button>
        <Button
          size="sm"
          variant={mode === 'exclude' ? 'default' : 'outline'}
          className={cn(
            mode === 'exclude' &&
              'bg-red-600 dark:bg-red-700 hover:bg-red-700 dark:hover:bg-red-600 text-white'
          )}
          onClick={() => setMode('exclude')}
        >
          <ShieldX className="h-3.5 w-3.5 mr-1.5" />
          Must Not Have
        </Button>
        <span className="text-xs text-[var(--color-text-muted)] ml-2">
          Select text below to add a constraint
        </span>
      </div>

      {/* Merged text block */}
      <div
        ref={textRef}
        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-4 py-3 text-sm text-[var(--text-primary)] leading-relaxed cursor-text select-text whitespace-pre-wrap"
        onMouseUp={handleMouseUp}
      >
        {segments}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-[var(--color-text-muted)]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-green-700/20 border border-green-700/30" />
          Must Have
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-red-700/20 border border-red-700/30" />
          Must Not Have
        </span>
      </div>

      {/* Constraint list */}
      {constraints.length > 0 && (
        <div className="space-y-3">
          {requireConstraints.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-[var(--status-success)] uppercase tracking-wide mb-1.5">
                Must Have ({requireConstraints.length})
              </h4>
              <div className="space-y-1">
                {requireConstraints.map((c) => (
                  <ConstraintRow
                    key={c.id}
                    constraint={c}
                    onRemove={() => onRemove(c.id)}
                    onHover={setHoveredConstraintId}
                    disabled={saving}
                  />
                ))}
              </div>
            </div>
          )}
          {excludeConstraints.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-[var(--status-error)] uppercase tracking-wide mb-1.5">
                Must Not Have ({excludeConstraints.length})
              </h4>
              <div className="space-y-1">
                {excludeConstraints.map((c) => (
                  <ConstraintRow
                    key={c.id}
                    constraint={c}
                    onRemove={() => onRemove(c.id)}
                    onHover={setHoveredConstraintId}
                    disabled={saving}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {constraints.length === 0 && (
        <p className="text-xs text-[var(--color-text-muted)] italic">
          Select text above to create constraints. Switch mode with the buttons.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Constraint Row
// ---------------------------------------------------------------------------

function ConstraintRow({
  constraint,
  onRemove,
  onHover,
  disabled,
}: {
  constraint: Constraint;
  onRemove: () => void;
  onHover: (id: string | null) => void;
  disabled?: boolean;
}) {
  const isRequire = constraint.type === 'require';

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm',
        isRequire
          ? 'border-[var(--status-success)]/20 bg-[var(--status-success-muted)]'
          : 'border-[var(--status-error)]/20 bg-[var(--status-error-muted)]'
      )}
      onMouseEnter={() => onHover(constraint.id)}
      onMouseLeave={() => onHover(null)}
    >
      {isRequire ? (
        <CheckCircle className="h-3.5 w-3.5 text-[var(--status-success)] shrink-0" />
      ) : (
        <XCircle className="h-3.5 w-3.5 text-[var(--status-error)] shrink-0" />
      )}
      <span
        className={cn(
          'flex-1 truncate font-medium',
          isRequire ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'
        )}
      >
        {constraint.value}
      </span>
      {constraint.description && (
        <span className="text-xs font-mono text-[var(--color-text-muted)] shrink-0">
          {constraint.description
            .replace('Selected from sentence ', '')
            .replace('Excluded from sentence ', '')}
        </span>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-5 w-5 shrink-0"
        onClick={onRemove}
        disabled={disabled}
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}
