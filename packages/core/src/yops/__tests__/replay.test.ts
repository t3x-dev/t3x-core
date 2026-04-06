import { describe, expect, it } from 'vitest';
import type { SemanticContent } from '../../semantic/types';
import type { YOp } from '../types';
import { extractOpsFromEntries, replayYOps, verifyReplay } from '../replay';

const emptyContent: SemanticContent = { trees: [], relations: [] };

const baseContent: SemanticContent = {
  trees: [{ key: 'trip', slots: {}, children: [] }],
  relations: [],
};

describe('replayYOps', () => {
  it('replays set ops onto base content', () => {
    const ops: YOp[] = [
      { set: { path: 'trip/budget', value: 5000, source: 'about 5000', from: 'T1' } },
      { set: { path: 'trip/style', value: 'casual', source: 'casual style', from: 'T2' } },
    ];
    const result = replayYOps({ baseContent, ops });
    expect(result.ok).toBe(true);
    expect(result.opsApplied).toBe(2);
    expect(result.content.trees[0].slots.budget).toBe(5000);
    expect(result.content.trees[0].slots.style).toBe('casual');
  });

  it('returns ok with base content for empty ops', () => {
    const result = replayYOps({ baseContent, ops: [] });
    expect(result.ok).toBe(true);
    expect(result.opsApplied).toBe(0);
    expect(result.content.trees).toHaveLength(1);
  });

  it('stops at first error and reports it', () => {
    const ops: YOp[] = [
      { set: { path: 'trip/budget', value: 5000, source: 'src', from: 'T1' } },
      { set: { path: 'nonexistent/field', value: 1, source: 'src', from: 'T2' } },
    ];
    const result = replayYOps({ baseContent, ops });
    expect(result.ok).toBe(false);
    expect(result.opsApplied).toBe(1);
    expect(result.error).toBeDefined();
    expect(result.error!.op_index).toBe(1);
  });

  it('replays define + populate + set across multiple entries', () => {
    const ops: YOp[] = [
      { define: { parent: '', key: 'hotel' } },
      { populate: { path: 'hotel', slots: { name: 'Hilton' }, source: { name: 'Hilton hotel' }, from: 'T1' } },
      { set: { path: 'hotel/stars', value: 5, source: 'five star', from: 'T2' } },
    ];
    const result = replayYOps({ baseContent: emptyContent, ops });
    expect(result.ok).toBe(true);
    expect(result.content.trees).toHaveLength(1);
    expect(result.content.trees[0].key).toBe('hotel');
    expect(result.content.trees[0].slots.stars).toBe(5);
  });
});

describe('extractOpsFromEntries', () => {
  it('extracts and flattens ops from multiple entries', () => {
    const entries = [
      {
        id: 'yl_001',
        yops: [{ set: { path: 'trip/budget', value: 5000, source: 'src', from: 'T1' } }],
      },
      {
        id: 'yl_002',
        yops: [
          { set: { path: 'trip/style', value: 'casual', source: 'src', from: 'T2' } },
          { set: { path: 'trip/duration', value: 7, source: 'src', from: 'T2' } },
        ],
      },
    ];
    const ops = extractOpsFromEntries(entries);
    expect(ops).toHaveLength(3);
    expect((ops[0] as { set: { path: string } }).set.path).toBe('trip/budget');
    expect((ops[2] as { set: { path: string } }).set.path).toBe('trip/duration');
  });

  it('returns empty array for empty entries', () => {
    expect(extractOpsFromEntries([])).toEqual([]);
  });

  it('handles entries with empty yops array', () => {
    const entries = [{ id: 'yl_001', yops: [] }];
    expect(extractOpsFromEntries(entries)).toEqual([]);
  });

  it('throws on invalid op shape', () => {
    const entries = [{ id: 'yl_bad', yops: [{ bogus: 'not a real op' }] }];
    expect(() => extractOpsFromEntries(entries)).toThrow('yl_bad');
  });

  it('throws on non-array yops field', () => {
    const entries = [{ id: 'yl_bad', yops: 'not an array' }];
    expect(() => extractOpsFromEntries(entries)).toThrow('yl_bad');
  });
});

describe('verifyReplay', () => {
  it('returns match:true when replay produces expected content', () => {
    const base: SemanticContent = {
      trees: [{ key: 'trip', slots: {}, children: [] }],
      relations: [],
    };
    const ops: YOp[] = [
      { set: { path: 'trip/budget', value: 5000, source: 'about 5k', from: 'T1' } },
    ];
    const expected: SemanticContent = {
      trees: [{ key: 'trip', slots: { budget: 5000 }, children: [] }],
      relations: [],
    };
    const result = verifyReplay(base, ops, expected);
    expect(result.match).toBe(true);
    expect(result.opsApplied).toBe(1);
  });

  it('ignores metadata fields (source, slot_quotes) in comparison', () => {
    const base: SemanticContent = {
      trees: [{ key: 'trip', slots: {}, children: [] }],
      relations: [],
    };
    const ops: YOp[] = [
      { set: { path: 'trip/budget', value: 5000, source: 'about 5k', from: 'T1' } },
    ];
    const expected: SemanticContent = {
      trees: [
        {
          key: 'trip',
          slots: { budget: 5000 },
          children: [],
          source: 'different_source',
          slot_quotes: { budget: 'something else' },
        },
      ],
      relations: [],
    };
    const result = verifyReplay(base, ops, expected);
    expect(result.match).toBe(true);
  });

  it('returns match:false with diagnostics when content differs', () => {
    const base: SemanticContent = {
      trees: [{ key: 'trip', slots: {}, children: [] }],
      relations: [],
    };
    const ops: YOp[] = [
      { set: { path: 'trip/budget', value: 5000, source: 'src', from: 'T1' } },
    ];
    const expected: SemanticContent = {
      trees: [{ key: 'trip', slots: { budget: 9999 }, children: [] }],
      relations: [],
    };
    const result = verifyReplay(base, ops, expected);
    expect(result.match).toBe(false);
    expect(result.mismatch).toBeDefined();
    expect(result.mismatch!.replayed_tree_keys).toEqual(['trip']);
    expect(result.mismatch!.expected_tree_keys).toEqual(['trip']);
  });

  it('detects tree count mismatch', () => {
    const base: SemanticContent = { trees: [], relations: [] };
    const ops: YOp[] = [
      { define: { parent: '', key: 'hotel' } },
      { populate: { path: 'hotel', slots: { name: 'H' }, source: { name: 'H' }, from: 'T1' } },
    ];
    const expected: SemanticContent = { trees: [], relations: [] };
    const result = verifyReplay(base, ops, expected);
    expect(result.match).toBe(false);
    expect(result.mismatch!.replayed_tree_count).toBe(1);
    expect(result.mismatch!.expected_tree_count).toBe(0);
  });

  it('returns match:false when replay itself fails', () => {
    const base: SemanticContent = { trees: [], relations: [] };
    const ops: YOp[] = [
      { set: { path: 'nonexistent/field', value: 1, source: 'src', from: 'T1' } },
    ];
    const expected: SemanticContent = { trees: [], relations: [] };
    const result = verifyReplay(base, ops, expected);
    expect(result.match).toBe(false);
  });
});
