/**
 * Merge Checks Business Logic
 *
 * Server-side validation checks for merge drafts.
 * Returns an array of MergeCheck items for the merge review UI.
 *
 * Checks:
 * 1. constraints_satisfied — Per-Leaf constraint validation against merged text
 * 2. evidence_chain_complete — All non-edited sentences have source_ref
 * 3. eval_passed — (Optional) Latest evaluation run status per associated Leaf
 */

import type { DiffableSentence, Leaf, Merge2WayResult } from '@t3x-dev/core';
import { validateConstraintsExactOnly } from '@t3x-dev/core';
import type { AnyDB } from '@t3x-dev/storage';
import { findLeavesByCommit, listRuns } from '@t3x-dev/storage';
import type { MergeCheckType } from '../schemas/v4-contracts';

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
// Extract Merged Sentences
// ============================================================

/**
 * Extract the final set of sentences from a resolved Merge2WayResult.
 *
 * Returns each sentence with an `isEdited` flag indicating whether
 * it came from a user edit (resolution='edit') — edited sentences
 * are excluded from evidence chain checks since they have no source.
 */
export function extractMergedSentences(
  prepared: Merge2WayResult
): Array<{ sentence: DiffableSentence; isEdited: boolean }> {
  const result: Array<{ sentence: DiffableSentence; isEdited: boolean }> = [];

  // identical → all included
  for (const s of prepared.identical) {
    result.push({ sentence: s, isEdited: false });
  }

  // similarPairs → pick based on resolution
  for (const pair of prepared.similarPairs) {
    if (pair.resolution === 'source') {
      result.push({ sentence: pair.source, isEdited: false });
    } else if (pair.resolution === 'target') {
      result.push({ sentence: pair.target, isEdited: false });
    }
    // unresolved pairs are skipped (shouldn't happen if checks run after resolution)
  }

  // onlyInSource → keep=true only
  for (const candidate of prepared.onlyInSource) {
    if (candidate.keep) {
      result.push({ sentence: candidate.sentence, isEdited: false });
    }
  }

  // onlyInTarget → keep=true only
  for (const candidate of prepared.onlyInTarget) {
    if (candidate.keep) {
      result.push({ sentence: candidate.sentence, isEdited: false });
    }
  }

  return result;
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
 * Verifies that all non-edited merged sentences have a source_ref.
 * Edited sentences (from resolution='edit') are excluded since they
 * are merge-generated and don't trace back to a source.
 */
function checkEvidenceChain(
  mergedSentences: Array<{ sentence: DiffableSentence; isEdited: boolean }>
): MergeCheckType {
  // Only check non-edited sentences
  const checkable = mergedSentences.filter((s) => !s.isEdited);

  if (checkable.length === 0) {
    return {
      id: 'evidence_chain_complete',
      label: 'Evidence Chain Complete',
      passed: true,
      detail: 'No sentences to verify',
    };
  }

  const missing = checkable.filter((s) => !s.sentence.source_ref);

  if (missing.length === 0) {
    return {
      id: 'evidence_chain_complete',
      label: 'Evidence Chain Complete',
      passed: true,
      detail: `All ${checkable.length} sentence(s) have source references`,
    };
  }

  return {
    id: 'evidence_chain_complete',
    label: 'Evidence Chain Complete',
    passed: false,
    detail: `${missing.length} of ${checkable.length} sentence(s) missing source reference`,
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

  // No leaves → don't include this check
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
  const prepared = JSON.parse(draft.preparedJson) as Merge2WayResult;

  // Extract merged sentences for checks
  const mergedSentences = extractMergedSentences(prepared);
  const mergedText = mergedSentences.map((s) => s.sentence.text).join('\n');

  // Run checks
  const [constraintsCheck, evalCheck] = await Promise.all([
    checkConstraintsSatisfied(db, draft, mergedText),
    checkEvalPassed(db, draft),
  ]);

  const evidenceCheck = checkEvidenceChain(mergedSentences);

  const checks: MergeCheckType[] = [constraintsCheck, evidenceCheck];

  if (evalCheck) {
    checks.push(evalCheck);
  }

  return checks;
}
