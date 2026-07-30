/**
 * useBranches — branch dropdown data + creation for a project.
 *
 * Consolidates branch listing and creation so
 * components never reach into `@/infrastructure/*` directly.
 *
 * The branches table is the canonical inventory. Commit labels are historical
 * metadata and must not surface as switchable branches.
 */

import { useCallback, useEffect, useState } from 'react';
import { createBranch, listBranches } from '@/infrastructure/branches';
import type { Branch } from '@/infrastructure/types';

function dedupSortedBranches(names: Iterable<string>): string[] {
  const set = new Set<string>(names);
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
  create: (name: string, parentBranch: string) => Promise<Branch>;
}

export function useBranches(projectId: string | null, enabled: boolean): UseBranchesResult {
  const [branches, setBranches] = useState<string[]>([]);
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

      setBranches(dedupSortedBranches(names));
    } catch {
      setBranches([]);
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
      if (!projectId) throw new Error('A project is required to create a branch.');
      const branch = await createBranch(projectId, name, parentBranch);
      setBranchHeads((previous) => ({
        ...previous,
        [branch.name]: branch.head_commit_hash ?? null,
      }));
      setBranches((prev) => (prev.includes(name) ? prev : dedupSortedBranches([...prev, name])));
      return branch;
    },
    [projectId]
  );

  return { branchHeads, branches, loading, refresh, create };
}
