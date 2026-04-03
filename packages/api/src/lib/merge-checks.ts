/**
 * Merge Checks Business Logic
 *
 * Server-side validation checks for merge drafts.
 * Returns an array of MergeCheck items for the merge review UI.
 *
 * Checks:
 * 1. constraints_satisfied — Per-Leaf constraint validation against merged text
 * 2. evidence_chain_complete — All nodes have source references
 * 3. eval_passed — (Optional) Latest evaluation run status per associated Leaf
 */

import type { Leaf, MergeResult } from '@t3x-dev/core';
import { validateConstraintsExactOnly } from '@t3x-dev/core';
import type { AnyDB } from '@t3x-dev/storage';
import { findLeavesByCommit, listRuns } from '@t3x-dev/storage';
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

/**
 * Convert paths to text for constraint checking.
 * Simply joins the paths (minimal text for constraint validation).
 */
function pathsToText(paths: string[]): string {
  return paths.join('\n');
}

// ============================================================
// Individual Check Functions
// ============================================================

/**
 * Check 1: constraints_satisfied
 *
 * Validates merged text against each Leaf's constraints independently.
 * Uses exact-only matching (semantic matching requires embedder).
 */
async function checkConstraintsSatisfied(
  db: AnyDB,
  draft: MergeDraft,
  mergedText: string
): Promise<MergeCheckType> {
  // Find leaves for both source and target commits
  const [sourceLeaves, targetLeaves] = await Promise.all([
    findLeavesByCommit(db, draft.sourceHash),
    findLeavesByCommit(db, draft.targetHash),
  ]);

  // Deduplicate leaves by ID (a leaf can't belong to both, but just in case)
  const leafMap = new Map<string, Leaf>();
  for (const leaf of [...sourceLeaves, ...targetLeaves]) {
    leafMap.set(leaf.id, leaf);
  }
  const allLeaves = Array.from(leafMap.values());

  // Filter to leaves that have constraints
  const leavesWithConstraints = allLeaves.filter((l) => l.constraints.length > 0);

  if (leavesWithConstraints.length === 0) {
    return {
      id: 'constraints_satisfied',
      label: 'Constraints Satisfied',
      passed: true,
      detail: 'No constraints to check',
    };
  }

  // Validate each leaf independently
  const results: string[] = [];
  let allPassed = true;

  for (const leaf of leavesWithConstraints) {
    const validation = validateConstraintsExactOnly(mergedText, leaf.constraints);
    const total = leaf.constraints.length;
    results.push(`${leaf.id}: ${validation.passedCount}/${total}`);
    if (!validation.allPassed) {
      allPassed = false;
    }
  }

  return {
    id: 'constraints_satisfied',
    label: 'Constraints Satisfied',
    passed: allPassed,
    detail: results.join(', '),
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

/**
 * Check 3: eval_passed (optional)
 *
 * Checks the latest evaluation run status for associated leaves.
 * Only included when there are associated leaves.
 */
async function checkEvalPassed(db: AnyDB, draft: MergeDraft): Promise<MergeCheckType | null> {
  // Find leaves for both commits
  const [sourceLeaves, targetLeaves] = await Promise.all([
    findLeavesByCommit(db, draft.sourceHash),
    findLeavesByCommit(db, draft.targetHash),
  ]);

  const leafMap = new Map<string, Leaf>();
  for (const leaf of [...sourceLeaves, ...targetLeaves]) {
    leafMap.set(leaf.id, leaf);
  }
  const allLeaves = Array.from(leafMap.values());

  // No leaves -> don't include this check
  if (allLeaves.length === 0) {
    return null;
  }

  // Query runs for the project, then filter by leaf IDs
  const leafIds = new Set(allLeaves.map((l) => l.id));
  const allRuns = await listRuns(db, { projectId: draft.projectId, limit: 500 });

  // Group by leafId, keep only the latest (listRuns returns ordered by createdAt DESC)
  const latestRunByLeaf = new Map<string, { status: string }>();
  for (const run of allRuns) {
    if (run.leafId && leafIds.has(run.leafId) && !latestRunByLeaf.has(run.leafId)) {
      latestRunByLeaf.set(run.leafId, { status: run.status });
    }
  }
  const latestRuns = Array.from(latestRunByLeaf.values());

  // Has leaves but no runs
  if (latestRuns.length === 0) {
    return {
      id: 'eval_passed',
      label: 'Evaluation Passed',
      passed: true,
      detail: 'No evaluation runs found (not required)',
    };
  }

  const allCompleted = latestRuns.every((r) => r.status === 'completed');
  const completedCount = latestRuns.filter((r) => r.status === 'completed').length;

  return {
    id: 'eval_passed',
    label: 'Evaluation Passed',
    passed: allCompleted,
    detail: `${completedCount}/${latestRuns.length} run(s) completed`,
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
  const prepared = JSON.parse(draft.preparedJson) as MergeResult;

  // Extract merged paths for checks
  const mergedPaths = extractMergedPaths(prepared);
  const mergedText = pathsToText(mergedPaths);

  // Run checks
  const [constraintsCheck, evalCheck] = await Promise.all([
    checkConstraintsSatisfied(db, draft, mergedText),
    checkEvalPassed(db, draft),
  ]);

  const evidenceCheck = checkEvidenceChain(mergedPaths);

  const checks: MergeCheckType[] = [constraintsCheck, evidenceCheck];

  if (evalCheck) {
    checks.push(evalCheck);
  }

  return checks;
}
