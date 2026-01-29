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

import type { MergeSimilarPair } from '@/types/merge';
import { useMergeWorkspaceStore, isConflictResolved } from '@/store/mergeWorkspaceStore';
import { ConflictHeader } from './ConflictHeader';
import { ConflictSide } from './ConflictSide';
import { ConflictResolutionButtons } from './ConflictResolutionButtons';
import { ConflictEditPanel } from './ConflictEditPanel';
import { WordDiffDisplay } from './WordDiffDisplay';
import { cn } from '@/lib/utils';

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
  const {
    extendedResolutions,
    resolveConflict,
    setCustomText,
    getEffectiveResolution,
  } = useMergeWorkspaceStore();

  // Get effective resolution (standard or extended)
  const effectiveResolution = getEffectiveResolution(index);
  const extRes = extendedResolutions[String(index)];
  const resolved = isConflictResolved(pair, extRes);

  // Get extended resolution data for edit mode
  const customText = extRes?.type === 'edit' ? extRes.customText || '' : '';

  return (
    <div
      className={cn(
        'rounded-lg border p-4 transition-colors',
        resolved
          ? 'border-green-200 bg-green-50/30'
          : 'border-yellow-200 bg-yellow-50/30'
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
          isSelected={effectiveResolution === 'source'}
        />
        <ConflictSide
          side="target"
          sentence={pair.target}
          label={`Branch ${targetBranch}`}
          isSelected={effectiveResolution === 'target'}
        />
      </div>

      {/* Resolution buttons */}
      <ConflictResolutionButtons
        current={effectiveResolution}
        onResolve={(resolution) => resolveConflict(index, resolution)}
        sourceBranch={sourceBranch}
        targetBranch={targetBranch}
      />

      {/* Edit panel (shown when Edit is selected) */}
      {effectiveResolution === 'edit' && (
        <ConflictEditPanel
          text={customText}
          onChange={(text) => setCustomText(index, text)}
          sourceText={pair.source.text}
          targetText={pair.target.text}
        />
      )}
    </div>
  );
}
