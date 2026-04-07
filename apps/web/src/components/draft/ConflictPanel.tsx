'use client';

import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useState } from 'react';
import { WordDiffDisplay } from '@/components/merge/WordDiffDisplay';
import { Button } from '@/components/ui/button';
import { type ConflictCandidate, checkConflicts } from '@/lib/api';
import { wordDiff } from '@/lib/diffUtils';

interface ConflictPanelProps {
  commitHash: string;
}

/**
 * Panel that shows cross-conversation conflicts for a commit.
 * Calls checkConflicts() (deprecated — V4 endpoint removed, returns empty).
 */
export function ConflictPanel({ commitHash }: ConflictPanelProps) {
  const [conflicts, setConflicts] = useState<ConflictCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runCheck = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const report = await checkConflicts(commitHash);
      setConflicts(report.conflicts);
      setChecked(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check conflicts');
    } finally {
      setLoading(false);
    }
  }, [commitHash]);

  if (!checked) {
    return (
      <div className="p-3 rounded-lg border border-[var(--stroke-divider)] bg-[var(--color-bg-subtle)]">
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--text-secondary)]">
            Cross-conversation conflict check
          </span>
          <Button variant="outline" size="sm" onClick={runCheck} disabled={loading}>
            {loading ? (
              <Loader2 size={12} className="animate-spin mr-1" />
            ) : (
              <RefreshCw size={12} className="mr-1" />
            )}
            Check
          </Button>
        </div>
        {error && <p className="mt-2 text-xs text-[var(--status-error)]">{error}</p>}
      </div>
    );
  }

  if (conflicts.length === 0) {
    return (
      <div className="p-3 rounded-lg border border-[var(--status-success)]/20 bg-[var(--status-success-muted)]">
        <span className="text-xs text-[var(--status-success)]">No conflicts detected</span>
      </div>
    );
  }

  return (
    <div className="p-3 rounded-lg border border-[var(--status-warning)]/30 bg-[var(--status-warning-muted)] space-y-2">
      <div className="flex items-center gap-1.5">
        <AlertTriangle size={14} className="text-[var(--status-warning)]" />
        <span className="text-xs font-semibold text-[var(--status-warning)]">
          {conflicts.length} potential conflict{conflicts.length !== 1 ? 's' : ''}
        </span>
      </div>
      {conflicts.map((c) => {
        const segments = wordDiff(c.existing_node_text, c.new_node_text);
        return (
          <div
            key={`${c.new_node_id}-${c.existing_node_id}`}
            className="text-xs space-y-1.5 p-2 rounded bg-white/50 dark:bg-black/20"
          >
            <div>
              <span className="font-medium text-[var(--text-primary)]">Diff:</span>
              <div className="mt-0.5">
                <WordDiffDisplay segments={segments} />
              </div>
            </div>
            <div className="text-[var(--text-tertiary)]">
              cosine: {c.cosine.toFixed(2)} · jaccard: {c.jaccard.toFixed(2)} · commit:{' '}
              {c.existing_commit_hash.replace('sha256:', '').slice(0, 7)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
