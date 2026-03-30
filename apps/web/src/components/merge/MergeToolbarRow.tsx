'use client';

/**
 * MergeToolbarRow — full-width centered resolution toolbar.
 *
 * Sits BETWEEN the two panes (not inside either), below each conflict frame's
 * content. Spans the full width across both source and target panes.
 *
 * Buttons: [● Source] [Both] [Target ●] | [Fine-tune]
 * - Source dot: --merge-source-accent (blue)
 * - Target dot: --merge-target-accent (teal)
 * - Unresolved: amber left-edge accent bar (3px, --merge-conflict-accent)
 * - Resolved: amber bar disappears
 * - Fine-tune: only visible when hasSlotConflicts is true
 */

import { cn } from '@/lib/utils';
import type { FrameResolution } from './types';

// ============================================================================
// Props
// ============================================================================

export interface MergeToolbarRowProps {
  resolution: FrameResolution | null;
  onResolve: (resolution: FrameResolution) => void;
  hasSlotConflicts: boolean;
}

// ============================================================================
// SideDot — small colored circle used inside buttons
// ============================================================================

function SideDot({ side }: { side: 'source' | 'target' }) {
  return (
    <span
      className="inline-block w-[6px] h-[6px] rounded-full shrink-0"
      style={{
        background: side === 'source' ? 'var(--merge-source-accent)' : 'var(--merge-target-accent)',
      }}
    />
  );
}

// ============================================================================
// MergeToolbarRow
// ============================================================================

export function MergeToolbarRow({ resolution, onResolve, hasSlotConflicts }: MergeToolbarRowProps) {
  const isResolved = resolution !== null;

  function handleSource() {
    onResolve({ type: 'source' });
  }
  function handleBoth() {
    onResolve({ type: 'both' });
  }
  function handleTarget() {
    onResolve({ type: 'target' });
  }

  const chosenSource = resolution?.type === 'source';
  const chosenBoth = resolution?.type === 'both';
  const chosenTarget = resolution?.type === 'target';

  return (
    <div
      className={cn(
        'relative flex items-center justify-center gap-1.5 px-4 py-[5px]',
        'border-t border-b border-[var(--stroke-divider)]',
        isResolved ? 'bg-[var(--diff-added-accent)]/4' : 'bg-[var(--surface-elevated)]'
      )}
    >
      {/* Left-edge amber accent bar — disappears when resolved */}
      <span
        className={cn(
          'absolute left-0 top-0 bottom-0 w-[3px] transition-opacity duration-200',
          isResolved ? 'opacity-0' : 'opacity-50'
        )}
        style={{ background: 'var(--merge-conflict-accent)' }}
      />

      {/* Source button */}
      <button
        type="button"
        onClick={handleSource}
        className={cn(
          'flex items-center gap-[5px] rounded-[5px] border px-3.5 py-1',
          'text-[11px] font-semibold transition-all duration-150 cursor-pointer',
          chosenSource
            ? 'bg-[var(--merge-source-accent)]/12 border-[var(--merge-source-accent)]/40 text-[var(--merge-source-accent)]'
            : 'bg-transparent border-[var(--stroke-divider)] text-[var(--text-tertiary)] hover:bg-[var(--hover-bg-strong)] hover:text-[var(--text-secondary)] hover:border-[var(--stroke-strong)]'
        )}
      >
        <SideDot side="source" />
        Source
      </button>

      {/* Both button */}
      <button
        type="button"
        onClick={handleBoth}
        className={cn(
          'flex items-center gap-[5px] rounded-[5px] border px-3.5 py-1',
          'text-[11px] font-semibold transition-all duration-150 cursor-pointer',
          chosenBoth
            ? 'bg-[var(--merge-source-accent)]/8 border-[var(--merge-source-accent)]/30 text-[var(--accent-commit)]'
            : 'bg-transparent border-[var(--stroke-divider)] text-[var(--text-tertiary)] hover:bg-[var(--hover-bg-strong)] hover:text-[var(--text-secondary)] hover:border-[var(--stroke-strong)]'
        )}
      >
        Both
      </button>

      {/* Target button */}
      <button
        type="button"
        onClick={handleTarget}
        className={cn(
          'flex items-center gap-[5px] rounded-[5px] border px-3.5 py-1',
          'text-[11px] font-semibold transition-all duration-150 cursor-pointer',
          chosenTarget
            ? 'bg-[var(--merge-target-accent)]/12 border-[var(--merge-target-accent)]/40 text-[var(--merge-target-accent)]'
            : 'bg-transparent border-[var(--stroke-divider)] text-[var(--text-tertiary)] hover:bg-[var(--hover-bg-strong)] hover:text-[var(--text-secondary)] hover:border-[var(--stroke-strong)]'
        )}
      >
        Target
        <SideDot side="target" />
      </button>

      {/* Separator + Fine-tune button — only when per-slot conflicts exist */}
      {hasSlotConflicts && (
        <span
          className="inline-block w-px h-4 shrink-0"
          style={{ background: 'var(--stroke-divider)' }}
        />
      )}
      {hasSlotConflicts && (
        <button
          type="button"
          className={cn(
            'rounded border border-[var(--stroke-divider)] bg-transparent px-2 py-[3px] ml-1',
            'text-[10px] font-medium text-[var(--text-tertiary)] cursor-pointer',
            'hover:bg-[var(--hover-bg-strong)] hover:text-[var(--text-secondary)] hover:border-[var(--stroke-strong)]',
            'transition-all duration-150'
          )}
        >
          Fine-tune
        </button>
      )}
    </div>
  );
}
