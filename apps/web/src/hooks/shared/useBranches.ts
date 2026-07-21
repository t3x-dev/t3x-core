/**
 * useBranches — branch dropdown data + creation for a project.
 *
 * Consolidates three L1 calls (listBranches, listCommits, createBranch) so
 * components never reach into `@/infrastructure/*` directly.
 *
 * `refresh()` re-pulls both the branches table and unique branch names from
 * recent commits (so newly-used branches show up even before they are
 * registered in the branches table).
 */

import { useCallback, useEffect, useState } from 'react';
import { createBranch, listBranches } from '@/infrastructure/branches';
import { type ApiCommit, listCommits } from '@/infrastructure/commits';
import type { Branch } from '@/infrastructure/types';

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
  branchHeads: Readonly<Record<string, string | null>>;
  branches: string[];
  loading: boolean;
  refresh: () => Promise<void>;
  create: (name: string, parentBranch: string) => Promise<void>;
}

export function useBranches(projectId: string | null, enabled: boolean): UseBranchesResult {
  const [branches, setBranches] = useState<string[]>(['main']);
  const [branchHeads, setBranchHeads] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const branchData = await listBranches(projectId).catch(() => ({ branches: [] }));
      const registeredBranches = (branchData.branches ?? []) as Branch[];
      const names: string[] = registeredBranches.map((branch) => branch.name);
      setBranchHeads(
        Object.fromEntries(
          registeredBranches.map((branch) => [branch.name, branch.head_commit_hash ?? null])
        )
      );

      const commits: ApiCommit[] = await listCommits(projectId, undefined, 100).catch(() => []);
      for (const c of commits) {
        if (c.branch) names.push(c.branch);
      }
      setBranches(dedupSortedBranches(names));
    } catch {
      setBranches(['main']);
      setBranchHeads({});
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
      const branch = await createBranch(projectId, name, parentBranch);
      setBranchHeads((previous) => ({
        ...previous,
        [branch.name]: branch.head_commit_hash ?? null,
      }));
      setBranches((prev) => (prev.includes(name) ? prev : dedupSortedBranches([...prev, name])));
    },
    [projectId]
  );

  return { branchHeads, branches, loading, refresh, create };
}
