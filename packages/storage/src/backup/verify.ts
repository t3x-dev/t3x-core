/**
 * CommitV2 Graph Verification
 *
 * On-demand verification for all CommitV2 objects in one repository project.
 */

import { type CommitV2, describeCommitV2 } from '@t3x-dev/core';
import type { AnyDB } from '../adapters';
import { getVerifiedTransitionCommitGraph, listTransitionCommits } from '../queries';

/**
 * Legacy verify result (kept for backward compatibility)
 */
export interface VerifyResult {
  valid: boolean;
  total: number;
  errors: string[];
}

/**
 * Detailed verification result with categorized errors
 */
export interface VerifyChainResult {
  valid: boolean;
  total: number;
  verified_depth: number;
  entry_points: number;
  errors: {
    hash_mismatch: string[];
    parent_not_found: string[];
    other: string[];
  };
  /** Merkle root per commit: commit_hash → merkle_root */
  merkle_roots: Record<string, string>;
  /** Commit hashes where stored merkle_root differs from recomputed root */
  merkle_mismatches: string[];
  verified_at: string;
  /**
   * Fix 17: True when the fetch limit was hit and only a subset of commits was
   * verified. Results may be incomplete — the warning is also emitted in
   * errors.other.
   */
  truncated: boolean;
}

/** Hard ceiling for the number of commits fetched in a single verification run. */
const VERIFY_LIMIT = 100_000;

/**
 * Verify graph integrity for all CommitV2 objects in a project.
 *
 * Fix 17: Detects when the VERIFY_LIMIT is hit and sets truncated=true,
 * also appending a warning to errors.other so callers know results are partial.
 */
export async function verifyHashChain(db: AnyDB, projectId: string): Promise<VerifyChainResult> {
  const commits = await listTransitionCommits(db, projectId, { limit: VERIFY_LIMIT });
  const hashMismatch: string[] = [];
  const parentNotFound: string[] = [];
  const other: string[] = [];

  const truncated = commits.length >= VERIFY_LIMIT;
  if (truncated) {
    other.push(
      `WARNING: Verification limit of ${VERIFY_LIMIT.toLocaleString()} commits reached. ` +
        `Only the first ${VERIFY_LIMIT.toLocaleString()} CommitV2 objects ` +
        `were checked. Results may be incomplete.`
    );
  }

  if (commits.length === 0) {
    return {
      valid: true,
      total: 0,
      verified_depth: 0,
      entry_points: 0,
      errors: { hash_mismatch: [], parent_not_found: [], other: [] },
      merkle_roots: {},
      merkle_mismatches: [],
      verified_at: new Date().toISOString(),
      truncated: false,
    };
  }

  // Index all commits by digest for O(1) lookup.
  const commitMap = new Map<string, CommitV2>();
  for (const stored of commits) {
    commitMap.set(describeCommitV2(stored.commit).digest, stored.commit);
  }

  // Step 1: Verify each committed graph and canonical digest.
  for (const stored of commits) {
    const digest = describeCommitV2(stored.commit).digest;
    try {
      await getVerifiedTransitionCommitGraph(db, projectId, digest);
    } catch (err) {
      other.push(
        `CommitV2 ${digest.slice(0, 16)}: graph verification failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Step 2: Verify parent references exist
  for (const stored of commits) {
    const digest = describeCommitV2(stored.commit).digest;
    for (const parent of stored.commit.parents) {
      if (!commitMap.has(parent.digest)) {
        parentNotFound.push(
          `CommitV2 ${digest.slice(0, 16)}: parent ${parent.digest.slice(0, 16)} not found`
        );
      }
    }
  }

  // Step 3: BFS from leaf commits to find reachable depth + unreachable commits.
  const childrenOf = new Set<string>();
  for (const stored of commits) {
    for (const parent of stored.commit.parents) {
      childrenOf.add(parent.digest);
    }
  }

  // Leaf commits = commits that are not a parent of any other commit
  const leafCommits = commits.filter((stored) => {
    const digest = describeCommitV2(stored.commit).digest;
    return !childrenOf.has(digest);
  });
  const entryPoints = leafCommits.length;

  // BFS traversal
  const visited = new Set<string>();
  const queue: Array<{ hash: string; depth: number }> = [];
  let maxDepth = 0;

  for (const leaf of leafCommits) {
    queue.push({ hash: describeCommitV2(leaf.commit).digest, depth: 0 });
  }

  while (queue.length > 0) {
    const { hash, depth } = queue.shift()!;
    if (visited.has(hash)) continue;
    visited.add(hash);

    if (depth > maxDepth) maxDepth = depth;

    const commit = commitMap.get(hash);
    if (!commit) continue;

    for (const parent of commit.parents) {
      if (!visited.has(parent.digest) && commitMap.has(parent.digest)) {
        queue.push({ hash: parent.digest, depth: depth + 1 });
      }
    }
  }

  // Check for unreachable commits (exist in DB but not reachable from any leaf)
  const unreachable = commits.filter(
    (stored) => !visited.has(describeCommitV2(stored.commit).digest)
  );
  if (unreachable.length > 0) {
    other.push(
      `${unreachable.length} CommitV2 object(s) unreachable from any leaf: ${unreachable
        .map((stored) => describeCommitV2(stored.commit).digest.slice(0, 16))
        .join(', ')}`
    );
  }

  // Step 4: Merkle verification skipped for frame-based commits (no merkle_root field)
  const merkleRoots: Record<string, string> = {};
  const merkleMismatches: string[] = [];

  return {
    valid:
      hashMismatch.length === 0 && parentNotFound.length === 0 && merkleMismatches.length === 0,
    total: commits.length,
    verified_depth: maxDepth,
    entry_points: entryPoints,
    errors: {
      hash_mismatch: hashMismatch,
      parent_not_found: parentNotFound,
      other,
    },
    merkle_roots: merkleRoots,
    merkle_mismatches: merkleMismatches,
    verified_at: new Date().toISOString(),
    truncated,
  };
}

/**
 * Verify a single CommitV2 descriptor against its canonical digest.
 */
export function verifyCommitHash(commit: CommitV2): { valid: boolean; error?: string } {
  try {
    describeCommitV2(commit);

    return { valid: true };
  } catch (err) {
    return {
      valid: false,
      error: `Hash verification failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
