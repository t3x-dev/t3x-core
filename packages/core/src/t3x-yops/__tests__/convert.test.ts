import { describe, expect, it } from 'vitest';
import type { TreeNode } from '../../semantic/types';
import { treesToYValue, yvalueToTrees } from '../convert';

// ── Helpers ──

const node = (key: string, slots: TreeNode['slots'] = {}, children: TreeNode[] = []): TreeNode => ({
  key,
  slots,
  children,
});

// ── Tests ──

describe('treesToYValue', () => {
  it('returns empty mapping for empty trees array', () => {
    expect(treesToYValue([])).toEqual({});
  });

  it('converts a single flat tree', () => {
    const trees = [node('trip', { budget: 5000, destination: 'Tokyo' })];
    expect(treesToYValue(trees)).toEqual({
      trip: { budget: 5000, destination: 'Tokyo' },
    });
  });

  it('converts a single tree with nested children', () => {
    const trees = [node('trip', { budget: 5000 }, [node('dining', { style: 'casual' })])];
    expect(treesToYValue(trees)).toEqual({
      trip: {
        budget: 5000,
        dining: { style: 'casual' },
      },
    });
  });

  it('converts multiple root trees to separate top-level keys', () => {
    const trees = [node('trip', { destination: 'Paris' }), node('budget', { total: 3000 })];
    expect(treesToYValue(trees)).toEqual({
      trip: { destination: 'Paris' },
      budget: { total: 3000 },
    });
  });

  it('converts deeply nested children', () => {
    const trees = [
      node('project', {}, [node('phase1', { duration: '2w' }, [node('task', { owner: 'alice' })])]),
    ];
    expect(treesToYValue(trees)).toEqual({
      project: {
        phase1: {
          duration: '2w',
          task: {
            owner: 'alice',
          },
        },
      },
    });
  });

  it('output does not contain slot_quotes or source fields', () => {
    const trees = [node('trip', { budget: 5000 })];
    const result = treesToYValue(trees) as Record<string, unknown>;
    expect(result.trip).not.toHaveProperty('slot_quotes');
    expect(result.trip).not.toHaveProperty('source');
    expect(result.trip).toEqual({ budget: 5000 });
  });

  it('handles array-valued slots correctly (not treated as children)', () => {
    const trees = [node('pref', { colors: ['red', 'blue', 'green'] })];
    expect(treesToYValue(trees)).toEqual({
      pref: { colors: ['red', 'blue', 'green'] },
    });
  });

  it('handles boolean and number slots', () => {
    const trees = [node('settings', { enabled: true, retries: 3 })];
    expect(treesToYValue(trees)).toEqual({
      settings: { enabled: true, retries: 3 },
    });
  });

  it('handles tree with no slots and no children', () => {
    const trees = [node('empty')];
    expect(treesToYValue(trees)).toEqual({ empty: {} });
  });
});

describe('yvalueToTrees', () => {
  it('returns empty array for empty mapping', () => {
    expect(yvalueToTrees({})).toEqual([]);
  });

  it('returns empty array for non-object YValue (null)', () => {
    expect(yvalueToTrees(null)).toEqual([]);
  });

  it('returns empty array for non-object YValue (string)', () => {
    expect(yvalueToTrees('hello')).toEqual([]);
  });

  it('returns empty array for non-object YValue (array)', () => {
    expect(yvalueToTrees(['a', 'b'])).toEqual([]);
  });

  it('converts a single flat mapping to a tree', () => {
    const doc = { trip: { budget: 5000, destination: 'Tokyo' } };
    const trees = yvalueToTrees(doc);
    expect(trees).toHaveLength(1);
    expect(trees[0].key).toBe('trip');
    expect(trees[0].slots).toEqual({ budget: 5000, destination: 'Tokyo' });
    expect(trees[0].children).toHaveLength(0);
  });

  it('treats nested plain objects as children', () => {
    const doc = {
      trip: {
        budget: 5000,
        dining: { style: 'casual' },
      },
    };
    const trees = yvalueToTrees(doc);
    expect(trees[0].children).toHaveLength(1);
    expect(trees[0].children[0].key).toBe('dining');
    expect(trees[0].children[0].slots).toEqual({ style: 'casual' });
    expect(trees[0].slots).toEqual({ budget: 5000 });
  });

  it('treats arrays as slot values, not children', () => {
    const doc = { pref: { colors: ['red', 'blue'] } };
    const trees = yvalueToTrees(doc);
    expect(trees[0].slots).toEqual({ colors: ['red', 'blue'] });
    expect(trees[0].children).toHaveLength(0);
  });

  it('treats null as a slot value, not a child', () => {
    const doc = { item: { value: null } };
    const trees = yvalueToTrees(doc);
    expect(trees[0].slots).toEqual({ value: null });
    expect(trees[0].children).toHaveLength(0);
  });

  it('converts multiple root keys to multiple trees', () => {
    const doc = {
      trip: { destination: 'Paris' },
      budget: { total: 3000 },
    };
    const trees = yvalueToTrees(doc);
    expect(trees).toHaveLength(2);
    const keys = trees.map((t) => t.key);
    expect(keys).toContain('trip');
    expect(keys).toContain('budget');
  });
});

describe('round-trip: yvalueToTrees(treesToYValue(trees))', () => {
  it('preserves a flat tree', () => {
    const original = [node('trip', { budget: 5000, dest: 'Tokyo' })];
    const result = yvalueToTrees(treesToYValue(original));
    expect(result).toEqual([node('trip', { budget: 5000, dest: 'Tokyo' })]);
  });

  it('preserves nested children', () => {
    const original = [node('trip', { budget: 5000 }, [node('dining', { style: 'casual' })])];
    const result = yvalueToTrees(treesToYValue(original));
    expect(result).toEqual(original);
  });

  it('preserves multiple root trees', () => {
    const original = [node('trip', { dest: 'Rome' }), node('budget', { total: 2000 })];
    const result = yvalueToTrees(treesToYValue(original));
    expect(result).toEqual(original);
  });

  it('preserves deeply nested structure', () => {
    const original = [
      node('project', {}, [node('phase1', { duration: '2w' }, [node('task', { owner: 'alice' })])]),
    ];
    const result = yvalueToTrees(treesToYValue(original));
    expect(result).toEqual(original);
  });

  it('preserves array-valued slots', () => {
    const original = [node('pref', { colors: ['red', 'blue', 'green'] })];
    const result = yvalueToTrees(treesToYValue(original));
    expect(result).toEqual(original);
  });

  it('preserves boolean and number slots', () => {
    const original = [node('settings', { enabled: true, retries: 3 })];
    const result = yvalueToTrees(treesToYValue(original));
    expect(result).toEqual(original);
  });

  it('round-trip preserves key/slots/children only', () => {
    const original = [node('trip', { budget: 5000 })];
    const result = yvalueToTrees(treesToYValue(original));
    expect(result[0].key).toBe('trip');
    expect(result[0].slots).toEqual({ budget: 5000 });
    expect(result[0]).not.toHaveProperty('slot_quotes');
    expect(result[0]).not.toHaveProperty('source');
  });

  it('handles empty trees array', () => {
    expect(yvalueToTrees(treesToYValue([]))).toEqual([]);
  });
});
