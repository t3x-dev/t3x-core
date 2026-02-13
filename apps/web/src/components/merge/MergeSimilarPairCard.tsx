import { useCallback, useRef } from 'react';
import { glass } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';
import type { MergeSimilarPair } from '@/types/merge';
import { WordDiffDisplay } from './WordDiffDisplay';

interface MergeSimilarPairCardProps {
  pair: MergeSimilarPair;
  index: number;
}

/**
 * Card for a similar sentence pair requiring user decision
 * 相似句子对卡片，需要用户决策
 *
 * Shows:
 * - Source and target text
 * - Word diff visualization
 * - Radio buttons to pick source or target
 * - Constraints for each side
 */
export function MergeSimilarPairCard({ pair, index }: MergeSimilarPairCardProps) {
  const resolveSimilarPair = useCanvasStore((s) => s.resolveSimilarPair);
  const isResolved = pair.resolution !== undefined;
  const isUpdatingRef = useRef(false);

  const handleSelect = useCallback(
    (pick: 'source' | 'target') => {
      // Prevent double updates
      if (isUpdatingRef.current) return;
      if (pair.resolution === pick) return; // Already selected

      isUpdatingRef.current = true;
      // Use requestAnimationFrame to batch DOM updates
      requestAnimationFrame(() => {
        resolveSimilarPair(index, pick);
        isUpdatingRef.current = false;
      });
    },
    [index, pair.resolution, resolveSimilarPair]
  );

  return (
    <div
      className={cn(
        'rounded-lg p-[var(--space-group)] elevation-1',
        glass.cardBase,
        isResolved
          ? 'ring-1 ring-[var(--diff-added-line)]/30'
          : 'ring-1 ring-[var(--diff-modified-line)]/30'
      )}
    >
      {/* Diff visualization */}
      <div className="mb-[var(--space-item)]">
        <WordDiffDisplay segments={pair.wordDiff} />
      </div>

      {/* Source option */}
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="radio"
          name={`pair-${pair.source.id}-${pair.target.id}`}
          checked={pair.resolution === 'source'}
          onChange={() => handleSelect('source')}
          className="mt-1"
        />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-[var(--text-primary)]">Keep source</span>
            <span className="inline-flex items-center rounded-full border border-[var(--diff-added-line)]/40 text-[var(--diff-added-line)] bg-transparent px-1.5 py-0 text-[10px] font-medium">
              Source
            </span>
          </div>
          <div className="text-sm text-[var(--text-secondary)]">{pair.source.text}</div>
          {pair.sourceConstraints.length > 0 && (
            <div className="text-xs text-[var(--accent-commit)] mt-1">
              Constraints: {pair.sourceConstraints.map((c) => c.value).join(', ')}
            </div>
          )}
        </div>
      </label>

      {/* Target option */}
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="radio"
          name={`pair-${pair.source.id}-${pair.target.id}`}
          checked={pair.resolution === 'target'}
          onChange={() => handleSelect('target')}
          className="mt-1"
        />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-[var(--text-primary)]">Keep target</span>
            <span className="inline-flex items-center rounded-full border border-[var(--accent-pending)]/40 text-[var(--accent-pending)] bg-transparent px-1.5 py-0 text-[10px] font-medium">
              Target
            </span>
          </div>
          <div className="text-sm text-[var(--text-secondary)]">{pair.target.text}</div>
          {pair.targetConstraints.length > 0 && (
            <div className="text-xs text-[var(--accent-commit)] mt-1">
              Constraints: {pair.targetConstraints.map((c) => c.value).join(', ')}
            </div>
          )}
        </div>
      </label>
    </div>
  );
}
