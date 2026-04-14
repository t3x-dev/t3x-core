import { useEffect, useState } from 'react';
import { type ParentCommit, fetchParentCommit } from '@/queries/parentCommit';
import { useCommitStore } from '@/store/commitStore';

/**
 * Subscribes to `commitStore.lastCommitHash` and fetches the matching commit's
 * trees. Null result = first commit on the branch (empty "before" state).
 */
export function useParentCommit(): ParentCommit | null {
  const lastCommitHash = useCommitStore((s) => s.lastCommitHash);
  const [parent, setParent] = useState<ParentCommit | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!lastCommitHash) {
      setParent(null);
      return;
    }
    fetchParentCommit(lastCommitHash)
      .then((result) => {
        if (!cancelled) setParent(result);
      })
      .catch(() => {
        if (!cancelled) setParent(null);
      });
    return () => {
      cancelled = true;
    };
  }, [lastCommitHash]);

  return parent;
}
