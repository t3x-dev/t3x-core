/**
 * Hash Chain Verification (Upgrade #6)
 *
 * Three-layer verification strategy:
 * - L1: Incremental — verify parent hashes during commit creation (in commits-v4.ts)
 * - L2: On-demand — full project verification via API
 * - L3: Chain — BFS DAG traversal from leaf commits to roots
 *
 * This module implements L2/L3 verification.
 */

import { buildMerkleTree, type CommitV4 } from '@t3x-dev/core';
import type { AnyDB } from '../adapters';
import { computeCommitV4Hash, findCommitsV4ByProject } from '../queries';

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
 * Verify the hash chain integrity for all V4 commits in a project.
 *
 * Enhanced chain verification (Upgrade #6):
 * 1. Recompute each commit's hash and compare with stored value
 * 2. Verify all parents[] entries exist in the commit set
 * 3. BFS traversal from leaf commits (no children) to roots
 * 4. Report unreachable commits (exist but not traversed from any leaf)
 *
 * Fix 17: Detects when the VERIFY_LIMIT is hit and sets truncated=true,
 * also appending a warning to errors.other so callers know results are partial.
 */
export async function verifyHashChain(db: AnyDB, projectId: string): Promise<VerifyChainResult> {
  const commits = await findCommitsV4ByProject(db, projectId, { limit: VERIFY_LIMIT });
  const hashMismatch: string[] = [];
  const parentNotFound: string[] = [];
  const other: string[] = [];

  const truncated = commits.length >= VERIFY_LIMIT;
  if (truncated) {
    other.push(
      `WARNING: Verification limit of ${VERIFY_LIMIT.toLocaleString()} commits reached. ` +
        `Only the first ${VERIFY_LIMIT.toLocaleString()} commits (ordered by committed_at) ` +
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

  // Index all commits by hash for O(1) lookup
  const commitMap = new Map<string, CommitV4>();
  for (const commit of commits) {
    commitMap.set(commit.hash, commit);
  }

  // Step 1: Verify each commit's hash integrity
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
        hashMismatch.push(
          `Commit ${commit.hash.slice(0, 16)}: hash mismatch (expected ${recomputed.slice(0, 16)})`
        );
      }
    } catch (err) {
      other.push(
        `Commit ${commit.hash.slice(0, 16)}: hash recomputation failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Step 2: Verify parent references exist
  for (const commit of commits) {
    for (const parentHash of commit.parents) {
      if (!commitMap.has(parentHash)) {
        parentNotFound.push(
          `Commit ${commit.hash.slice(0, 16)}: parent ${parentHash.slice(0, 16)} not found`
        );
      }
    }
  }

  // Step 3: BFS from leaf commits to find reachable depth + unreachable commits
  const childrenOf = new Set<string>();
  for (const commit of commits) {
    for (const parentHash of commit.parents) {
      childrenOf.add(parentHash);
    }
  }

  // Leaf commits = commits that are not a parent of any other commit
  const leafCommits = commits.filter((c) => !childrenOf.has(c.hash));
  const entryPoints = leafCommits.length;

  // BFS traversal
  const visited = new Set<string>();
  const queue: Array<{ hash: string; depth: number }> = [];
  let maxDepth = 0;

  for (const leaf of leafCommits) {
    queue.push({ hash: leaf.hash, depth: 0 });
  }

  while (queue.length > 0) {
    const { hash, depth } = queue.shift()!;
    if (visited.has(hash)) continue;
    visited.add(hash);

    if (depth > maxDepth) maxDepth = depth;

    const commit = commitMap.get(hash);
    if (!commit) continue;

    for (const parentHash of commit.parents) {
      if (!visited.has(parentHash) && commitMap.has(parentHash)) {
        queue.push({ hash: parentHash, depth: depth + 1 });
      }
    }
  }

  // Check for unreachable commits (exist in DB but not reachable from any leaf)
  const unreachable = commits.filter((c) => !visited.has(c.hash));
  if (unreachable.length > 0) {
    other.push(
      `${unreachable.length} commit(s) unreachable from any leaf: ${unreachable.map((c) => c.hash.slice(0, 16)).join(', ')}`
    );
  }

  // Step 4: Build Merkle tree for each commit's sentences and compare with stored
  const merkleRoots: Record<string, string> = {};
  const merkleMismatches: string[] = [];
  for (const commit of commits) {
    const sentences = commit.content.sentences ?? [];

    // Skip empty-sentence commits — they store null merkle_root by design
    if (sentences.length === 0) continue;

    try {
      const tree = buildMerkleTree(sentences.map((s) => ({ id: s.id, text: s.text })));
      merkleRoots[commit.hash] = tree.root;

      // Compare stored merkle_root with recomputed root
      if (!commit.merkle_root) {
        // Non-empty commit with missing stored root — flag as mismatch
        merkleMismatches.push(commit.hash);
      } else if (commit.merkle_root !== tree.root) {
        merkleMismatches.push(commit.hash);
      }
    } catch (err) {
      other.push(
        `Commit ${commit.hash.slice(0, 16)}: merkle tree build failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return {
    valid:
      hashMismatch.length === 0 &&
      parentNotFound.length === 0 &&
      merkleMismatches.length === 0,
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
 * Verify a single commit's hash integrity.
 *
 * Used by L1 incremental verification during commit creation
 * to validate parent commits are untampered.
 */
export function verifyCommitHash(commit: CommitV4): { valid: boolean; error?: string } {
  try {
    const recomputed = computeCommitV4Hash({
      schema: commit.schema as 't3x/commit/v4',
      parents: commit.parents,
      author: commit.author,
      committed_at: commit.committed_at,
      content: commit.content,
    });

    if (recomputed !== commit.hash) {
      return {
        valid: false,
        error: `Hash mismatch for commit ${commit.hash.slice(0, 16)}: expected ${recomputed.slice(0, 16)}`,
      };
    }

    return { valid: true };
  } catch (err) {
    return {
      valid: false,
      error: `Hash verification failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
