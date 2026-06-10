/**
 * useCommitHistory — async loader for a commit's ancestor history.
 *
 * Replaces the fetchCommitHistory + useEffect + cancel-flag pattern
 * CommitHistoryPanel kept inline. Components must not import @/queries
 * directly (v2 §1).
 */

import { useCallback, useEffect, useState } from 'react';
import { formatUserFacingError } from '@/domain/format/errors';
import { fetchCommitHistory } from '@/queries/commitHistory';
import type { ApiCommit } from '@/types/api';

export interface UseCommitHistoryResult {
  history: ApiCommit[];
  loading: boolean;
  error: string | null;
  loadHistory: (commitHash: string, limit?: number) => Promise<ApiCommit[]>;
}

export function useCommitHistory(
  commitHash: string | null,
  options?: { enabled?: boolean; limit?: number }
): UseCommitHistoryResult {
  const enabled = options?.enabled ?? true;
  const limit = options?.limit ?? 100;
  const [history, setHistory] = useState<ApiCommit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(
    async (hash: string, lim?: number) => fetchCommitHistory(hash, lim ?? 100),
    []
  );

  useEffect(() => {
    if (!enabled || !commitHash) {
      setHistory([]);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchCommitHistory(commitHash, limit)
      .then((data) => {
        if (!cancelled) setHistory(data);
      })
      .catch((err) => {
        if (!cancelled) setError(formatUserFacingError(err, 'Failed to load history.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, commitHash, limit]);

  return { history, loading, error, loadHistory };
}
