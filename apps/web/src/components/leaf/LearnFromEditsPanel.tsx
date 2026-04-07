'use client';

/**
 * LearnFromEditsPanel - Discovers constraints from user's output edit history.
 * Calls POST /v1/leaves/:id/learn-from-edits (Item 17).
 */

import { Edit3, Loader2, Plus, RefreshCw } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ApiError, type EditLearnedConstraint, learnFromEdits } from '@/lib/api';
import { cn } from '@/lib/utils';

const DIMENSION_LABELS: Record<string, { label: string; bg: string; text: string }> = {
  style: {
    label: 'Style',
    bg: 'bg-[var(--status-info-muted)]',
    text: 'text-[var(--status-info)]',
  },
  content: {
    label: 'Content',
    bg: 'bg-[var(--status-warning-muted)]',
    text: 'text-[var(--status-warning)]',
  },
  format: {
    label: 'Format',
    bg: 'bg-[var(--status-success-muted)]',
    text: 'text-[var(--status-success)]',
  },
};

interface LearnFromEditsPanelProps {
  leafId: string;
  hasOutput: boolean;
  onAddConstraint?: (constraint: EditLearnedConstraint) => void;
}

export function LearnFromEditsPanel({
  leafId,
  hasOutput,
  onAddConstraint,
}: LearnFromEditsPanelProps) {
  const [suggestions, setSuggestions] = useState<EditLearnedConstraint[] | null>(null);
  const [editsAnalyzed, setEditsAnalyzed] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuggestions(null);
    try {
      const data = await learnFromEdits(leafId);
      setSuggestions(data.suggestions);
      setEditsAnalyzed(data.edits_analyzed);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NO_EDITS') {
        setError('No edits recorded yet. Edit the output text to build edit history.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to analyze edits');
      }
    } finally {
      setLoading(false);
    }
  }, [leafId]);

  if (!hasOutput) return null;

  if (suggestions !== null && suggestions.length === 0) {
    return (
      <div className="p-3 rounded-lg border border-[var(--stroke-divider)] bg-[var(--color-bg-subtle)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Edit3 size={14} className="text-[var(--text-tertiary)]" />
            <span className="text-xs text-[var(--text-secondary)]">
              No patterns found from {editsAnalyzed} edit(s)
            </span>
          </div>
          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={fetchSuggestions}>
            <RefreshCw size={10} className="mr-1" /> Re-analyze
          </Button>
        </div>
      </div>
    );
  }

  if (suggestions !== null && suggestions.length > 0) {
    return (
      <div className="p-3 rounded-lg border border-[var(--accent-conversation)]/30 bg-[var(--accent-conversation-soft)] space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Edit3 size={14} className="text-[var(--accent-conversation)]" />
            <span className="text-xs font-semibold text-[var(--accent-conversation)]">
              {suggestions.length} pattern{suggestions.length !== 1 ? 's' : ''} from {editsAnalyzed}{' '}
              edit
              {editsAnalyzed !== 1 ? 's' : ''}
            </span>
          </div>
          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={fetchSuggestions}>
            <RefreshCw size={10} className="mr-1" /> Re-analyze
          </Button>
        </div>

        {suggestions.map((s, i) => {
          const dim = DIMENSION_LABELS[s.dimension] || DIMENSION_LABELS.content;
          return (
            <div
              key={`${s.dimension}-${s.type}-${s.value.slice(0, 30)}-${i}`}
              className="text-xs space-y-1 p-2 rounded bg-white/50 dark:bg-black/20"
            >
              <div className="flex items-center gap-1.5 justify-between">
                <div className="flex items-center gap-1">
                  <span
                    className={cn(
                      'font-medium px-1.5 py-0.5 rounded text-[10px]',
                      s.type === 'require'
                        ? 'bg-[var(--status-success-muted)] text-[var(--status-success)]'
                        : 'bg-[var(--status-error-muted)] text-[var(--status-error)]'
                    )}
                  >
                    {s.type}
                  </span>
                  <span
                    className={cn(
                      'px-1.5 py-0.5 rounded text-[10px] font-medium',
                      dim.bg,
                      dim.text
                    )}
                  >
                    {dim.label}
                  </span>
                </div>
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
                  <Plus size={10} className="mr-1" /> Add constraint
                </Button>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="p-3 rounded-lg border border-[var(--stroke-divider)] bg-[var(--color-bg-subtle)]">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--text-secondary)]">
          Learn constraints from your edits
        </span>
        <Button variant="outline" size="sm" onClick={fetchSuggestions} disabled={loading}>
          {loading ? (
            <Loader2 size={12} className="animate-spin mr-1" />
          ) : (
            <Edit3 size={12} className="mr-1" />
          )}
          Analyze edits
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-[var(--status-error)]">{error}</p>}
    </div>
  );
}
