'use client';

import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { type ConflictCandidate, checkConflicts } from '@/lib/api';

interface ConflictPanelProps {
  commitHash: string;
}

/**
 * Panel that shows cross-conversation conflicts for a commit.
 * Calls POST /v1/commits-v4/:hash/check-conflicts.
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
        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  if (conflicts.length === 0) {
    return (
      <div className="p-3 rounded-lg border border-green-500/20 bg-green-50 dark:bg-green-950/20">
        <span className="text-xs text-green-700 dark:text-green-400">No conflicts detected</span>
      </div>
    );
  }

  return (
    <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 space-y-2">
      <div className="flex items-center gap-1.5">
        <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400" />
        <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
          {conflicts.length} potential conflict{conflicts.length !== 1 ? 's' : ''}
        </span>
      </div>
      {conflicts.map((c) => (
        <div
          key={`${c.new_sentence_id}-${c.existing_sentence_id}`}
          className="text-xs space-y-1 p-2 rounded bg-white/50 dark:bg-black/20"
        >
          <div>
            <span className="font-medium text-[var(--text-primary)]">New:</span>{' '}
            <span className="text-[var(--text-secondary)]">{c.new_sentence_text}</span>
          </div>
          <div>
            <span className="font-medium text-[var(--text-primary)]">Existing:</span>{' '}
            <span className="text-[var(--text-secondary)]">{c.existing_sentence_text}</span>
          </div>
          <div className="text-[var(--text-tertiary)]">
            cosine: {c.cosine.toFixed(2)} · jaccard: {c.jaccard.toFixed(2)} · commit:{' '}
            {c.existing_commit_hash.replace('sha256:', '').slice(0, 7)}
          </div>
        </div>
      ))}
    </div>
  );
}
