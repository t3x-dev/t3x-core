'use client';

/**
 * UnifiedDiffView - Git-style unified diff visualization
 *
 * Shows merge conflicts and changes in a familiar Git diff format:
 * - Identical sentences (auto-kept)
 * - Conflicts (need resolution) - uses MergeConflictView for inline context
 * - Source-only sentences
 * - Target-only sentences
 */

import { useMergeWorkspaceStore } from '@/store/mergeWorkspaceStore';
import type { Merge2WayResult, Sentence } from '@/types/merge';
import { MergeConflictView } from './MergeConflictView';
import { MergeDiffLine } from './MergeDiffLine';
import { MergeDiffSection } from './MergeDiffSection';

interface UnifiedDiffViewProps {
  prepared: Merge2WayResult;
  onResolvePair: (index: number, pick: 'source' | 'target') => void;
  onToggleKeep: (side: 'source' | 'target', index: number) => void;
  onSourceClick: (sentence: Sentence) => void;
  sourceBranch?: string;
  targetBranch?: string;
}

export function UnifiedDiffView({
  prepared,
  onResolvePair,
  onToggleKeep,
  onSourceClick,
  sourceBranch = 'A',
  targetBranch = 'B',
}: UnifiedDiffViewProps) {
  const { identical, similarPairs, onlyInSource, onlyInTarget } = prepared;
  const { getUnresolvedCount } = useMergeWorkspaceStore();

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Identical Sentences */}
      {identical.length > 0 && (
        <MergeDiffSection
          title="Identical"
          subtitle={`${identical.length} sentences (auto-kept)`}
          variant="success"
          defaultCollapsed
        >
          <div className="space-y-1">
            {identical.map((sentence, idx) => (
              <MergeDiffLine
                key={`identical-${idx}`}
                type="context"
                sentence={sentence}
                onSourceClick={() => onSourceClick(sentence)}
              />
            ))}
          </div>
        </MergeDiffSection>
      )}

      {/* Conflicts (Similar Pairs) - Using MergeConflictView with inline context */}
      {similarPairs.length > 0 && (
        <MergeDiffSection
          title="Conflicts"
          subtitle={`${getUnresolvedCount()} of ${similarPairs.length} need resolution`}
          variant={getUnresolvedCount() > 0 ? 'warning' : 'success'}
        >
          <div className="space-y-4">
            {similarPairs.map((pair, idx) => (
              <MergeConflictView
                key={`conflict-${idx}`}
                pair={pair}
                index={idx}
                sourceBranch={sourceBranch}
                targetBranch={targetBranch}
              />
            ))}
          </div>
        </MergeDiffSection>
      )}

      {/* Source-Only Sentences */}
      {onlyInSource.length > 0 && (
        <MergeDiffSection
          title="Source Only"
          subtitle={`${onlyInSource.length} sentences from source branch`}
          variant="info"
        >
          <div className="space-y-1">
            {onlyInSource.map((candidate, idx) => (
              <MergeDiffLine
                key={`source-${idx}`}
                type="added"
                sentence={candidate.sentence}
                isKept={candidate.keep}
                onToggleKeep={() => onToggleKeep('source', idx)}
                onSourceClick={() => onSourceClick(candidate.sentence)}
                checkable
              />
            ))}
          </div>
        </MergeDiffSection>
      )}

      {/* Target-Only Sentences */}
      {onlyInTarget.length > 0 && (
        <MergeDiffSection
          title="Target Only"
          subtitle={`${onlyInTarget.length} sentences from target branch`}
          variant="info"
        >
          <div className="space-y-1">
            {onlyInTarget.map((candidate, idx) => (
              <MergeDiffLine
                key={`target-${idx}`}
                type="added"
                sentence={candidate.sentence}
                isKept={candidate.keep}
                onToggleKeep={() => onToggleKeep('target', idx)}
                onSourceClick={() => onSourceClick(candidate.sentence)}
                checkable
              />
            ))}
          </div>
        </MergeDiffSection>
      )}

      {/* Empty State */}
      {identical.length === 0 &&
        similarPairs.length === 0 &&
        onlyInSource.length === 0 &&
        onlyInTarget.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No differences found between commits.
          </div>
        )}
    </div>
  );
}
