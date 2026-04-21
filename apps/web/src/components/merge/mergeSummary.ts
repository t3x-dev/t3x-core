/**
 * Merge Summary — Pure Function
 *
 * Computes a structured summary of a merge operation from
 * MergeResult + optional extended resolutions.
 *
 * Purely deterministic, no side effects, no API calls.
 */

import type { MergeResult } from '@t3x-dev/core';
import type { ExtendedResolutionData } from '@/store/mergeWorkspaceStore';

// ============================================================================
// Types
// ============================================================================

export interface MergeSummary {
  /** Count of identical (unchanged) nodes auto-kept */
  kept_identical: number;
  /** Count of resolved conflict paths */
  resolved_conflicts: number;
  /** Count of nodes kept from source side */
  kept_from_source: number;
  /** Count of nodes kept from target side */
  kept_from_target: number;
  /** Count of conflicts where both source and target were kept */
  kept_both: number;
  /** Count of discarded nodes */
  discarded: number;
  /** Final total node count in merged result */
  total_nodes: number;
  /** One-line English summary template */
  highlight: string;
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Compute a structured merge summary.
 *
 * @param prepared - The MergeResult from prepareMerge()
 * @param conflictResolutions - Map of conflict path → resolution
 * @param keepSource - Set of source-only paths to keep
 * @param keepTarget - Set of target-only paths to keep
 * @param extendedResolutions - Optional extended resolutions (e.g. 'both') keyed by conflict index
 * @returns MergeSummary
 */
export function computeMergeSummary(
  prepared: MergeResult,
  conflictResolutions?: Record<string, 'source' | 'target'>,
  keepSource?: Set<string>,
  keepTarget?: Set<string>,
  extendedResolutions?: Record<string, ExtendedResolutionData>
): MergeSummary {
  const ext = extendedResolutions ?? {};
  const resolutions = conflictResolutions ?? {};

  // 1. Auto-kept nodes
  const kept_identical = prepared.autoKept.length;

  // 2. Conflicts — count by resolution type
  let conflictSource = 0;
  let conflictTarget = 0;
  let kept_both = 0;
  let _unresolved = 0;

  for (let i = 0; i < prepared.conflicts.length; i++) {
    const conflict = prepared.conflicts[i];
    const extRes = ext[String(i)];

    if (extRes?.type === 'both') {
      kept_both++;
    } else if (resolutions[conflict.path] === 'source') {
      conflictSource++;
    } else if (resolutions[conflict.path] === 'target') {
      conflictTarget++;
    } else {
      _unresolved++;
    }
  }

  const resolved_conflicts = conflictSource + conflictTarget + kept_both;

  // 3. Only-in-source / only-in-target — kept vs discarded
  const keptSourceCount = keepSource ? keepSource.size : prepared.onlyInSource.length;
  const keptTargetCount = keepTarget ? keepTarget.size : prepared.onlyInTarget.length;
  const discardedSource = prepared.onlyInSource.length - keptSourceCount;
  const discardedTarget = prepared.onlyInTarget.length - keptTargetCount;

  const kept_from_source = conflictSource + keptSourceCount;
  const kept_from_target = conflictTarget + keptTargetCount;
  const discarded = discardedSource + discardedTarget;

  // 4. Total nodes in merged result
  const total_nodes =
    kept_identical +
    conflictSource +
    conflictTarget +
    kept_both * 2 +
    keptSourceCount +
    keptTargetCount;

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
    total_nodes,
    highlight,
  };
}
