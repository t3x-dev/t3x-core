'use client';

/**
 * MergeConflictView - Main conflict card with two-column layout
 *
 * Displays a merge conflict with:
 * - Two-column layout showing source and target sides
 * - Inline source context for each side
 * - Word diff visualization
 * - Resolution buttons (Keep A, Keep B, Keep Both, Edit)
 * - Inline edit panel when Edit is selected
 */

import { cn } from '@/lib/utils';
import { isConflictResolved, useMergeWorkspaceStore } from '@/store/mergeWorkspaceStore';
import type { MergeSimilarPair } from '@/types/merge';
import { ConflictHeader } from './ConflictHeader';
import { ConflictResolutionButtons } from './ConflictResolutionButtons';
import { ConflictSide } from './ConflictSide';
import { WordDiffDisplay } from './WordDiffDisplay';

interface MergeConflictViewProps {
  pair: MergeSimilarPair;
  index: number;
  sourceBranch: string;
  targetBranch: string;
}

export function MergeConflictView({
  pair,
  index,
  sourceBranch,
  targetBranch,
}: MergeConflictViewProps) {
  const { extendedResolutions, resolveConflict, getEffectiveResolution } =
    useMergeWorkspaceStore();

  // Get effective resolution (standard or extended)
  const effectiveResolution = getEffectiveResolution(index);
  const extRes = extendedResolutions[String(index)];
  const resolved = isConflictResolved(pair, extRes);

  return (
    <div
      className={cn(
        'rounded-lg border p-4 transition-colors',
        resolved
          ? 'border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-950/30'
          : 'border-yellow-200 dark:border-yellow-800 bg-yellow-50/30 dark:bg-yellow-950/30'
      )}
    >
      {/* Header */}
      <ConflictHeader
        index={index}
        resolution={effectiveResolution}
        sourceBranch={sourceBranch}
        targetBranch={targetBranch}
      />

      {/* Word diff visualization */}
      {pair.wordDiff && pair.wordDiff.length > 0 && (
        <div className="mb-4 bg-muted/50 rounded-md p-3">
          <div className="text-xs text-muted-foreground mb-1">Changes:</div>
          <WordDiffDisplay segments={pair.wordDiff} />
        </div>
      )}

      {/* Two-column layout for source and target */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ConflictSide
          side="source"
          sentence={pair.source}
          label={`Branch ${sourceBranch}`}
          isSelected={effectiveResolution === 'source' || effectiveResolution === 'both'}
        />
        <ConflictSide
          side="target"
          sentence={pair.target}
          label={`Branch ${targetBranch}`}
          isSelected={effectiveResolution === 'target' || effectiveResolution === 'both'}
        />
      </div>

      {/* Resolution buttons */}
      <ConflictResolutionButtons
        current={effectiveResolution}
        onResolve={(resolution) => resolveConflict(index, resolution)}
        sourceBranch={sourceBranch}
        targetBranch={targetBranch}
      />
    </div>
  );
}
