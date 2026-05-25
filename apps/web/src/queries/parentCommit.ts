/**
 * L3 — read-side query for a prior committed tree (the "before" view).
 *
 * Fetches a commit by hash and returns its trees. Used by BeforePanel to
 * render the frozen parent state next to the current draft. A null `hash`
 * means no prior commit (first commit on this branch) — caller renders
 * an empty state.
 */

import { getApiCommit } from '@/infrastructure/commits';
import type { ParentCommit } from '@/types/parentCommit';

export type { ParentCommit } from '@/types/parentCommit';

export async function fetchParentCommit(hash: string | null): Promise<ParentCommit | null> {
  if (!hash) return null;
  const commit = await getApiCommit(hash);
  const trees = (commit.content?.trees as ParentCommit['trees'] | undefined) ?? [];
  return { hash, trees, message: commit.message ?? null };
}
