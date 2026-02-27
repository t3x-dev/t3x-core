/**
 * Hash Chain Verification
 *
 * Recomputes commit hashes and compares with stored values
 * to verify data integrity.
 */

import type { AnyDB } from '../adapters';
import { computeCommitV4Hash, findCommitsV4ByProject } from '../queries';

export interface VerifyResult {
  valid: boolean;
  total: number;
  errors: string[];
}

/**
 * Verify the hash chain integrity for all V4 commits in a project.
 *
 * Recomputes each commit hash from its content and compares
 * with the stored hash value.
 */
export async function verifyHashChain(db: AnyDB, projectId: string): Promise<VerifyResult> {
  const commits = await findCommitsV4ByProject(db, projectId, { limit: 100000 });
  const errors: string[] = [];

  for (const commit of commits) {
    try {
      const recomputed = computeCommitV4Hash({
        schema: commit.schema as 't3x/commit/v4',
        parents: commit.parents,
        author: commit.author,
        committed_at: commit.committed_at,
        content: commit.content,
      });

      if (recomputed !== commit.hash) {
        errors.push(
          `Commit ${commit.hash.slice(0, 16)}: stored hash does not match recomputed hash (got ${recomputed.slice(0, 16)})`
        );
      }
    } catch (err) {
      errors.push(
        `Commit ${commit.hash.slice(0, 16)}: failed to recompute hash: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return {
    valid: errors.length === 0,
    total: commits.length,
    errors,
  };
}
