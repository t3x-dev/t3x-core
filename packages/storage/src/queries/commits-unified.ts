/**
 * Unified Commit Query Adapter
 *
 * Queries both V5 (frame-based) and V4 (sentence-based) tables,
 * returning V5 Commit type. V4 results are upgraded via upgradeLegacyCommit.
 *
 * This adapter exists for the transition period (Phase 2-3).
 * Once V4 is retired, callers switch to direct V5 queries.
 */

import { type Commit, upgradeLegacyCommit } from '@t3x-dev/core';
import type { AnyDB } from '../adapters';
import { getCommit, listCommits, type ListCommitsOptions } from './commits';
import { findCommitsV4ByProject, findCommitV4ByHash } from './commits-v4';

/**
 * Get a commit by hash from either V5 or V4 table.
 * Returns V5 Commit type (V4 results are auto-upgraded).
 */
export async function getCommitUnified(db: AnyDB, hash: string): Promise<Commit | null> {
  // Try V5 first (new frame-based commits)
  const v5 = await getCommit(db, hash);
  if (v5) return v5;

  // Fall back to V4 (sentence-based commits)
  const v4 = await findCommitV4ByHash(db, hash);
  if (v4) return upgradeLegacyCommit(v4 as Parameters<typeof upgradeLegacyCommit>[0]);

  return null;
}

/**
 * List commits by project from both V5 and V4 tables.
 * Returns V5 Commit[] (V4 results are auto-upgraded).
 * Results are sorted by committed_at desc, interleaved.
 */
export async function listCommitsUnified(
  db: AnyDB,
  projectId: string,
  options: { branch?: string; limit?: number } = {}
): Promise<Commit[]> {
  const { branch, limit = 100 } = options;

  // Query both tables
  const [v5Commits, v4Commits] = await Promise.all([
    listCommits(db, { projectId, branch, limit }).catch(() => [] as Commit[]),
    findCommitsV4ByProject(db, projectId, { branch, limit }).catch(() => []),
  ]);

  // Upgrade V4 commits to V5 format
  const upgradedV4 = v4Commits.map((c) =>
    upgradeLegacyCommit(c as Parameters<typeof upgradeLegacyCommit>[0])
  );

  // Merge and sort by committed_at desc
  const all = [...v5Commits, ...upgradedV4];
  all.sort((a, b) => new Date(b.committed_at).getTime() - new Date(a.committed_at).getTime());

  return all.slice(0, limit);
}
