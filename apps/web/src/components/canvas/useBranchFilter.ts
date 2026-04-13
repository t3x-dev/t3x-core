'use client';

import type { Node } from '@xyflow/react';
import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PathHighlight } from '@/hooks/usePathHighlight';

interface UseBranchFilterOptions {
  nodes: Node[];
  setHighlight: Dispatch<SetStateAction<PathHighlight>>;
}

interface UseBranchFilterResult {
  branchNames: string[];
  branchFilter: 'all' | string;
  setBranchFilter: (filter: 'all' | string) => void;
}

export function useBranchFilter({
  nodes,
  setHighlight,
}: UseBranchFilterOptions): UseBranchFilterResult {
  const [branchFilter, setBranchFilter] = useState<'all' | string>('all');

  const branchNames = useMemo(() => {
    const names = new Set<string>();
    for (const node of nodes) {
      if (node.data.kind === 'unit' && node.data.branchType === 'branch' && node.data.branchName) {
        names.add(node.data.branchName as string);
      }
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [nodes]);

  // Reset branch filter when branch is removed - using a ref to avoid synchronous setState in effect
  const prevBranchNamesRef = useRef(branchNames);
  useEffect(() => {
    const prevBranchNames = prevBranchNamesRef.current;
    prevBranchNamesRef.current = branchNames;

    // Only check if branch was removed (not on initial render)
    if (
      branchFilter !== 'all' &&
      !branchNames.includes(branchFilter) &&
      prevBranchNames.includes(branchFilter)
    ) {
      // Use queueMicrotask to batch state updates after current render cycle
      queueMicrotask(() => {
        setBranchFilter('all');
        setHighlight((current) => (current?.mode === 'branch' ? null : current));
      });
    }
  }, [branchFilter, branchNames, setHighlight]);

  return { branchNames, branchFilter, setBranchFilter };
}
