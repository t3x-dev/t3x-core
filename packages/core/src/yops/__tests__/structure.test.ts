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

// ── define + populate ──

describe('define + populate', () => {
  it('creates a root node', () => {
    const content = sc([]);
    const result = applyYOps(content, [
      { define: { parent: '', key: 'trip' } },
      { populate: { path: 'trip', slots: { budget: 2000 }, source: { budget: 'about 2000' }, from: 'T1' } },
    ]);
    expect(result.ok).toBe(true);
    expect(result.trees).toHaveLength(1);
    expect(result.trees[0].key).toBe('trip');
    expect(result.trees[0].slots.budget).toBe(2000);
  });

  it('creates a child node under existing parent', () => {
    const content = sc([t('trip', { name: 'Hangzhou' })]);
    const result = applyYOps(content, [
      { define: { parent: 'trip', key: 'dining' } },
      { populate: { path: 'trip/dining', slots: { budget: 500 }, source: { budget: 'about 500' }, from: 'T2' } },
    ]);
    expect(result.ok).toBe(true);
    expect(result.trees[0].children).toHaveLength(1);
    expect(result.trees[0].children[0].key).toBe('dining');
    expect(result.trees[0].children[0].slots.budget).toBe(500);
  });

  it('rejects duplicate root key', () => {
    const content = sc([t('trip', {})]);
    const result = applyYOps(content, [
      { define: { parent: '', key: 'trip' } },
    ]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('DUPLICATE_KEY');
  });

  it('rejects duplicate sibling key', () => {
    const content = sc([t('trip', {}, [t('dining', {})])]);
    const result = applyYOps(content, [
      { define: { parent: 'trip', key: 'dining' } },
    ]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('DUPLICATE_KEY');
  });

  it('rejects missing parent (PARENT_NOT_FOUND)', () => {
    const content = sc([t('trip', {})]);
    const result = applyYOps(content, [
      { define: { parent: 'nonexistent', key: 'x' } },
    ]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('PARENT_NOT_FOUND');
  });

  it('rejects invalid key (uppercase)', () => {
    const content = sc([]);
    const result = applyYOps(content, [
      { define: { parent: '', key: 'BadKey' } },
    ]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('INVALID_KEY');
  });

  it('attaches source, from, and confidence metadata via populate', () => {
    const content = sc([]);
    const result = applyYOps(content, [
      { define: { parent: '', key: 'trip' } },
      {
        populate: {
          path: 'trip',
          slots: { budget: 2000 },
          source: { budget: 'about 2000' },
          from: 'T3',
          confidence: 0.9,
        },
      },
    ]);
    expect(result.ok).toBe(true);
    expect(result.trees[0].slot_quotes?.budget).toBe('about 2000');
    expect(result.trees[0].source).toBe('T3');
    expect(result.trees[0].confidence).toBe(0.9);
  });

  it('creates node with nested children via separate define+populate', () => {
    const content = sc([]);
    const result = applyYOps(content, [
      { define: { parent: '', key: 'trip' } },
      { populate: { path: 'trip', slots: { budget: 2000 }, source: { budget: 'about 2000' }, from: 'T1' } },
      { define: { parent: 'trip', key: 'dining' } },
      { populate: { path: 'trip/dining', slots: { style: 'casual' }, source: {}, from: 'T1' } },
    ]);
    expect(result.ok).toBe(true);
    expect(result.trees[0].children).toHaveLength(1);
    expect(result.trees[0].children[0].key).toBe('dining');
    expect(result.trees[0].children[0].slots.style).toBe('casual');
  });
});

// ── drop ──

describe('drop', () => {
  it('removes node and its children', () => {
    const content = sc([
      t('trip', {}, [t('dining', {}, [t('restaurant', { name: 'Sushi' })]), t('transport', {})]),
    ]);
    const result = applyYOps(content, [{ drop: { path: 'trip/dining' } }]);
    expect(result.ok).toBe(true);
    expect(result.trees[0].children).toHaveLength(1);
    expect(result.trees[0].children[0].key).toBe('transport');
  });

  it('cleans up relations referencing dropped node', () => {
    const content = sc(
      [t('trip', {}, [t('dining', {}), t('budget', {})])],
      [
        { from: 'trip/dining', to: 'trip/budget', type: 'depends' },
        { from: 'trip/budget', to: 'trip/dining', type: 'causes' },
      ],
    );
    const result = applyYOps(content, [{ drop: { path: 'trip/dining' } }]);
    expect(result.ok).toBe(true);
    expect(result.relations).toHaveLength(0);
  });

  it('cleans up relations referencing children of dropped node', () => {
    const content = sc(
      [t('trip', {}, [t('dining', {}, [t('restaurant', {})]), t('budget', {})])],
      [{ from: 'trip/dining/restaurant', to: 'trip/budget', type: 'depends' }],
    );
    const result = applyYOps(content, [{ drop: { path: 'trip/dining' } }]);
    expect(result.ok).toBe(true);
    expect(result.relations).toHaveLength(0);
  });

  it('fails on missing node', () => {
    const content = sc([t('trip', {})]);
    const result = applyYOps(content, [{ drop: { path: 'nonexistent' } }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NODE_NOT_FOUND');
  });

  it('can drop a root tree', () => {
    const content = sc([t('trip', {}), t('hotel', {})]);
    const result = applyYOps(content, [{ drop: { path: 'trip' } }]);
    expect(result.ok).toBe(true);
    expect(result.trees).toHaveLength(1);
    expect(result.trees[0].key).toBe('hotel');
  });
});

// ── rename ──

describe('rename', () => {
  it('changes the key of a node', () => {
    const content = sc([t('trip', {}, [t('food', { budget: 500 })])]);
    const result = applyYOps(content, [{ rename: { path: 'trip/food', to: 'dining' } }]);
    expect(result.ok).toBe(true);
    expect(result.trees[0].children[0].key).toBe('dining');
    expect(result.trees[0].children[0].slots.budget).toBe(500);
  });

  it('updates relations when node is renamed', () => {
    const content = sc(
      [t('trip', {}, [t('food', {}), t('budget', {})])],
      [{ from: 'trip/food', to: 'trip/budget', type: 'depends' }],
    );
    const result = applyYOps(content, [{ rename: { path: 'trip/food', to: 'dining' } }]);
    expect(result.ok).toBe(true);
    expect(result.relations[0].from).toBe('trip/dining');
    expect(result.relations[0].to).toBe('trip/budget');
  });

  it('updates relations with child paths when parent is renamed', () => {
    const content = sc(
      [t('trip', {}, [t('food', {}, [t('restaurant', {})])])],
      [{ from: 'trip/food/restaurant', to: 'trip', type: 'depends' }],
    );
    const result = applyYOps(content, [{ rename: { path: 'trip/food', to: 'dining' } }]);
    expect(result.ok).toBe(true);
    expect(result.relations[0].from).toBe('trip/dining/restaurant');
  });

  it('renames root node', () => {
    const content = sc([t('trip', { budget: 1000 })]);
    const result = applyYOps(content, [{ rename: { path: 'trip', to: 'vacation' } }]);
    expect(result.ok).toBe(true);
    expect(result.trees[0].key).toBe('vacation');
    expect(result.trees[0].slots.budget).toBe(1000);
  });

  it('rejects duplicate sibling key', () => {
    const content = sc([t('trip', {}, [t('food', {}), t('dining', {})])]);
    const result = applyYOps(content, [{ rename: { path: 'trip/food', to: 'dining' } }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('DUPLICATE_KEY');
  });

  it('rejects duplicate root key', () => {
    const content = sc([t('trip', {}), t('hotel', {})]);
    const result = applyYOps(content, [{ rename: { path: 'trip', to: 'hotel' } }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('DUPLICATE_KEY');
  });

  it('rejects invalid key', () => {
    const content = sc([t('trip', {})]);
    const result = applyYOps(content, [{ rename: { path: 'trip', to: 'Bad-Key' } }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('INVALID_KEY');
  });

  it('fails on missing node', () => {
    const content = sc([t('trip', {})]);
    const result = applyYOps(content, [{ rename: { path: 'nonexistent', to: 'x' } }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NODE_NOT_FOUND');
  });
});

// ── clone ──

describe('clone', () => {
  it('creates an independent copy under target parent', () => {
    const content = sc([
      t('trip', {}, [t('dining', { budget: 500 })]),
      t('reference', {}),
    ]);
    const result = applyYOps(content, [{ clone: { path: 'trip/dining', to: 'reference' } }]);
    expect(result.ok).toBe(true);
    const refChildren = result.trees[1].children;
    expect(refChildren).toHaveLength(1);
    expect(refChildren[0].key).toBe('dining');
    expect(refChildren[0].slots.budget).toBe(500);
    // Verify independence
    refChildren[0].slots.budget = 999;
    expect(result.trees[0].children[0].slots.budget).toBe(500);
  });

  it('clones to root level', () => {
    const content = sc([t('trip', {}, [t('dining', { budget: 500 })])]);
    const result = applyYOps(content, [{ clone: { path: 'trip/dining', to: '' } }]);
    expect(result.ok).toBe(true);
    expect(result.trees).toHaveLength(2);
    expect(result.trees[1].key).toBe('dining');
    expect(result.trees[1].slots.budget).toBe(500);
  });

  it('preserves metadata (confidence, source, slot_quotes)', () => {
    const node: TreeNode = {
      key: 'dining',
      slots: { budget: 500 },
      children: [],
      slot_quotes: { budget: 'about 500' },
      source: 'T2',
      confidence: 0.85,
    };
    const content = sc([t('trip', {}, [node]), t('ref', {})]);
    const result = applyYOps(content, [{ clone: { path: 'trip/dining', to: 'ref' } }]);
    expect(result.ok).toBe(true);
    const cloned = result.trees[1].children[0];
    expect(cloned.slot_quotes?.budget).toBe('about 500');
    expect(cloned.source).toBe('T2');
    expect(cloned.confidence).toBe(0.85);
  });

  it('preserves deep children', () => {
    const content = sc([
      t('trip', {}, [t('dining', {}, [t('restaurant', { name: 'Sushi' })])]),
      t('ref', {}),
    ]);
    const result = applyYOps(content, [{ clone: { path: 'trip/dining', to: 'ref' } }]);
    expect(result.ok).toBe(true);
    expect(result.trees[1].children[0].children[0].key).toBe('restaurant');
    expect(result.trees[1].children[0].children[0].slots.name).toBe('Sushi');
  });

  it('rejects missing source', () => {
    const content = sc([t('trip', {})]);
    const result = applyYOps(content, [{ clone: { path: 'nonexistent', to: '' } }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NODE_NOT_FOUND');
  });

  it('rejects duplicate at target (root)', () => {
    const content = sc([t('trip', {}), t('dining', {})]);
    // trip has no child named dining, but root already has "dining"
    // clone trip to root => duplicate root key "trip"
    const result = applyYOps(content, [{ clone: { path: 'trip', to: '' } }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('DUPLICATE_KEY');
  });

  it('rejects duplicate at target (sibling)', () => {
    const content = sc([
      t('trip', {}, [t('dining', { budget: 500 })]),
      t('ref', {}, [t('dining', {})]),
    ]);
    const result = applyYOps(content, [{ clone: { path: 'trip/dining', to: 'ref' } }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('DUPLICATE_KEY');
  });

  it('rejects missing target parent', () => {
    const content = sc([t('trip', {}, [t('dining', {})])]);
    const result = applyYOps(content, [{ clone: { path: 'trip/dining', to: 'nonexistent' } }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('PARENT_NOT_FOUND');
  });
});
