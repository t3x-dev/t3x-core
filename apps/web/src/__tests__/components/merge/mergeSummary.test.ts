/**
 * Tests for computeMergeSummary pure function
 */

import type { MergeResult } from '@t3x-dev/core';
import { describe, expect, it } from 'vitest';
import { computeMergeSummary } from '@/components/merge/mergeSummary';
import type { ExtendedResolutionData } from '@/store/mergeWorkspaceStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEmptyPrepared(): MergeResult {
  return {
    autoKept: [],
    conflicts: [],
    onlyInSource: [],
    onlyInTarget: [],
    relationsOnlyInSource: [],
    relationsOnlyInTarget: [],
    relationsInBoth: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeMergeSummary', () => {
  it('returns all zeros for empty merge', () => {
    const result = computeMergeSummary(makeEmptyPrepared());

    expect(result).toEqual({
      kept_identical: 0,
      resolved_conflicts: 0,
      kept_from_source: 0,
      kept_from_target: 0,
      kept_both: 0,
      discarded: 0,
      total_nodes: 0,
      highlight: 'No changes',
    });
  });

  it('counts auto-kept nodes', () => {
    const prepared: MergeResult = {
      ...makeEmptyPrepared(),
      autoKept: ['topic/a', 'topic/b', 'topic/c'],
    };

    const result = computeMergeSummary(prepared);

    expect(result.kept_identical).toBe(3);
    expect(result.total_nodes).toBe(3);
    expect(result.resolved_conflicts).toBe(0);
    expect(result.discarded).toBe(0);
    expect(result.highlight).toBe('Kept 3');
  });

  it('counts resolved conflicts from conflict resolutions (source/target)', () => {
    const prepared: MergeResult = {
      ...makeEmptyPrepared(),
      conflicts: [
        { path: 'topic/a', slotConflicts: [] },
        { path: 'topic/b', slotConflicts: [] },
      ],
    };

    const resolutions: Record<string, 'source' | 'target'> = {
      'topic/a': 'source',
      'topic/b': 'target',
    };

    const result = computeMergeSummary(prepared, resolutions);

    expect(result.resolved_conflicts).toBe(2);
    expect(result.kept_from_source).toBe(1);
    expect(result.kept_from_target).toBe(1);
    expect(result.kept_both).toBe(0);
    expect(result.total_nodes).toBe(2);
    expect(result.highlight).toBe('resolved 2 conflicts');
  });

  it('counts extended "both" resolutions', () => {
    const prepared: MergeResult = {
      ...makeEmptyPrepared(),
      conflicts: [
        { path: 'topic/a', slotConflicts: [] },
      ],
    };
    const ext: Record<string, ExtendedResolutionData> = {
      '0': { type: 'both' },
    };

    const result = computeMergeSummary(prepared, undefined, undefined, undefined, ext);

    expect(result.kept_both).toBe(1);
    expect(result.resolved_conflicts).toBe(1);
    // 'both' contributes 2 nodes
    expect(result.total_nodes).toBe(2);
    expect(result.highlight).toBe('resolved 1 conflict');
  });

  it('counts onlyInSource/onlyInTarget with keepSource/keepTarget sets', () => {
    const prepared: MergeResult = {
      ...makeEmptyPrepared(),
      onlyInSource: ['src/a', 'src/b'],
      onlyInTarget: ['tgt/a', 'tgt/b', 'tgt/c'],
    };

    // Keep 1 of 2 source, 2 of 3 target
    const keepSource = new Set(['src/a']);
    const keepTarget = new Set(['tgt/a', 'tgt/c']);

    const result = computeMergeSummary(prepared, undefined, keepSource, keepTarget);

    expect(result.kept_from_source).toBe(1);
    expect(result.kept_from_target).toBe(2);
    expect(result.discarded).toBe(2); // 1 source + 1 target discarded
    expect(result.total_nodes).toBe(3); // 1 source + 2 target
    expect(result.highlight).toBe('discarded 2');
  });

  it('handles full mixed scenario', () => {
    const prepared: MergeResult = {
      autoKept: ['identical/a', 'identical/b'],
      conflicts: [
        { path: 'conflict/a', slotConflicts: [] },
        { path: 'conflict/b', slotConflicts: [] },
        { path: 'conflict/c', slotConflicts: [] },
      ],
      onlyInSource: ['src/a', 'src/b'],
      onlyInTarget: ['tgt/a'],
      relationsOnlyInSource: [],
      relationsOnlyInTarget: [],
      relationsInBoth: [],
    };

    const resolutions: Record<string, 'source' | 'target'> = {
      'conflict/a': 'source',
      'conflict/b': 'target',
    };
    const ext: Record<string, ExtendedResolutionData> = {
      '2': { type: 'both' },
    };
    const keepSource = new Set(['src/a']);

    const result = computeMergeSummary(prepared, resolutions, keepSource, undefined, ext);

    // identical: 2
    expect(result.kept_identical).toBe(2);
    // conflicts: source(1) + target(1) + both(1) = 3
    expect(result.resolved_conflicts).toBe(3);
    // from source: 1 (conflict) + 1 (onlyIn kept) = 2
    expect(result.kept_from_source).toBe(2);
    // from target: 1 (conflict) + 1 (onlyIn, all kept by default) = 2
    expect(result.kept_from_target).toBe(2);
    expect(result.kept_both).toBe(1);
    expect(result.discarded).toBe(1); // 1 source discarded
    // total: 2 (identical) + 1 (source conflict) + 1 (target conflict) + 2 (both) + 1 (source kept) + 1 (target) = 8
    expect(result.total_nodes).toBe(8);
    expect(result.highlight).toBe('Kept 2, resolved 3 conflicts, discarded 1');
  });

  it('skips unresolved conflicts in counts', () => {
    const prepared: MergeResult = {
      ...makeEmptyPrepared(),
      autoKept: ['topic/ok'],
      conflicts: [
        { path: 'topic/conflict', slotConflicts: [] },
      ],
    };

    const result = computeMergeSummary(prepared);

    expect(result.resolved_conflicts).toBe(0);
    expect(result.kept_from_source).toBe(0);
    expect(result.kept_from_target).toBe(0);
    expect(result.kept_both).toBe(0);
    expect(result.total_nodes).toBe(1); // only the auto-kept
    expect(result.highlight).toBe('Kept 1');
  });

  it('handles singular conflict in highlight', () => {
    const prepared: MergeResult = {
      ...makeEmptyPrepared(),
      conflicts: [
        { path: 'topic/a', slotConflicts: [] },
      ],
    };
    const resolutions: Record<string, 'source' | 'target'> = {
      'topic/a': 'source',
    };

    const result = computeMergeSummary(prepared, resolutions);

    expect(result.highlight).toBe('resolved 1 conflict');
  });

  it('numbers are self-consistent', () => {
    const prepared: MergeResult = {
      autoKept: ['i1', 'i2'],
      conflicts: [
        { path: 'c/a', slotConflicts: [] },
        { path: 'c/b', slotConflicts: [] },
      ],
      onlyInSource: ['os'],
      onlyInTarget: ['ot1', 'ot2'],
      relationsOnlyInSource: [],
      relationsOnlyInTarget: [],
      relationsInBoth: [],
    };
    const resolutions: Record<string, 'source' | 'target'> = {
      'c/a': 'source',
    };
    const ext: Record<string, ExtendedResolutionData> = {
      '1': { type: 'both' },
    };
    const keepTarget = new Set(['ot1']);

    const result = computeMergeSummary(prepared, resolutions, undefined, keepTarget, ext);

    // Self-consistency check: total_nodes should equal
    // kept_identical + conflictSource + conflictTarget + both*2 + keptSource + keptTarget
    const expectedTotal =
      result.kept_identical +
      (result.kept_from_source - prepared.onlyInSource.length) + // conflict source contributions
      (result.kept_from_target - keepTarget.size) + // conflict target contributions
      result.kept_both * 2 +
      prepared.onlyInSource.length + // all source kept by default
      keepTarget.size;

    expect(result.total_nodes).toBe(expectedTotal);
  });
});
