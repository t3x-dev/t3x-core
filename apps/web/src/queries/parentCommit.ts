/**
 * L3 — read-side query for a prior committed tree (the "before" view).
 *
 * Fetches a commit by hash and returns its trees. Used by BeforePanel to
 * render the frozen parent state next to the current draft. A null `hash`
 * means no prior commit (first commit on this branch) — caller renders
 * an empty state.
 */

import type { TreeNode } from '@t3x-dev/core';
import { getApiCommit } from '@/lib/api/commits';

export interface ParentCommit {
  hash: string;
  trees: TreeNode[];
}

export async function fetchParentCommit(hash: string | null): Promise<ParentCommit | null> {
  if (!hash) return null;
  const commit = await getApiCommit(hash);
  const trees = (commit.content?.trees as TreeNode[] | undefined) ?? [];
  return { hash, trees };
}
