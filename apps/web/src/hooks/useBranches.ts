/**
 * useBranches — branch dropdown data + creation for a project.
 *
 * Consolidates three L1 calls (listBranches, listCommits, createBranch) so
 * components never reach into `@/lib/api/*` directly.
 *
 * `refresh()` re-pulls both the branches table and unique branch names from
 * recent commits (so newly-used branches show up even before they are
 * registered in the branches table).
 */

import { useCallback, useEffect, useState } from 'react';
import { createBranch, listBranches } from '@/infrastructure/branches';
import { type ApiCommit, listCommits } from '@/infrastructure/commits';

function dedupSortedBranches(names: Iterable<string>): string[] {
  const set = new Set<string>(names);
  set.add('main');
  return Array.from(set).sort((a, b) => {
    if (a === 'main') return -1;
    if (b === 'main') return 1;
    return a.localeCompare(b);
  });
}

export interface UseBranchesResult {
  branches: string[];
  loading: boolean;
  refresh: () => Promise<void>;
  create: (name: string, parentBranch: string) => Promise<void>;
}

export function useBranches(projectId: string | null, enabled: boolean): UseBranchesResult {
  const [branches, setBranches] = useState<string[]>(['main']);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const branchData = await listBranches(projectId).catch(() => ({ branches: [] }));
      const names: string[] = (branchData.branches ?? []).map((b: { name: string }) => b.name);

      const commits: ApiCommit[] = await listCommits(projectId, undefined, 100).catch(() => []);
      for (const c of commits) {
        if (c.branch) names.push(c.branch);
      }
      setBranches(dedupSortedBranches(names));
    } catch {
      setBranches(['main']);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (enabled && projectId) {
      void refresh();
    }
  }, [enabled, projectId, refresh]);

  const create = useCallback(
    async (name: string, parentBranch: string) => {
      if (!projectId) return;
      // Branch creation is best-effort — if the backend rejects it, commits
      // under this name will still carry the label and show up on next refresh.
      try {
        await createBranch(projectId, name, parentBranch);
      } catch {
        // swallow — caller already treats create as best-effort
      }
      setBranches((prev) => (prev.includes(name) ? prev : dedupSortedBranches([...prev, name])));
    },
    [projectId]
  );

  return { branches, loading, refresh, create };
}
