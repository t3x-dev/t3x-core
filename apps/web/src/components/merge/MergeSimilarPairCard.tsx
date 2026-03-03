import { ArrowLeft, ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useTerminology } from '@/hooks/useTerminology';
import { getMergeSuggestion, type MergeSuggestion } from '@/lib/api';
import { glass } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';
import type { MergeSimilarPair } from '@/types/merge';
import { WordDiffDisplay } from './WordDiffDisplay';

interface MergeSimilarPairCardProps {
  pair: MergeSimilarPair;
  index: number;
  mergeDraftId?: string;
}

/**
 * Card for a similar sentence pair requiring user decision
 * 相似句子对卡片，需要用户决策
 *
 * Shows:
 * - Source and target text
 * - Word diff visualization
 * - Radio buttons to pick source or target
 * - AI suggestion option (if merge draft ID available)
 */
export function MergeSimilarPairCard({ pair, index, mergeDraftId }: MergeSimilarPairCardProps) {
  const resolveSimilarPair = useCanvasStore((s) => s.resolveSimilarPair);
  const { t } = useTerminology();
  const isResolved = pair.resolution !== undefined;
  const isUpdatingRef = useRef(false);

  const [suggestion, setSuggestion] = useState<MergeSuggestion | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);

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

  const handleSuggest = useCallback(async () => {
    if (!mergeDraftId) return;
    setSuggestLoading(true);
    setSuggestError(null);
    try {
      const result = await getMergeSuggestion(mergeDraftId, index);
      setSuggestion(result);
    } catch (err) {
      setSuggestError(err instanceof Error ? err.message : 'Failed to get suggestion');
    } finally {
      setSuggestLoading(false);
    }
  }, [mergeDraftId, index]);

  return (
    <div
      className={cn(
        'rounded-lg p-[var(--space-group)] elevation-1 elevation-hover',
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
            <span className="font-medium text-[var(--text-primary)]">{t('keep_source')}</span>
            <span className="inline-flex items-center gap-0.5 rounded-full border border-[var(--diff-added-line)]/40 text-[var(--diff-added-line)] bg-transparent px-1.5 py-0 text-[10px] font-medium">
              <ArrowLeft className="h-2.5 w-2.5" />
              {t('source')}
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
            <span className="font-medium text-[var(--text-primary)]">{t('keep_target')}</span>
            <span className="inline-flex items-center gap-0.5 rounded-full border border-[var(--accent-pending)]/40 text-[var(--accent-pending)] bg-transparent px-1.5 py-0 text-[10px] font-medium">
              <ArrowRight className="h-2.5 w-2.5" />
              {t('target')}
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

      {/* AI Suggestion */}
      {mergeDraftId && (
        <div className="mt-2 pt-2 border-t border-[var(--stroke-divider)]">
          {!suggestion && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSuggest}
              disabled={suggestLoading}
              className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              {suggestLoading ? (
                <Loader2 size={12} className="animate-spin mr-1" />
              ) : (
                <Sparkles size={12} className="mr-1" />
              )}
              AI Suggestion
            </Button>
          )}
          {suggestError && <p className="text-xs text-red-500 mt-1">{suggestError}</p>}
          {suggestion && (
            <div className="text-xs space-y-1 p-2 rounded bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800/30">
              <div className="font-medium text-purple-700 dark:text-purple-300 flex items-center gap-1">
                <Sparkles size={10} /> AI Suggestion
              </div>
              <div className="text-[var(--text-primary)]">{suggestion.suggestion}</div>
              {suggestion.reasoning && (
                <div className="text-[var(--text-tertiary)] italic">{suggestion.reasoning}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
