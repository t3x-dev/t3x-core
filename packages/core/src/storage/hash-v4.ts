/**
 * Hash utilities for CommitV4
 *
 * Key difference from V3: NO constraints in content!
 * Constraints now belong to Leaf (application layer).
 */

import type { CommitV4FirstClass } from '../types/v4';
import { sha256 } from '../common/hash';

// Re-export for convenience
export type { CommitV4FirstClass } from '../types/v4';

/**
 * Compute hash for CommitV4.
 *
 * Only first-class fields participate in hash:
 * - schema, parents, author, committed_at, content.sentences
 *
 * NOT included (second-class):
 * - project_id, message, branch, source_refs, position_x, position_y
 *
 * Key difference from V3: NO constraints in content!
 *
 * @param commit - The commit data (first-class fields only)
 * @returns The computed hash with "sha256:" prefix
 */
export function computeCommitV4Hash(commit: CommitV4FirstClass): string {
  // Normalize sentences to ensure determinism
  // (empty array is valid, unlike V3 where constraints needed normalization)
  const hashable = {
    schema: commit.schema,
    parents: commit.parents,
    author: commit.author,
    committed_at: commit.committed_at,
    content: {
      sentences: commit.content.sentences,
    },
  };

  const hash = sha256(hashable);
  return `sha256:${hash}`;
}
