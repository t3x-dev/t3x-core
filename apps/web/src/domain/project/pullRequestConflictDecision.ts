import type { MergeDecision } from '@t3x-dev/core';

export type PullRequestConflictSide = 'main' | 'feature';

export function buildPullRequestConflictDecision(
  prepared: {
    conflicts: ReadonlyArray<{ path: string }>;
    onlyInSource: readonly string[];
    onlyInTarget: readonly string[];
  },
  side: PullRequestConflictSide
): MergeDecision {
  const resolution = side === 'feature' ? 'source' : 'target';
  return {
    conflictResolutions: Object.fromEntries(
      prepared.conflicts.map((conflict) => [conflict.path, resolution])
    ),
    keepFromSource: [...prepared.onlyInSource],
    keepFromTarget: [...prepared.onlyInTarget],
    keepRelationsFromSource: true,
    keepRelationsFromTarget: true,
  };
}
