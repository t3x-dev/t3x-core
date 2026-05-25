import { useEffect, useState } from 'react';
import { fetchParentCommit, type ParentCommit } from '@/queries/parentCommit';
import { useCommitStore } from '@/store/commitStore';

/**
 * Subscribes to the active project's `beforeCommitHash` and fetches the
 * matching commit's trees. Null result = first commit on the branch
 * (empty "before" state).
 */
export function useParentCommit(): ParentCommit | null {
  const beforeCommitHash = useCommitStore((s) => s.beforeCommitHash);
  const projectId = useCommitStore((s) => s.projectId);
  const cachedParent = useCommitStore((s) =>
    s.beforeCommitHash ? (s.parentCommitCache[s.beforeCommitHash] ?? null) : null
  );
  const cacheParentCommit = useCommitStore((s) => s.cacheParentCommit);
  const [parentState, setParentState] = useState<{
    projectId: string;
    beforeCommitHash: string;
    parent: ParentCommit | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!projectId || !beforeCommitHash || cachedParent) {
      setParentState(null);
      return;
    }
    fetchParentCommit(beforeCommitHash)
      .then((result) => {
        const current = useCommitStore.getState();
        if (
          !cancelled &&
          current.projectId === projectId &&
          current.beforeCommitHash === beforeCommitHash
        ) {
          if (result) {
            cacheParentCommit(result);
          }
          setParentState({ projectId, beforeCommitHash, parent: result });
        }
      })
      .catch(() => {
        if (!cancelled) setParentState(null);
      });
    return () => {
      cancelled = true;
    };
  }, [beforeCommitHash, cacheParentCommit, cachedParent, projectId]);

  if (!projectId || !beforeCommitHash) {
    return null;
  }

  if (cachedParent) {
    return cachedParent;
  }

  if (
    !parentState ||
    parentState.projectId !== projectId ||
    parentState.beforeCommitHash !== beforeCommitHash
  ) {
    return null;
  }

  return parentState.parent;
}
