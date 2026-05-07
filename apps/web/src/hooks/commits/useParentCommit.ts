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
  const [parent, setParent] = useState<ParentCommit | null>(null);

  useEffect(() => {
    let cancelled = false;
    setParent(null);
    if (!projectId || !beforeCommitHash) return;
    fetchParentCommit(beforeCommitHash)
      .then((result) => {
        const current = useCommitStore.getState();
        if (
          !cancelled &&
          current.projectId === projectId &&
          current.beforeCommitHash === beforeCommitHash
        ) {
          setParent(result);
        }
      })
      .catch(() => {
        if (!cancelled) setParent(null);
      });
    return () => {
      cancelled = true;
    };
  }, [beforeCommitHash, projectId]);

  return parent;
}
