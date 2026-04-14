/**
 * useBranchesList — imperative project-branches loader.
 *
 * Returns the full Branch[] (vs `useBranches` which derives a deduped
 * string[] for picker UIs).
 */

import { useCallback } from 'react';
import { listBranches } from '@/infrastructure/branches';

export function useBranchesList() {
  const loadBranches = useCallback(async (projectId: string) => listBranches(projectId), []);
  return { loadBranches };
}
