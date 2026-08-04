/**
 * useCreateMergeCommit — merge persistence boundary.
 *
 * Wrapping it in a hook keeps components free of `@/infrastructure/*` imports
 * while matching the write-path hook conventions established by
 * `useGoldEdit` / `useNewProjectChat`.
 */

import { useCallback } from 'react';
import { CommitPersistenceError } from '@/commands/commits';

export interface MergeCommitInput {
  projectId: string;
  content: { trees: unknown[]; relations: unknown[] };
  branch: string;
  message: string;
  parents: string[];
  author: { type: string; name?: string };
  provenance?: { method: string };
}

export function useCreateMergeCommit(): {
  create: (input: MergeCommitInput) => Promise<{ commit: { hash: string } }>;
} {
  const create = useCallback(async (_input: MergeCommitInput) => {
    // A merge must bind both parent CommitV2 descriptors and a versioned,
    // deterministic merge Effect. Routing it through the one-parent state
    // replacement command would silently discard merge semantics.
    throw new CommitPersistenceError(
      'Merge commit persistence is unavailable until the CommitV2 merge driver is installed'
    );
  }, []);

  return { create };
}
