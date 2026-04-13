/**
 * useCreateMergeCommit — persists a merged commit via the L1 commits
 * adapter. Used by MergeWorkspace when the user finalizes a tree-merge.
 *
 * Wrapping it in a hook keeps components free of `@/lib/api/*` imports
 * while matching the write-path hook conventions established by
 * `useGoldEdit` / `useNewProjectChat`.
 */

import { useCallback } from 'react';
import { createCommit } from '@/infrastructure/commits';

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
  const create = useCallback(async (input: MergeCommitInput) => {
    return createCommit(
      input.projectId,
      { trees: input.content.trees, relations: input.content.relations },
      {
        branch: input.branch,
        message: input.message,
        parents: input.parents,
        author: input.author,
        provenance: input.provenance,
      }
    );
  }, []);

  return { create };
}
