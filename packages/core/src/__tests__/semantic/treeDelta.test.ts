import { describe, expect, it } from 'vitest';
import { applyTreeDelta } from '../../semantic/delta';
import { flattenTree } from '../../semantic/tree';
import type { SemanticContent, TreeNode } from '../../semantic/types';

function makeTreeContent(tree: TreeNode): SemanticContent {
  return { tree, frames: flattenTree(tree), relations: [] };
}

describe('applyTreeDelta', () => {
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
          node: { transportation: { mode: 'rail', duration: '1.5h' } },
        },
      ],
    };
    const result = applyTreeDelta(makeTreeContent(baseTree), delta);
    expect(result.tree!.children).toHaveLength(2);
    expect(result.tree!.children[1].key).toBe('transportation');
    expect(result.tree!.children[1].slots).toEqual({ mode: 'rail', duration: '1.5h' });
    expect(result.frames.find((f) => f.id === 'hangzhou_trip/transportation')).toBeDefined();
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
    const result = applyTreeDelta(makeTreeContent(baseTree), delta);
    expect(result.tree!.children[0].slots.budget).toBe(800);
    expect(result.tree!.children[0].slots.cuisine).toBe('local');
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
    const result = applyTreeDelta(makeTreeContent(baseTree), delta);
    expect(result.tree!.children[0].slots.budget).toBeUndefined();
    expect(result.tree!.children[0].slots.cuisine).toBe('local');
  });

  it('removes a node and its children', () => {
    const delta = {
      changes: [{ action: 'remove' as const, target_path: 'hangzhou_trip/dining' }],
    };
    const result = applyTreeDelta(makeTreeContent(baseTree), delta);
    expect(result.tree!.children).toHaveLength(0);
    expect(result.frames.find((f) => f.id === 'hangzhou_trip/dining')).toBeUndefined();
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
    const result = applyTreeDelta(makeTreeContent(baseTree), delta);
    expect(result.tree!.slots.dates).toBe('May 2-4');
    expect(result.tree!.slots.destination).toBe('Hangzhou');
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
    const result = applyTreeDelta(makeTreeContent(treeWithQuotes), delta);
    expect(result.tree!.children[0].slot_quotes?.cuisine).toBe('local food');
    expect(result.tree!.children[0].slot_quotes?.budget).toBe('budget to 800');
  });
});
