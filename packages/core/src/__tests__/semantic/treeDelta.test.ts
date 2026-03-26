import { describe, expect, it } from 'vitest';
import { applyDelta } from '../../semantic/delta';
import type { SemanticContent, TreeNode } from '../../semantic/types';

function makeTreeContent(tree: TreeNode): SemanticContent {
  return { trees: [tree], relations: [] };
}

describe('applyDelta (tree operations)', () => {
  const baseTree: TreeNode = {
    key: 'hangzhou_trip',
    slots: { destination: 'Hangzhou', dates: 'May 1-3' },
    children: [{ key: 'dining', slots: { cuisine: 'local', budget: 500 }, children: [] }],
  };

  it('adds a new child node', () => {
    const delta = {
      changes: [
        {
          action: 'add' as const,
          parent_path: 'hangzhou_trip',
          node: { key: 'transportation', slots: { mode: 'rail', duration: '1.5h' }, children: [] as TreeNode[] },
        },
      ],
    };
    const result = applyDelta(makeTreeContent(baseTree), delta);
    expect(result.trees[0].children).toHaveLength(2);
    expect(result.trees[0].children[1].key).toBe('transportation');
    expect(result.trees[0].children[1].slots).toEqual({ mode: 'rail', duration: '1.5h' });
  });

  it('updates a slot value', () => {
    const delta = {
      changes: [
        {
          action: 'update' as const,
          target_path: 'hangzhou_trip/dining',
          slots: { budget: 800 },
        },
      ],
    };
    const result = applyDelta(makeTreeContent(baseTree), delta);
    expect(result.trees[0].children[0].slots.budget).toBe(800);
    expect(result.trees[0].children[0].slots.cuisine).toBe('local');
  });

  it('removes a slot with null', () => {
    const delta = {
      changes: [
        {
          action: 'update' as const,
          target_path: 'hangzhou_trip/dining',
          slots: { budget: null },
        },
      ],
    };
    const result = applyDelta(makeTreeContent(baseTree), delta);
    expect(result.trees[0].children[0].slots.budget).toBeUndefined();
    expect(result.trees[0].children[0].slots.cuisine).toBe('local');
  });

  it('removes a node and its children', () => {
    const delta = {
      changes: [{ action: 'remove' as const, target_path: 'hangzhou_trip/dining' }],
    };
    const result = applyDelta(makeTreeContent(baseTree), delta);
    expect(result.trees[0].children).toHaveLength(0);
  });

  it('updates root slot', () => {
    const delta = {
      changes: [
        {
          action: 'update' as const,
          target_path: 'hangzhou_trip',
          slots: { dates: 'May 2-4' },
        },
      ],
    };
    const result = applyDelta(makeTreeContent(baseTree), delta);
    expect(result.trees[0].slots.dates).toBe('May 2-4');
    expect(result.trees[0].slots.destination).toBe('Hangzhou');
  });

  it('merges slot_quotes on update', () => {
    const treeWithQuotes: TreeNode = {
      ...baseTree,
      children: [{ ...baseTree.children[0], slot_quotes: { cuisine: 'local food' } }],
    };
    const delta = {
      changes: [
        {
          action: 'update' as const,
          target_path: 'hangzhou_trip/dining',
          slots: { budget: 800 },
          slot_quotes: { 'dining.budget': 'budget to 800' },
        },
      ],
    };
    const result = applyDelta(makeTreeContent(treeWithQuotes), delta);
    expect(result.trees[0].children[0].slot_quotes?.cuisine).toBe('local food');
    expect(result.trees[0].children[0].slot_quotes?.budget).toBe('budget to 800');
  });
});
