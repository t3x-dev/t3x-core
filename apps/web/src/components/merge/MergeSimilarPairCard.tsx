import { useCallback, useRef } from 'react';
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
      className={`border rounded-lg p-4 ${
        isResolved ? 'border-green-300 bg-green-50' : 'border-yellow-300 bg-yellow-50'
      }`}
    >
      {/* Diff visualization */}
      <div className="mb-3">
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
          <div className="font-medium">Keep source</div>
          <div className="text-sm text-gray-600">{pair.source.text}</div>
          {pair.sourceConstraints.length > 0 && (
            <div className="text-xs text-blue-600 mt-1">
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
          <div className="font-medium">Keep target</div>
          <div className="text-sm text-gray-600">{pair.target.text}</div>
          {pair.targetConstraints.length > 0 && (
            <div className="text-xs text-blue-600 mt-1">
              Constraints: {pair.targetConstraints.map((c) => c.value).join(', ')}
            </div>
          )}
        </div>
      </label>
    </div>
  );
}
