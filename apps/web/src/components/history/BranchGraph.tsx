'use client';

/**
 * BranchGraph — minimal DAG visualization for commit history.
 *
 * Uses CSS border-left for linear chains and SVG paths for branch/merge points.
 * Designed to sit alongside CommitHistoryRow components.
 *
 * For now this is a simple linear implementation using CSS only.
 * SVG branch curves can be added later when multi-branch visualization is needed.
 */

import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface BranchGraphProps {
  /** Total number of commits in the list */
  commitCount: number;
  /** Index of this row (0-based) */
  index: number;
  /** Number of parents for this commit (0 = root, 2+ = merge) */
  parentCount: number;
  /** Branch name for coloring */
  branch: string | null;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Renders the vertical connector for a single commit row.
 * This component is intentionally simple — it shows a vertical line with a dot.
 * For complex DAG visualization, this can be extended with SVG later.
 */
export function BranchGraph({ commitCount, index, parentCount, branch }: BranchGraphProps) {
  const isFirst = index === 0;
  const isLast = index === commitCount - 1;
  const isMerge = parentCount >= 2;
  const isRoot = parentCount === 0;

  return (
    <div className="w-6 flex flex-col items-center shrink-0">
      {/* Top line */}
      {!isFirst && <div className="w-px flex-1 bg-[var(--stroke-divider)]" />}
      {isFirst && <div className="flex-1" />}

      {/* Node dot */}
      <div
        className={cn(
          'w-2.5 h-2.5 rounded-full border-2 shrink-0',
          isMerge
            ? 'border-amber-500 bg-amber-500/20'
            : isRoot
              ? 'border-[var(--accent-commit)] bg-[var(--accent-commit)]'
              : 'border-[var(--accent-commit)] bg-[var(--surface-card)]'
        )}
        title={isMerge ? 'Merge commit' : isRoot ? 'Root commit' : `Branch: ${branch || 'main'}`}
      />

      {/* Bottom line */}
      {!isLast && <div className="w-px flex-1 bg-[var(--stroke-divider)]" />}
      {isLast && <div className="flex-1" />}
    </div>
  );
}
