/**
 * Hook to fetch all commits on a branch with their associated leaves.
 * Used by PinDropdownSelector to display branch-scoped commit browsing.
 */

import type { ApiCommit, Leaf } from '@/lib/api';
import * as api from '@/lib/api';
import { useQuery } from './useQuery';

export interface CommitWithLeaves {
  commit: ApiCommit;
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
  const enabled = !!projectId && !!branch;

  const { data, isLoading, error, refetch } = useQuery<CommitWithLeaves[]>({
    queryKey: ['branchCommits', projectId, branch],
    queryFn: async () => {
      const commits = await api.listCommits(projectId!, branch!, 200);

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

      return results;
    },
    enabled,
  });

  return {
    data: enabled ? data : null,
    loading: isLoading,
    error,
    refetch,
  };
}
