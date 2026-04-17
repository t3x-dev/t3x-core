import { useEffect, useState } from 'react';
import { fetchParentCommit, type ParentCommit } from '@/queries/parentCommit';
import { useCommitStore } from '@/store/commitStore';

/**
 * Subscribes to `commitStore.lastCommitHash` and fetches the matching commit's
 * trees. Null result = first commit on the branch (empty "before" state).
 */
export function useParentCommit(): ParentCommit | null {
  const beforeCommitHash = useCommitStore((s) => s.beforeCommitHash);
  const [parent, setParent] = useState<ParentCommit | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!beforeCommitHash) {
      setParent(null);
      return;
    }
    fetchParentCommit(beforeCommitHash)
      .then((result) => {
        if (!cancelled) setParent(result);
      })
      .catch(() => {
        if (!cancelled) setParent(null);
      });
    return () => {
      cancelled = true;
    };
  }, [beforeCommitHash]);

  return parent;
}
