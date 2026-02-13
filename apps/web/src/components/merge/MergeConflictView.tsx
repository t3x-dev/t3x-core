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

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
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
  const router = useRouter();
  const { extendedResolutions, resolveConflict, getEffectiveResolution, projectId } =
    useMergeWorkspaceStore();

  // Get effective resolution (standard or extended)
  const effectiveResolution = getEffectiveResolution(index);
  const extRes = extendedResolutions[String(index)];
  const resolved = isConflictResolved(pair, extRes);

  // Handle jump to conversation
  const handleJumpToConversation = useCallback(
    (conversationId: string) => {
      if (projectId) {
        router.push(`/project/${projectId}/conversation/${conversationId}`);
      }
    },
    [projectId, router]
  );

  return (
    <div
      className={cn(
        'rounded-lg border p-[var(--space-group)] transition-colors elevation-1',
        resolved
          ? 'border-[var(--diff-added-line)]/20 bg-[var(--diff-added-bg)]'
          : 'border-[var(--diff-modified-line)]/20 bg-[var(--diff-modified-bg)]'
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
        <div className="mb-[var(--space-group)] bg-[var(--glass-bg-reading-soft)] rounded-md p-3">
          <div className="text-xs text-[var(--text-tertiary)] mb-1">Changes:</div>
          <WordDiffDisplay segments={pair.wordDiff} />
        </div>
      )}

      {/* Two-column layout for source and target */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--space-group)]">
        <ConflictSide
          side="source"
          sentence={pair.source}
          label={`Branch ${sourceBranch}`}
          isSelected={effectiveResolution === 'source' || effectiveResolution === 'both'}
          onJumpToConversation={handleJumpToConversation}
        />
        <ConflictSide
          side="target"
          sentence={pair.target}
          label={`Branch ${targetBranch}`}
          isSelected={effectiveResolution === 'target' || effectiveResolution === 'both'}
          onJumpToConversation={handleJumpToConversation}
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
