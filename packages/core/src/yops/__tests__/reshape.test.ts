import { describe, expect, it } from 'vitest';
import type { SemanticContent, TreeNode } from '../../semantic/types';
import { applyYOps } from '../engine';

// ── Test Helpers ──

const t = (
  key: string,
  slots: Record<string, unknown> = {},
  children: TreeNode[] = [],
): TreeNode => ({
  key,
  slots: slots as TreeNode['slots'],
  children,
});

const sc = (
  trees: TreeNode[],
  relations: SemanticContent['relations'] = [],
): SemanticContent => ({
  trees,
  relations,
});

// ── move ──

describe('move', () => {
  it('relocates subtree to a new parent', () => {
    const content = sc([
      t('trip', {}, [t('dining', { budget: 500 }), t('activities', {})]),
    ]);
    const result = applyYOps(content, [
      { move: { path: 'trip/dining', to: 'trip/activities/dining' } },
    ]);
    expect(result.ok).toBe(true);
    expect(result.trees[0].children).toHaveLength(1);
    expect(result.trees[0].children[0].key).toBe('activities');
    expect(result.trees[0].children[0].children[0].key).toBe('dining');
    expect(result.trees[0].children[0].children[0].slots.budget).toBe(500);
  });

  it('updates relations when moving', () => {
    const content = sc(
      [t('trip', {}, [t('dining', {}), t('budget', {}), t('food', {})])],
      [{ from: 'trip/dining', to: 'trip/budget', type: 'depends' }],
    );
    const result = applyYOps(content, [
      { move: { path: 'trip/dining', to: 'trip/food/dining' } },
    ]);
    expect(result.ok).toBe(true);
    expect(result.relations[0].from).toBe('trip/food/dining');
    expect(result.relations[0].to).toBe('trip/budget');
  });

  it('moves node to root level', () => {
    const content = sc([t('trip', {}, [t('dining', { budget: 500 })])]);
    const result = applyYOps(content, [
      { move: { path: 'trip/dining', to: 'dining' } },
    ]);
    expect(result.ok).toBe(true);
    expect(result.trees).toHaveLength(2);
    expect(result.trees[0].children).toHaveLength(0);
    expect(result.trees[1].key).toBe('dining');
  });

  it('prevents cycle (move into own subtree)', () => {
    const content = sc([t('trip', {}, [t('dining', {}, [t('sub', {})])])]);
    const result = applyYOps(content, [
      { move: { path: 'trip/dining', to: 'trip/dining/sub/dining' } },
    ]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('CYCLE_DETECTED');
  });

  it('prevents move to self', () => {
    const content = sc([t('trip', {}, [t('dining', {})])]);
    const result = applyYOps(content, [
      { move: { path: 'trip/dining', to: 'trip/dining' } },
    ]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('CYCLE_DETECTED');
  });

  it('fails on missing source', () => {
    const content = sc([t('trip', {})]);
    const result = applyYOps(content, [
      { move: { path: 'trip/nonexistent', to: 'trip/x' } },
    ]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NODE_NOT_FOUND');
  });

  it('fails on missing target parent', () => {
    const content = sc([t('trip', {}, [t('dining', {})])]);
    const result = applyYOps(content, [
      { move: { path: 'trip/dining', to: 'nonexistent/dining' } },
    ]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('PARENT_NOT_FOUND');
  });

  it('rejects duplicate key at target', () => {
    const content = sc([
      t('trip', {}, [t('dining', { budget: 500 })]),
      t('hotel', {}, [t('dining', {})]),
    ]);
    const result = applyYOps(content, [
      { move: { path: 'trip/dining', to: 'hotel/dining' } },
    ]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('DUPLICATE_KEY');
  });

  it('can rename node during move', () => {
    const content = sc([t('trip', {}, [t('food', { budget: 500 }), t('activities', {})])]);
    const result = applyYOps(content, [
      { move: { path: 'trip/food', to: 'trip/activities/dining' } },
    ]);
    expect(result.ok).toBe(true);
    expect(result.trees[0].children[0].children[0].key).toBe('dining');
    expect(result.trees[0].children[0].children[0].slots.budget).toBe(500);
  });
});

// ── nest ──

describe('nest', () => {
  it('groups siblings under new parent', () => {
    const content = sc([
      t('trip', {}, [t('dining', { budget: 500 }), t('transport', { mode: 'train' }), t('hotel', {})]),
    ]);
    const result = applyYOps(content, [
      { nest: { paths: ['trip/dining', 'trip/transport'], under: 'logistics' } },
    ]);
    expect(result.ok).toBe(true);
    // hotel stays, logistics is added
    const children = result.trees[0].children;
    expect(children).toHaveLength(2);
    const logistics = children.find((c) => c.key === 'logistics');
    expect(logistics).toBeDefined();
    expect(logistics!.children).toHaveLength(2);
    expect(logistics!.children.map((c) => c.key).sort()).toEqual(['dining', 'transport']);
  });

  it('groups root-level nodes under new root wrapper', () => {
    const content = sc([t('dining', {}), t('transport', {}), t('hotel', {})]);
    const result = applyYOps(content, [
      { nest: { paths: ['dining', 'transport'], under: 'logistics' } },
    ]);
    expect(result.ok).toBe(true);
    expect(result.trees).toHaveLength(2); // hotel + logistics
    const logistics = result.trees.find((t) => t.key === 'logistics');
    expect(logistics).toBeDefined();
    expect(logistics!.children).toHaveLength(2);
  });

  it('updates relations with new paths', () => {
    const content = sc(
      [t('trip', {}, [t('dining', {}), t('transport', {}), t('budget', {})])],
      [{ from: 'trip/dining', to: 'trip/budget', type: 'depends' }],
    );
    const result = applyYOps(content, [
      { nest: { paths: ['trip/dining', 'trip/transport'], under: 'logistics' } },
    ]);
    expect(result.ok).toBe(true);
    expect(result.relations[0].from).toBe('trip/logistics/dining');
    expect(result.relations[0].to).toBe('trip/budget');
  });

  it('rejects non-siblings (different parents)', () => {
    const content = sc([
      t('trip', {}, [t('dining', {}), t('sub', {}, [t('transport', {})])]),
    ]);
    const result = applyYOps(content, [
      { nest: { paths: ['trip/dining', 'trip/sub/transport'], under: 'group' } },
    ]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NOT_SIBLINGS');
  });

  it('rejects existing key conflict', () => {
    const content = sc([
      t('trip', {}, [t('dining', {}), t('transport', {}), t('logistics', {})]),
    ]);
    const result = applyYOps(content, [
      { nest: { paths: ['trip/dining', 'trip/transport'], under: 'logistics' } },
    ]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('DUPLICATE_KEY');
  });

  it('rejects invalid wrapper key', () => {
    const content = sc([t('trip', {}, [t('dining', {}), t('transport', {})])]);
    const result = applyYOps(content, [
      { nest: { paths: ['trip/dining', 'trip/transport'], under: 'Bad-Key' } },
    ]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('INVALID_KEY');
  });
});

// ── split ──

describe('split', () => {
  it('distributes slots to new children', () => {
    const content = sc([
      t('trip', { budget: 2000, style: 'casual', duration: 7 }),
    ]);
    const result = applyYOps(content, [
      { split: { path: 'trip', into: { finance: ['budget'], preferences: ['style'] } } },
    ]);
    expect(result.ok).toBe(true);
    const trip = result.trees[0];
    // Distributed slots removed from parent
    expect(trip.slots.budget).toBeUndefined();
    expect(trip.slots.style).toBeUndefined();
    // Unlisted slot stays
    expect(trip.slots.duration).toBe(7);
    // Children created
    expect(trip.children).toHaveLength(2);
    const finance = trip.children.find((c) => c.key === 'finance');
    const preferences = trip.children.find((c) => c.key === 'preferences');
    expect(finance?.slots.budget).toBe(2000);
    expect(preferences?.slots.style).toBe('casual');
  });

  it('slot_quotes follow their slots to children', () => {
    const node: TreeNode = {
      key: 'trip',
      slots: { budget: 2000, style: 'casual' },
      children: [],
      slot_quotes: { budget: 'about 2000', style: 'keep it casual' },
    };
    const content = sc([node]);
    const result = applyYOps(content, [
      { split: { path: 'trip', into: { finance: ['budget'], preferences: ['style'] } } },
    ]);
    expect(result.ok).toBe(true);
    const finance = result.trees[0].children.find((c) => c.key === 'finance');
    const prefs = result.trees[0].children.find((c) => c.key === 'preferences');
    expect(finance?.slot_quotes?.budget).toBe('about 2000');
    expect(prefs?.slot_quotes?.style).toBe('keep it casual');
    // Parent quotes cleaned
    expect(result.trees[0].slot_quotes?.budget).toBeUndefined();
    expect(result.trees[0].slot_quotes?.style).toBeUndefined();
  });

  it('unlisted slots stay on parent', () => {
    const content = sc([
      t('trip', { budget: 2000, style: 'casual', name: 'Hangzhou' }),
    ]);
    const result = applyYOps(content, [
      { split: { path: 'trip', into: { finance: ['budget'] } } },
    ]);
    expect(result.ok).toBe(true);
    expect(result.trees[0].slots.style).toBe('casual');
    expect(result.trees[0].slots.name).toBe('Hangzhou');
  });

  it('rejects missing slot', () => {
    const content = sc([t('trip', { budget: 2000 })]);
    const result = applyYOps(content, [
      { split: { path: 'trip', into: { finance: ['budget', 'nonexistent'] } } },
    ]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('SLOT_NOT_FOUND');
  });

  it('rejects duplicate slot assignment across children', () => {
    const content = sc([t('trip', { budget: 2000, style: 'casual' })]);
    const result = applyYOps(content, [
      { split: { path: 'trip', into: { finance: ['budget'], other: ['budget'] } } },
    ]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('DUPLICATE_SLOT');
  });

  it('rejects when child key conflicts with existing child', () => {
    const content = sc([
      t('trip', { budget: 2000 }, [t('finance', {})]),
    ]);
    const result = applyYOps(content, [
      { split: { path: 'trip', into: { finance: ['budget'] } } },
    ]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('DUPLICATE_KEY');
  });

  it('fails on missing node', () => {
    const content = sc([t('trip', {})]);
    const result = applyYOps(content, [
      { split: { path: 'nonexistent', into: { x: ['a'] } } },
    ]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NODE_NOT_FOUND');
  });
});

// ── fold ──

describe('fold', () => {
  it('promotes single child, removes wrapper', () => {
    const content = sc([
      t('trip', {}, [t('wrapper', {}, [t('dining', { budget: 500 })])]),
    ]);
    const result = applyYOps(content, [{ fold: { path: 'trip/wrapper' } }]);
    expect(result.ok).toBe(true);
    expect(result.trees[0].children).toHaveLength(1);
    expect(result.trees[0].children[0].key).toBe('dining');
    expect(result.trees[0].children[0].slots.budget).toBe(500);
  });

  it('folds root-level wrapper', () => {
    const content = sc([t('wrapper', {}, [t('trip', { budget: 2000 })])]);
    const result = applyYOps(content, [{ fold: { path: 'wrapper' } }]);
    expect(result.ok).toBe(true);
    expect(result.trees).toHaveLength(1);
    expect(result.trees[0].key).toBe('trip');
    expect(result.trees[0].slots.budget).toBe(2000);
  });

  it('updates relations: child path shortened', () => {
    const content = sc(
      [t('trip', {}, [t('wrapper', {}, [t('dining', {})])]), t('budget', {})],
      [{ from: 'trip/wrapper/dining', to: 'budget', type: 'depends' }],
    );
    const result = applyYOps(content, [{ fold: { path: 'trip/wrapper' } }]);
    expect(result.ok).toBe(true);
    expect(result.relations[0].from).toBe('trip/dining');
  });

  it('removes dangling relations referencing folded wrapper', () => {
    const content = sc(
      [t('trip', {}, [t('wrapper', {}, [t('dining', {})])]), t('budget', {})],
      [{ from: 'trip/wrapper', to: 'budget', type: 'depends' }],
    );
    const result = applyYOps(content, [{ fold: { path: 'trip/wrapper' } }]);
    expect(result.ok).toBe(true);
    // The wrapper relation is cleaned up since wrapper no longer exists
    expect(result.relations).toHaveLength(0);
  });

  it('rejects node with slots', () => {
    const content = sc([
      t('trip', {}, [t('wrapper', { style: 'casual' }, [t('dining', {})])]),
    ]);
    const result = applyYOps(content, [{ fold: { path: 'trip/wrapper' } }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NOT_FOLDABLE');
  });

  it('rejects node with multiple children', () => {
    const content = sc([
      t('trip', {}, [t('wrapper', {}, [t('dining', {}), t('transport', {})])]),
    ]);
    const result = applyYOps(content, [{ fold: { path: 'trip/wrapper' } }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NOT_FOLDABLE');
  });

  it('rejects node with no children', () => {
    const content = sc([t('trip', {}, [t('wrapper', {})])]);
    const result = applyYOps(content, [{ fold: { path: 'trip/wrapper' } }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NOT_FOLDABLE');
  });

  it('fails on missing node', () => {
    const content = sc([t('trip', {})]);
    const result = applyYOps(content, [{ fold: { path: 'nonexistent' } }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NODE_NOT_FOUND');
  });
});

// ── merge ──

describe('merge', () => {
  it('combines slots from siblings (last wins)', () => {
    const content = sc([
      t('trip', {}, [
        t('food', { budget: 500, style: 'casual' }),
        t('dining', { budget: 800, cuisine: 'japanese' }),
      ]),
    ]);
    const result = applyYOps(content, [
      { merge: { paths: ['trip/food', 'trip/dining'], into: 'eating' } },
    ]);
    expect(result.ok).toBe(true);
    const children = result.trees[0].children;
    expect(children).toHaveLength(1);
    expect(children[0].key).toBe('eating');
    // last wins: dining's budget=800 overwrites food's budget=500
    expect(children[0].slots.budget).toBe(800);
    expect(children[0].slots.style).toBe('casual');
    expect(children[0].slots.cuisine).toBe('japanese');
  });

  it('combines children (last wins on key conflict)', () => {
    const content = sc([
      t('trip', {}, [
        t('a', {}, [t('sub', { x: 1 })]),
        t('b', {}, [t('sub', { x: 2 }), t('extra', {})]),
      ]),
    ]);
    const result = applyYOps(content, [
      { merge: { paths: ['trip/a', 'trip/b'], into: 'merged' } },
    ]);
    expect(result.ok).toBe(true);
    const merged = result.trees[0].children[0];
    expect(merged.key).toBe('merged');
    // sub from b (last) wins
    const sub = merged.children.find((c) => c.key === 'sub');
    expect(sub?.slots.x).toBe(2);
    // extra from b is also present
    expect(merged.children.find((c) => c.key === 'extra')).toBeDefined();
  });

  it('uses min confidence', () => {
    const nodeA: TreeNode = { key: 'a', slots: {}, children: [], confidence: 0.9 };
    const nodeB: TreeNode = { key: 'b', slots: {}, children: [], confidence: 0.7 };
    const content = sc([t('trip', {}, [nodeA, nodeB])]);
    const result = applyYOps(content, [
      { merge: { paths: ['trip/a', 'trip/b'], into: 'merged' } },
    ]);
    expect(result.ok).toBe(true);
    expect(result.trees[0].children[0].confidence).toBe(0.7);
  });

  it('updates relations to point to merged node', () => {
    const content = sc(
      [t('trip', {}, [t('a', {}), t('b', {}), t('budget', {})])],
      [
        { from: 'trip/a', to: 'trip/budget', type: 'depends' },
        { from: 'trip/b', to: 'trip/budget', type: 'causes' },
      ],
    );
    const result = applyYOps(content, [
      { merge: { paths: ['trip/a', 'trip/b'], into: 'merged' } },
    ]);
    expect(result.ok).toBe(true);
    expect(result.relations[0].from).toBe('trip/merged');
    expect(result.relations[1].from).toBe('trip/merged');
  });

  it('merges at root level', () => {
    const content = sc([t('a', { x: 1 }), t('b', { y: 2 }), t('other', {})]);
    const result = applyYOps(content, [
      { merge: { paths: ['a', 'b'], into: 'combined' } },
    ]);
    expect(result.ok).toBe(true);
    expect(result.trees).toHaveLength(2); // other + combined
    const combined = result.trees.find((t) => t.key === 'combined');
    expect(combined?.slots.x).toBe(1);
    expect(combined?.slots.y).toBe(2);
  });

  it('rejects non-siblings', () => {
    const content = sc([
      t('trip', {}, [t('a', {}), t('sub', {}, [t('b', {})])]),
    ]);
    const result = applyYOps(content, [
      { merge: { paths: ['trip/a', 'trip/sub/b'], into: 'merged' } },
    ]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NOT_SIBLINGS');
  });

  it('rejects invalid into key', () => {
    const content = sc([t('trip', {}, [t('a', {}), t('b', {})])]);
    const result = applyYOps(content, [
      { merge: { paths: ['trip/a', 'trip/b'], into: 'Bad-Key' } },
    ]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('INVALID_KEY');
  });

  it('fails on missing node', () => {
    const content = sc([t('trip', {}, [t('a', {})])]);
    const result = applyYOps(content, [
      { merge: { paths: ['trip/a', 'trip/nonexistent'], into: 'merged' } },
    ]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NODE_NOT_FOUND');
  });

  it('combines slot_quotes from both nodes', () => {
    const nodeA: TreeNode = {
      key: 'a',
      slots: { budget: 500 },
      children: [],
      slot_quotes: { budget: 'about 500' },
    };
    const nodeB: TreeNode = {
      key: 'b',
      slots: { style: 'casual' },
      children: [],
      slot_quotes: { style: 'keep it casual' },
    };
    const content = sc([t('trip', {}, [nodeA, nodeB])]);
    const result = applyYOps(content, [
      { merge: { paths: ['trip/a', 'trip/b'], into: 'merged' } },
    ]);
    expect(result.ok).toBe(true);
    const merged = result.trees[0].children[0];
    expect(merged.slot_quotes?.budget).toBe('about 500');
    expect(merged.slot_quotes?.style).toBe('keep it casual');
  });
});
