/**
 * Tests for computeMergeSummary pure function
 */

import type { DiffableSentence, Merge2WayResult } from '@t3x/core';
import { describe, expect, it } from 'vitest';
import { computeMergeSummary } from '@/lib/mergeSummary';
import type { ExtendedResolutionData } from '@/store/mergeWorkspaceStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSentence(id: string, text: string): DiffableSentence {
  return { id, text, confidence: 0.9 };
}

function makeEmptyPrepared(): Merge2WayResult {
  return {
    identical: [],
    similarPairs: [],
    onlyInSource: [],
    onlyInTarget: [],
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
      total_sentences: 0,
      highlight: 'No changes',
    });
  });

  it('counts identical sentences', () => {
    const prepared: Merge2WayResult = {
      ...makeEmptyPrepared(),
      identical: [
        makeSentence('s1', 'Hello'),
        makeSentence('s2', 'World'),
        makeSentence('s3', 'Foo'),
      ],
    };

    const result = computeMergeSummary(prepared);

    expect(result.kept_identical).toBe(3);
    expect(result.total_sentences).toBe(3);
    expect(result.resolved_conflicts).toBe(0);
    expect(result.discarded).toBe(0);
    expect(result.highlight).toBe('Kept 3');
  });

  it('counts resolved conflicts from similarPairs (source/target)', () => {
    const prepared: Merge2WayResult = {
      ...makeEmptyPrepared(),
      similarPairs: [
        {
          source: makeSentence('s1', 'Source v1'),
          target: makeSentence('s2', 'Target v1'),
          wordDiff: [],
          resolution: 'source',
        },
        {
          source: makeSentence('s3', 'Source v2'),
          target: makeSentence('s4', 'Target v2'),
          wordDiff: [],
          resolution: 'target',
        },
      ],
    };

    const result = computeMergeSummary(prepared);

    expect(result.resolved_conflicts).toBe(2);
    expect(result.kept_from_source).toBe(1);
    expect(result.kept_from_target).toBe(1);
    expect(result.kept_both).toBe(0);
    expect(result.total_sentences).toBe(2);
    expect(result.highlight).toBe('resolved 2 conflicts');
  });

  it('counts extended "both" resolutions', () => {
    const prepared: Merge2WayResult = {
      ...makeEmptyPrepared(),
      similarPairs: [
        {
          source: makeSentence('s1', 'Source'),
          target: makeSentence('s2', 'Target'),
          wordDiff: [],
          // No standard resolution — extended 'both'
        },
      ],
    };
    const ext: Record<string, ExtendedResolutionData> = {
      '0': { type: 'both' },
    };

    const result = computeMergeSummary(prepared, ext);

    expect(result.kept_both).toBe(1);
    expect(result.resolved_conflicts).toBe(1);
    // 'both' contributes 2 sentences
    expect(result.total_sentences).toBe(2);
    expect(result.highlight).toBe('resolved 1 conflict');
  });

  it('counts onlyInSource/onlyInTarget kept and discarded', () => {
    const prepared: Merge2WayResult = {
      ...makeEmptyPrepared(),
      onlyInSource: [
        { sentence: makeSentence('s1', 'Only source A'), keep: true },
        { sentence: makeSentence('s2', 'Only source B'), keep: false },
      ],
      onlyInTarget: [
        { sentence: makeSentence('s3', 'Only target A'), keep: true },
        { sentence: makeSentence('s4', 'Only target B'), keep: false },
        { sentence: makeSentence('s5', 'Only target C'), keep: true },
      ],
    };

    const result = computeMergeSummary(prepared);

    expect(result.kept_from_source).toBe(1);
    expect(result.kept_from_target).toBe(2);
    expect(result.discarded).toBe(2);
    expect(result.total_sentences).toBe(3);
    expect(result.highlight).toBe('discarded 2');
  });

  it('handles full mixed scenario', () => {
    const prepared: Merge2WayResult = {
      identical: [makeSentence('i1', 'Identical 1'), makeSentence('i2', 'Identical 2')],
      similarPairs: [
        {
          source: makeSentence('sp1s', 'Source pair 1'),
          target: makeSentence('sp1t', 'Target pair 1'),
          wordDiff: [],
          resolution: 'source',
        },
        {
          source: makeSentence('sp2s', 'Source pair 2'),
          target: makeSentence('sp2t', 'Target pair 2'),
          wordDiff: [],
          resolution: 'target',
        },
        {
          source: makeSentence('sp3s', 'Source pair 3'),
          target: makeSentence('sp3t', 'Target pair 3'),
          wordDiff: [],
          // extended: both
        },
      ],
      onlyInSource: [
        { sentence: makeSentence('os1', 'Only source'), keep: true },
        { sentence: makeSentence('os2', 'Discarded source'), keep: false },
      ],
      onlyInTarget: [{ sentence: makeSentence('ot1', 'Only target'), keep: true }],
    };
    const ext: Record<string, ExtendedResolutionData> = {
      '2': { type: 'both' },
    };

    const result = computeMergeSummary(prepared, ext);

    // identical: 2
    expect(result.kept_identical).toBe(2);
    // conflicts: source(1) + target(1) + both(1) = 3
    expect(result.resolved_conflicts).toBe(3);
    // from source: 1 (conflict) + 1 (onlyIn) = 2
    expect(result.kept_from_source).toBe(2);
    // from target: 1 (conflict) + 1 (onlyIn) = 2
    expect(result.kept_from_target).toBe(2);
    expect(result.kept_both).toBe(1);
    expect(result.discarded).toBe(1);
    // total: 2 (identical) + 1 (source conflict) + 1 (target conflict) + 2 (both) + 1 (onlySource) + 1 (onlyTarget) = 8
    expect(result.total_sentences).toBe(8);
    expect(result.highlight).toBe('Kept 2, resolved 3 conflicts, discarded 1');
  });

  it('skips unresolved pairs in counts', () => {
    const prepared: Merge2WayResult = {
      ...makeEmptyPrepared(),
      identical: [makeSentence('s1', 'OK')],
      similarPairs: [
        {
          source: makeSentence('s2', 'Source'),
          target: makeSentence('s3', 'Target'),
          wordDiff: [],
          // No resolution
        },
      ],
    };

    const result = computeMergeSummary(prepared);

    expect(result.resolved_conflicts).toBe(0);
    expect(result.kept_from_source).toBe(0);
    expect(result.kept_from_target).toBe(0);
    expect(result.kept_both).toBe(0);
    expect(result.total_sentences).toBe(1); // only the identical
    expect(result.highlight).toBe('Kept 1');
  });

  it('handles singular conflict in highlight', () => {
    const prepared: Merge2WayResult = {
      ...makeEmptyPrepared(),
      similarPairs: [
        {
          source: makeSentence('s1', 'A'),
          target: makeSentence('s2', 'B'),
          wordDiff: [],
          resolution: 'source',
        },
      ],
    };

    const result = computeMergeSummary(prepared);

    expect(result.highlight).toBe('resolved 1 conflict');
  });

  it('numbers are self-consistent', () => {
    const prepared: Merge2WayResult = {
      identical: [makeSentence('i1', 'I1'), makeSentence('i2', 'I2')],
      similarPairs: [
        {
          source: makeSentence('a', 'A'),
          target: makeSentence('b', 'B'),
          wordDiff: [],
          resolution: 'source',
        },
        {
          source: makeSentence('c', 'C'),
          target: makeSentence('d', 'D'),
          wordDiff: [],
          // both
        },
      ],
      onlyInSource: [{ sentence: makeSentence('os', 'OS'), keep: true }],
      onlyInTarget: [
        { sentence: makeSentence('ot1', 'OT1'), keep: true },
        { sentence: makeSentence('ot2', 'OT2'), keep: false },
      ],
    };
    const ext: Record<string, ExtendedResolutionData> = {
      '1': { type: 'both' },
    };

    const result = computeMergeSummary(prepared, ext);

    // Self-consistency check: total_sentences should equal
    // kept_identical + (resolved standard) + (both * 2) + kept candidates
    const expectedTotal =
      result.kept_identical +
      (result.kept_from_source - prepared.onlyInSource.filter((c) => c.keep).length) + // conflict source
      (result.kept_from_target - prepared.onlyInTarget.filter((c) => c.keep).length) + // conflict target
      result.kept_both * 2 +
      prepared.onlyInSource.filter((c) => c.keep).length +
      prepared.onlyInTarget.filter((c) => c.keep).length;

    expect(result.total_sentences).toBe(expectedTotal);
  });
});
