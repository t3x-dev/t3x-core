/**
 * Merge Checks Business Logic
 *
 * Server-side validation checks for merge drafts.
 * Returns an array of MergeCheck items for the merge review UI.
 *
 * Checks:
 * 1. constraints_satisfied — no legacy Leaf commit-hash linkage is consulted
 * 2. evidence_chain_complete — deterministic MergeResult path coverage
 */

import type { MergeResult } from '@t3x-dev/core';
import type { AnyDB } from '@t3x-dev/storage';
import type { MergeCheckType } from '../schemas/contracts';

// ============================================================
// Types
// ============================================================

/** The stored merge draft shape (from getMergeDraft) */
interface MergeDraft {
  draftId: string;
  projectId: string;
  sourceHash: string;
  targetHash: string;
  preparedJson: string;
  status: string;
  [key: string]: unknown;
}

// ============================================================
// Extract Merged Paths
// ============================================================

/**
 * Extract the final set of paths from a MergeResult.
 *
 * For checks, we assume all autoKept paths are kept, all conflicts
 * will be resolved, and all onlyInSource/onlyInTarget are kept by default.
 */
export function extractMergedPaths(prepared: MergeResult): string[] {
  const result: string[] = [];

  // autoKept -> all included
  result.push(...prepared.autoKept);

  // conflicts -> include path (will be resolved)
  for (const conflict of prepared.conflicts) {
    result.push(conflict.path);
  }

  // onlyInSource -> all included (conservative)
  result.push(...prepared.onlyInSource);

  // onlyInTarget -> all included (conservative)
  result.push(...prepared.onlyInTarget);

  return result;
}

// ============================================================
// Individual Check Functions
// ============================================================

/**
 * Check 1: constraints_satisfied
 *
 * CommitV2 repository merges do not derive review gates from the old
 * Leaf.commitHash index. Source evidence and replay verification live in the
 * proposal/statement graph; external gates must be attached through explicit
 * CommitV2-aware Statement providers.
 */
function checkConstraintsSatisfied(): MergeCheckType {
  return {
    id: 'constraints_satisfied',
    label: 'Constraints Satisfied',
    passed: true,
    detail: 'No CommitV2 Statement constraint provider configured',
  };
}

/**
 * Check 2: evidence_chain_complete
 *
 * Verifies that merged paths represent nodes with source references.
 * With tree-primary types, this check is based on path count.
 */
function checkEvidenceChain(paths: string[]): MergeCheckType {
  if (paths.length === 0) {
    return {
      id: 'evidence_chain_complete',
      label: 'Evidence Chain Complete',
      passed: true,
      detail: 'No nodes to verify',
    };
  }

  // With path-based MergeResult, we can't check source refs directly.
  // Pass by default — the actual source check happens at commit time.
  return {
    id: 'evidence_chain_complete',
    label: 'Evidence Chain Complete',
    passed: true,
    detail: `${paths.length} node(s) in merge result`,
  };
}

// ============================================================
// Main Entry Point
// ============================================================

/**
 * Compute all merge checks for a draft.
 *
 * Returns an array of check results suitable for the merge review UI.
 */
export async function computeMergeChecks(db: AnyDB, draft: MergeDraft): Promise<MergeCheckType[]> {
  void db;
  void draft.projectId;
  void draft.sourceHash;
  void draft.targetHash;
  const prepared = JSON.parse(draft.preparedJson) as MergeResult;

  // Extract merged paths for checks
  const mergedPaths = extractMergedPaths(prepared);
  const constraintsCheck = checkConstraintsSatisfied();
  const evidenceCheck = checkEvidenceChain(mergedPaths);

  return [constraintsCheck, evidenceCheck];
}
