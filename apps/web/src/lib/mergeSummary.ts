/**
 * Merge Summary — Pure Function
 *
 * Computes a structured summary of a merge operation from
 * Merge2WayResult + optional extended resolutions.
 *
 * Purely deterministic, no side effects, no API calls.
 */

import type { Merge2WayResult } from '@t3x/core';
import type { ExtendedResolutionData } from '@/store/mergeWorkspaceStore';

// ============================================================================
// Types
// ============================================================================

export interface MergeSummary {
  /** Count of identical (unchanged) sentences auto-kept */
  kept_identical: number;
  /** Count of resolved conflict pairs (source + target + both) */
  resolved_conflicts: number;
  /** Count of sentences kept from source side */
  kept_from_source: number;
  /** Count of sentences kept from target side */
  kept_from_target: number;
  /** Count of pairs where both source and target were kept */
  kept_both: number;
  /** Count of discarded sentences (onlyIn* with keep=false) */
  discarded: number;
  /** Final total sentence count in merged result */
  total_sentences: number;
  /** One-line English summary template */
  highlight: string;
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Compute a structured merge summary.
 *
 * @param prepared - The Merge2WayResult from prepareMerge()
 * @param extendedResolutions - Optional extended resolutions (e.g. 'both') keyed by pair index
 * @returns MergeSummary with 8 fields
 */
export function computeMergeSummary(
  prepared: Merge2WayResult,
  extendedResolutions?: Record<string, ExtendedResolutionData>
): MergeSummary {
  const ext = extendedResolutions ?? {};

  // 1. Identical sentences — all auto-kept
  const kept_identical = prepared.identical.length;

  // 2. Similar pairs — count by resolution type
  let conflictSource = 0;
  let conflictTarget = 0;
  let kept_both = 0;

  for (let i = 0; i < prepared.similarPairs.length; i++) {
    const pair = prepared.similarPairs[i];
    const extRes = ext[String(i)];

    if (extRes?.type === 'both') {
      kept_both++;
    } else if (pair.resolution === 'source') {
      conflictSource++;
    } else if (pair.resolution === 'target') {
      conflictTarget++;
    }
    // Unresolved pairs are not counted in any bucket
  }

  const resolved_conflicts = conflictSource + conflictTarget + kept_both;

  // 3. Only-in-source / only-in-target — kept vs discarded
  const keptSourceCandidates = prepared.onlyInSource.filter((c) => c.keep).length;
  const keptTargetCandidates = prepared.onlyInTarget.filter((c) => c.keep).length;
  const discardedSource = prepared.onlyInSource.filter((c) => !c.keep).length;
  const discardedTarget = prepared.onlyInTarget.filter((c) => !c.keep).length;

  const kept_from_source = conflictSource + keptSourceCandidates;
  const kept_from_target = conflictTarget + keptTargetCandidates;
  const discarded = discardedSource + discardedTarget;

  // 4. Total sentences in merged result
  // identical + resolved conflicts (1 per pair, except 'both' contributes 2) + kept candidates
  const total_sentences =
    kept_identical +
    conflictSource +
    conflictTarget +
    kept_both * 2 +
    keptSourceCandidates +
    keptTargetCandidates;

  // 5. Highlight — English template string
  const parts: string[] = [];
  if (kept_identical > 0) {
    parts.push(`Kept ${kept_identical}`);
  }
  if (resolved_conflicts > 0) {
    parts.push(`resolved ${resolved_conflicts} conflict${resolved_conflicts !== 1 ? 's' : ''}`);
  }
  if (discarded > 0) {
    parts.push(`discarded ${discarded}`);
  }

  const highlight = parts.length > 0 ? parts.join(', ') : 'No changes';

  return {
    kept_identical,
    resolved_conflicts,
    kept_from_source,
    kept_from_target,
    kept_both,
    discarded,
    total_sentences,
    highlight,
  };
}
