/**
 * Unified Commit Query Adapter
 *
 * Delegates directly to commit queries.
 * Kept as a thin wrapper for backward compatibility of callers.
 */

import type { Commit } from '@t3x-dev/core';
import type { AnyDB } from '../adapters';
import { getCommit, listCommits } from './commits';

/**
 * Get a commit by hash. Delegates to getCommit.
 */
export async function getCommitUnified(db: AnyDB, hash: string): Promise<Commit | null> {
  return getCommit(db, hash);
}

/**
 * List commits by project. Delegates to listCommits.
 */
export async function listCommitsUnified(
  db: AnyDB,
  projectId: string,
  options: { branch?: string; limit?: number } = {}
): Promise<Commit[]> {
  const { branch, limit = 100 } = options;
  return listCommits(db, { projectId, branch, limit });
}
