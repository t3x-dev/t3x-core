'use client';

/**
 * LearnFromEditSuggestion - Shows reverse-learned constraint suggestions
 * from failed assertions. Calls POST /v1/leaves/:id/reverse-learn.
 */

import { BookOpen, Loader2, Plus } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useReverseLearn } from '@/hooks/shared/useReverseLearn';
import { cn } from '@/utils/cn';
import type { ReverseLearnResult, SuggestedConstraint } from '@/types/api';

interface LearnFromEditSuggestionProps {
  leafId: string;
  onAddConstraint?: (constraint: SuggestedConstraint) => void;
}

export function LearnFromEditSuggestion({ leafId, onAddConstraint }: LearnFromEditSuggestionProps) {
  const [result, setResult] = useState<ReverseLearnResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { run: reverseLearn } = useReverseLearn();
  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await reverseLearn(leafId);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reverse-learn constraints');
    } finally {
      setLoading(false);
    }
  }, [leafId, reverseLearn]);

  if (!result) {
    return (
      <div className="p-3 rounded-lg border border-[var(--stroke-divider)] bg-[var(--color-bg-subtle)]">
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--text-secondary)]">
            Learn constraints from past failures
          </span>
          <Button variant="outline" size="sm" onClick={fetchSuggestions} disabled={loading}>
            {loading ? (
              <Loader2 size={12} className="animate-spin mr-1" />
            ) : (
              <BookOpen size={12} className="mr-1" />
            )}
            Learn
          </Button>
        </div>
        {error && <p className="mt-2 text-xs text-[var(--status-error)]">{error}</p>}
      </div>
    );
  }

  if (result.suggestions.length === 0) {
    return (
      <div className="p-3 rounded-lg border border-[var(--status-success)]/20 bg-[var(--status-success-muted)]">
        <span className="text-xs text-[var(--status-success)]">
          No constraint suggestions from past failures
        </span>
      </div>
    );
  }

  return (
    <div className="p-3 rounded-lg border border-[var(--source)]/30 bg-[var(--source-dim)] space-y-2">
      <div className="flex items-center gap-1.5">
        <BookOpen size={14} className="text-[var(--source)]" />
        <span className="text-xs font-semibold text-[var(--source)]">
          {result.suggestions.length} learned constraint
          {result.suggestions.length !== 1 ? 's' : ''}
        </span>
      </div>

      {result.lessons_used.length > 0 && (
        <div className="text-[10px] text-[var(--text-tertiary)] space-y-0.5">
          <div className="font-medium">Based on lessons:</div>
          {result.lessons_used.slice(0, 3).map((l, i) => (
            <div key={`lesson-${l.slice(0, 20)}`} className="truncate">
              {i + 1}. {l}
            </div>
          ))}
          {result.lessons_used.length > 3 && (
            <div>...and {result.lessons_used.length - 3} more</div>
          )}
        </div>
      )}

      {result.suggestions.map((s) => (
        <div
          key={`${s.type}-${s.value.slice(0, 20)}`}
          className="text-xs space-y-1 p-2 rounded bg-white/50 dark:bg-black/20"
        >
          <div className="flex items-center justify-between">
            <span
              className={cn(
                'font-medium px-1.5 py-0.5 rounded text-[10px]',
                s.type === 'require'
                  ? 'bg-[var(--status-success-muted)] text-[var(--status-success)]'
                  : 'bg-[var(--status-error-muted)] text-[var(--status-error)]'
              )}
            >
              {s.type} ({s.match_mode})
            </span>
          </div>
          <div className="text-[var(--text-primary)]">{s.value}</div>
          {s.reason && <div className="text-[var(--text-tertiary)] italic">{s.reason}</div>}
          {onAddConstraint && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => onAddConstraint(s)}
            >
              <Plus size={10} className="mr-1" /> Add
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
