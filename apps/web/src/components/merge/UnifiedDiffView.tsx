'use client';

/**
 * UnifiedDiffView - Git-style unified diff visualization
 *
 * Shows merge conflicts and changes in a familiar Git diff format:
 * - Identical sentences (auto-kept)
 * - Conflicts (need resolution)
 * - Source-only sentences
 * - Target-only sentences
 */

import type { Merge2WayResult, Sentence } from '@/types/merge';
import { MergeDiffSection } from './MergeDiffSection';
import { MergeDiffLine } from './MergeDiffLine';

interface UnifiedDiffViewProps {
  prepared: Merge2WayResult;
  onResolvePair: (index: number, pick: 'source' | 'target') => void;
  onToggleKeep: (side: 'source' | 'target', index: number) => void;
  onSourceClick: (sentence: Sentence) => void;
}

export function UnifiedDiffView({
  prepared,
  onResolvePair,
  onToggleKeep,
  onSourceClick,
}: UnifiedDiffViewProps) {
  const { identical, similarPairs, onlyInSource, onlyInTarget } = prepared;

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

      {/* Conflicts (Similar Pairs) */}
      {similarPairs.length > 0 && (
        <MergeDiffSection
          title="Conflicts"
          subtitle={`${similarPairs.length} pairs need resolution`}
          variant={similarPairs.some(p => !p.resolution) ? 'warning' : 'success'}
        >
          <div className="space-y-4">
            {similarPairs.map((pair, idx) => (
              <div
                key={`pair-${idx}`}
                className={`rounded-lg border p-4 ${
                  pair.resolution
                    ? 'border-green-200 bg-green-50/50'
                    : 'border-yellow-200 bg-yellow-50/50'
                }`}
              >
                {/* Pair Header */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-muted-foreground">
                    @@ Pair {idx + 1} @@
                  </span>
                  {pair.resolution && (
                    <span className="text-xs text-green-600 font-medium">
                      Resolved: {pair.resolution}
                    </span>
                  )}
                </div>

                {/* Word Diff Display */}
                {pair.wordDiff && pair.wordDiff.length > 0 && (
                  <div className="mb-3 font-mono text-sm bg-muted/50 rounded p-2">
                    {pair.wordDiff.map((seg, segIdx) => (
                      <span
                        key={segIdx}
                        className={
                          seg.type === 'removed'
                            ? 'bg-red-100 text-red-800 line-through px-0.5'
                            : seg.type === 'added'
                            ? 'bg-green-100 text-green-800 px-0.5'
                            : ''
                        }
                      >
                        {seg.text}{' '}
                      </span>
                    ))}
                  </div>
                )}

                {/* Source Option */}
                <MergeDiffLine
                  type="removed"
                  sentence={pair.source}
                  isSelected={pair.resolution === 'source'}
                  onSelect={() => onResolvePair(idx, 'source')}
                  onSourceClick={() => onSourceClick(pair.source)}
                  selectable
                />

                {/* Target Option */}
                <MergeDiffLine
                  type="added"
                  sentence={pair.target}
                  isSelected={pair.resolution === 'target'}
                  onSelect={() => onResolvePair(idx, 'target')}
                  onSourceClick={() => onSourceClick(pair.target)}
                  selectable
                />
              </div>
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
