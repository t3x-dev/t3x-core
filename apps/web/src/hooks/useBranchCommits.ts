/**
 * Hook to fetch all commits on a branch with their associated leaves.
 * Used by PinDropdownSelector to display branch-scoped commit browsing.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CommitV4, Leaf } from '@/lib/api';
import * as api from '@/lib/api';

export interface CommitWithLeaves {
  commit: CommitV4;
  leaves: Leaf[];
}

interface UseBranchCommitsState {
  data: CommitWithLeaves[] | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useBranchCommits(
  projectId: string | undefined,
  branch: string | undefined
): UseBranchCommitsState {
  const [data, setData] = useState<CommitWithLeaves[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);

  const doFetch = useCallback(async () => {
    if (!projectId || !branch) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const commits = await api.listCommitsV4(projectId, branch, 200, 0);

      const results: CommitWithLeaves[] = await Promise.all(
        commits.map(async (commit) => {
          try {
            const leaves = await api.listLeavesByCommit(commit.hash);
            return { commit, leaves };
          } catch {
            return { commit, leaves: [] };
          }
        })
      );

      if (mountedRef.current) {
        setData(results);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [projectId, branch]);

  useEffect(() => {
    doFetch();
  }, [doFetch]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return { data, loading, error, refetch: doFetch };
}
