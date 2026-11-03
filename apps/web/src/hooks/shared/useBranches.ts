/**
 * useBranches — branch dropdown data + creation for a project.
 *
 * Consolidates branch listing and creation so
 * components never reach into `@/infrastructure/*` directly.
 *
 * The branches table is the canonical inventory. Commit labels are historical
 * metadata and must not surface as switchable branches.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const scope = useMemo(
    () => ({ active: true, read: 0, completedRead: 0, creates: new Map<string, object>() }),
    [projectId, enabled]
  );
  const activeScope = useRef(scope);
  activeScope.current = scope;
  const [snapshot, setSnapshot] = useState<{
    scope: typeof scope;
    branches: string[];
    branchHeads: Record<string, string | null>;
    loading: boolean;
  }>();

  const refresh = useCallback(async () => {
    if (!projectId || !enabled || !scope.active || activeScope.current !== scope) return;
    const request = ++scope.read;
    const isCurrent = () => scope.active && activeScope.current === scope && request === scope.read;
    setSnapshot((current) => ({
      scope,
      branches: current?.scope === scope ? current.branches : [],
      branchHeads: current?.scope === scope ? current.branchHeads : {},
      loading: true,
    }));
    try {
      const branchData = await listBranches(projectId);
      if (!isCurrent()) return;
      const registeredBranches = (branchData.branches ?? []) as Branch[];
      scope.completedRead = request;
      setSnapshot({
        scope,
        branches: dedupSortedBranches(registeredBranches.map((branch) => branch.name)),
        branchHeads: Object.fromEntries(
          registeredBranches.map((branch) => [branch.name, branch.head_commit_hash ?? null])
        ),
        loading: false,
      });
    } catch {
      if (isCurrent()) setSnapshot({ scope, branches: [], branchHeads: {}, loading: false });
    }
  }, [projectId, enabled, scope]);

  useEffect(() => {
    scope.active = true;
    void refresh();
    return () => {
      scope.active = false;
      ++scope.read;
    };
  }, [refresh, scope]);

  const create = useCallback(
    async (name: string, parentBranch: string) => {
      if (!projectId) throw new Error('A project is required to create a branch.');
      if (!enabled || !scope.active || activeScope.current !== scope)
        throw new Error('Branch context changed. Reopen the branch controls.');
      const request = {};
      const readAtStart = scope.read;
      scope.creates.set(name, request);
      try {
        const branch = await createBranch(projectId, name, parentBranch);
        if (!scope.active || activeScope.current !== scope || scope.creates.get(name) !== request)
          return branch;
        // A list started before this acknowledgement may omit the new branch.
        ++scope.read;
        setSnapshot((current) => ({
          scope,
          branches: dedupSortedBranches([
            ...(current?.scope === scope ? current.branches : []),
            branch.name,
          ]),
          branchHeads: {
            ...(current?.scope === scope ? current.branchHeads : {}),
            [branch.name]:
              scope.completedRead > readAtStart &&
              current?.scope === scope &&
              Object.hasOwn(current.branchHeads, branch.name)
                ? current.branchHeads[branch.name]
                : (branch.head_commit_hash ?? null),
          },
          loading: false,
        }));
        return branch;
      } finally {
        if (scope.creates.get(name) === request) scope.creates.delete(name);
      }
    },
    [projectId, enabled, scope]
  );

  const current = enabled && projectId && snapshot?.scope === scope ? snapshot : undefined;
  return {
    branchHeads: current?.branchHeads ?? {},
    branches: current?.branches ?? [],
    loading: Boolean(enabled && projectId && (current?.loading ?? true)),
    refresh,
    create,
  };
}
