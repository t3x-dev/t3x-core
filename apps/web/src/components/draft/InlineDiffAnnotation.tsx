'use client';

/**
 * InlineDiffAnnotation - Shows word-level diff annotations inline.
 *
 * Given a node and a matching diff pair, renders the text with
 * word-level additions, removals, and unchanged spans highlighted inline.
 */

import type { WordDiffSegment } from '@/lib/diffUtils';
import { cn } from '@/lib/utils';

interface InlineDiffAnnotationProps {
  segments: WordDiffSegment[];
  className?: string;
}

/**
 * Renders word-level diff inline with color-coded spans.
 * Added words show green, removed words show red with strikethrough.
 */
export function InlineDiffAnnotation({ segments, className }: InlineDiffAnnotationProps) {
  if (segments.length === 0) return null;

  return (
    <span className={cn('text-sm', className)}>
      {segments.map((seg, i) => (
        <span
          key={`${seg.type}-${i}`}
          className={cn(
            seg.type === 'added' &&
              'bg-[var(--diff-added-accent)]/15 text-[var(--diff-added-accent)] rounded-sm px-0.5',
            seg.type === 'removed' &&
              'bg-[var(--diff-removed-accent)]/15 text-[var(--diff-removed-accent)] line-through rounded-sm px-0.5',
            seg.type === 'unchanged' && 'text-[var(--text-primary)]'
          )}
        >
          {i > 0 && ' '}
          {seg.text}
        </span>
      ))}
    </span>
  );
}

interface DiffBadgeProps {
  added: number;
  removed: number;
  modified: number;
}

/**
 * Compact badge showing diff stats: "+X / -Y / ~Z"
 */
export function DiffBadge({ added, removed, modified }: DiffBadgeProps) {
  const parts: string[] = [];
  if (added > 0) parts.push(`+${added}`);
  if (removed > 0) parts.push(`-${removed}`);
  if (modified > 0) parts.push(`~${modified}`);

  if (parts.length === 0) return null;

  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-[var(--text-tertiary)] bg-[var(--color-bg-subtle)] px-1.5 py-0.5 rounded-full">
      {parts.join(' / ')}
    </span>
  );
}
