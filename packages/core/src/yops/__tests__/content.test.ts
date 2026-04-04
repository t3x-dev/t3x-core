import { describe, expect, it } from 'vitest';
import type { Relation, SemanticContent, TreeNode } from '../../semantic/types';
import { applyYOps } from '../engine';
import { YOpSchema, YOpsDocumentSchema } from '../schema';
import type { YOp, YOpsResult } from '../types';

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

// ── Type Shape Tests ──

describe('YOp type shapes', () => {
  it('set op has correct shape', () => {
    const op: YOp = {
      set: { path: 'trip/budget', value: 2000, source: 'about 2000', from: 'T3' },
    };
    expect(op).toBeDefined();
    expect('set' in op).toBe(true);
  });

  it('all 14 ops can be constructed', () => {
    const ops: YOp[] = [
      { set: { path: 'a/b', value: 1, source: 'q', from: 'T1' } },
      { unset: { path: 'a/b' } },
      { define: { parent: '', key: 'x' } },
      { populate: { path: 'x', slots: { v: 1 }, source: { v: 'q' }, from: 'T1' } },
      { drop: { path: 'a' } },
      { rename: { path: 'a', to: 'b' } },
      { clone: { path: 'a', to: '' } },
      { move: { path: 'a', to: 'b/a' } },
      { nest: { paths: ['a', 'b'], under: 'group' } },
      { split: { path: 'a', into: { x: ['s1'], y: ['s2'] } } },
      { fold: { path: 'a' } },
      { merge: { paths: ['a', 'b'], into: 'c' } },
      { relate: { from: 'a', to: 'b', type: 'causes' } },
      { unrelate: { from: 'a', to: 'b', type: 'causes' } },
    ];
    expect(ops).toHaveLength(14);
  });
});

describe('YOpsResult shape', () => {
  it('successful result has ok=true and applied count', () => {
    const result: YOpsResult = {
      ok: true,
      trees: [],
      relations: [],
      applied: 3,
    };
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(3);
    expect(result.error).toBeUndefined();
  });

  it('error result has ok=false and error details', () => {
    const result: YOpsResult = {
      ok: false,
      trees: [],
      relations: [],
      applied: 1,
      error: { code: 'NODE_NOT_FOUND', message: 'missing', op_index: 1 },
    };
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NODE_NOT_FOUND');
  });
});

// ── Schema Validation Tests ──

describe('YOpSchema validation', () => {
  it('validates set operation', () => {
    const r = YOpSchema.safeParse({
      set: { path: 'trip/budget', value: 2000, source: 'about 2000', from: 'T3' },
    });
    expect(r.success).toBe(true);
  });

  it('validates unset operation', () => {
    const r = YOpSchema.safeParse({ unset: { path: 'trip/budget' } });
    expect(r.success).toBe(true);
  });

  it('validates define operation', () => {
    const r = YOpSchema.safeParse({
      define: { parent: 'trip', key: 'dining' },
    });
    expect(r.success).toBe(true);
  });

  it('validates populate operation', () => {
    const r = YOpSchema.safeParse({
      populate: {
        path: 'trip/dining',
        slots: { budget: 1000 },
        source: { budget: 'about 1000' },
        from: 'T3',
      },
    });
    expect(r.success).toBe(true);
  });

  it('validates drop operation', () => {
    const r = YOpSchema.safeParse({ drop: { path: 'trip/shopping', reason: 'cancelled' } });
    expect(r.success).toBe(true);
  });

  it('validates rename operation', () => {
    const r = YOpSchema.safeParse({ rename: { path: 'trip/food', to: 'dining' } });
    expect(r.success).toBe(true);
  });

  it('validates clone operation', () => {
    const r = YOpSchema.safeParse({ clone: { path: 'trip/dining', to: 'reference' } });
    expect(r.success).toBe(true);
  });

  it('validates move operation', () => {
    const r = YOpSchema.safeParse({ move: { path: 'trip/dining', to: 'trip/food/dining' } });
    expect(r.success).toBe(true);
  });

  it('validates nest operation', () => {
    const r = YOpSchema.safeParse({
      nest: { paths: ['trip/budget', 'trip/schedule'], under: 'logistics' },
    });
    expect(r.success).toBe(true);
  });

  it('validates split operation', () => {
    const r = YOpSchema.safeParse({
      split: { path: 'trip/everything', into: { dining: ['budget'], transport: ['mode'] } },
    });
    expect(r.success).toBe(true);
  });

  it('validates fold operation', () => {
    const r = YOpSchema.safeParse({ fold: { path: 'trip/details' } });
    expect(r.success).toBe(true);
  });

  it('validates merge operation', () => {
    const r = YOpSchema.safeParse({
      merge: { paths: ['trip/food', 'trip/dining'], into: 'dining' },
    });
    expect(r.success).toBe(true);
  });

  it('validates relate operation', () => {
    const r = YOpSchema.safeParse({
      relate: { from: 'trip/dining', to: 'trip/budget', type: 'depends', confidence: 0.8 },
    });
    expect(r.success).toBe(true);
  });

  it('validates unrelate operation', () => {
    const r = YOpSchema.safeParse({
      unrelate: { from: 'trip/dining', to: 'trip/budget', type: 'depends' },
    });
    expect(r.success).toBe(true);
  });

  it('rejects set without source', () => {
    const r = YOpSchema.safeParse({
      set: { path: 'trip/budget', value: 2000 },
    });
    expect(r.success).toBe(false);
  });

  it('rejects unknown operation key', () => {
    const r = YOpSchema.safeParse({
      unknown_op: { path: 'trip/budget' },
    });
    expect(r.success).toBe(false);
  });

  it('rejects define with missing key', () => {
    const r = YOpSchema.safeParse({
      define: { parent: '' },
    });
    expect(r.success).toBe(false);
  });

  it('rejects merge with fewer than 2 paths', () => {
    const r = YOpSchema.safeParse({
      merge: { paths: ['trip/food'], into: 'dining' },
    });
    expect(r.success).toBe(false);
  });

  it('validates YOpsDocument', () => {
    const r = YOpsDocumentSchema.safeParse({
      yops: [
        { set: { path: 'trip/budget', value: 2000, source: 'about 2000', from: 'T3' } },
        { drop: { path: 'trip/shopping' } },
      ],
    });
    expect(r.success).toBe(true);
  });
});

// ── Engine Tests ──

describe('applyYOps', () => {
  describe('set', () => {
    it('creates a new slot with source quote', () => {
      const content = sc([t('trip', { name: 'Hangzhou' })]);
      const result = applyYOps(content, [
        { set: { path: 'trip/budget', value: 2000, source: 'about 2000', from: 'T3' } },
      ]);
      expect(result.ok).toBe(true);
      expect(result.applied).toBe(1);
      expect(result.trees[0].slots.budget).toBe(2000);
      expect(result.trees[0].slot_quotes?.budget).toBe('about 2000');
      expect(result.trees[0].source).toBe('T3');
    });

    it('overwrites existing slot', () => {
      const content = sc([t('trip', { budget: 1000 })]);
      const result = applyYOps(content, [
        { set: { path: 'trip/budget', value: 2000, source: 'updated to 2000', from: 'T5' } },
      ]);
      expect(result.ok).toBe(true);
      expect(result.trees[0].slots.budget).toBe(2000);
    });

    it('fails on non-existent node', () => {
      const content = sc([t('trip', {})]);
      const result = applyYOps(content, [
        { set: { path: 'missing/budget', value: 100, source: 'q', from: 'T1' } },
      ]);
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('NODE_NOT_FOUND');
      expect(result.applied).toBe(0);
    });

    it('sets slot on nested node', () => {
      const content = sc([t('trip', {}, [t('dining', { style: 'casual' })])]);
      const result = applyYOps(content, [
        { set: { path: 'trip/dining/budget', value: 500, source: 'about 500', from: 'T2' } },
      ]);
      expect(result.ok).toBe(true);
      expect(result.trees[0].children[0].slots.budget).toBe(500);
    });
  });

  describe('unset', () => {
    it('removes slot and quote', () => {
      const tree: TreeNode = {
        key: 'trip',
        slots: { budget: 1000, style: 'casual' },
        children: [],
        slot_quotes: { budget: 'about 1000', style: 'keep it casual' },
      };
      const content = sc([tree]);
      const result = applyYOps(content, [
        { unset: { path: 'trip/budget' } },
      ]);
      expect(result.ok).toBe(true);
      expect(result.trees[0].slots.budget).toBeUndefined();
      expect(result.trees[0].slot_quotes?.budget).toBeUndefined();
      expect(result.trees[0].slots.style).toBe('casual');
    });

    it('is no-op on missing slot', () => {
      const content = sc([t('trip', { budget: 1000 })]);
      const result = applyYOps(content, [
        { unset: { path: 'trip/nonexistent' } },
      ]);
      expect(result.ok).toBe(true);
      expect(result.applied).toBe(1);
      expect(result.trees[0].slots.budget).toBe(1000);
    });

    it('is no-op on missing node (idempotent)', () => {
      const content = sc([t('trip', { budget: 1000 })]);
      const result = applyYOps(content, [
        { unset: { path: 'nonexistent/slot' } },
      ]);
      expect(result.ok).toBe(true);
      expect(result.applied).toBe(1);
      // Original tree is untouched
      expect(result.trees[0].slots.budget).toBe(1000);
    });
  });

  describe('immutability', () => {
    it('does not mutate input', () => {
      const original = sc([t('trip', { budget: 1000 })]);
      const budgetBefore = original.trees[0].slots.budget;

      applyYOps(original, [
        { set: { path: 'trip/budget', value: 2000, source: 'q', from: 'T1' } },
      ]);

      expect(original.trees[0].slots.budget).toBe(budgetBefore);
      expect(original.trees[0].slot_quotes).toBeUndefined();
    });
  });

  describe('define + populate', () => {
    it('defines a new root node and populates it', () => {
      const content = sc([t('trip', {})]);
      const result = applyYOps(content, [
        { define: { parent: '', key: 'hotel' } },
        { populate: { path: 'hotel', slots: { stars: 4 }, source: { stars: 'four star' }, from: 'T2' } },
      ]);
      expect(result.ok).toBe(true);
      expect(result.trees).toHaveLength(2);
      expect(result.trees[1].key).toBe('hotel');
      expect(result.trees[1].slots.stars).toBe(4);
    });

    it('defines and populates a child node', () => {
      const content = sc([t('trip', {})]);
      const result = applyYOps(content, [
        { define: { parent: 'trip', key: 'dining' } },
        { populate: { path: 'trip/dining', slots: { budget: 500 }, source: { budget: 'about 500' }, from: 'T2' } },
      ]);
      expect(result.ok).toBe(true);
      expect(result.trees[0].children).toHaveLength(1);
      expect(result.trees[0].children[0].key).toBe('dining');
    });

    it('rejects duplicate key on define', () => {
      const content = sc([t('trip', {}, [t('dining', {})])]);
      const result = applyYOps(content, [
        { define: { parent: 'trip', key: 'dining' } },
      ]);
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('DUPLICATE_KEY');
    });
  });

  describe('drop', () => {
    it('removes a node and cleans up relations', () => {
      const content = sc(
        [t('trip', {}, [t('dining', {}), t('transport', {})])],
        [{ from: 'trip/dining', to: 'trip/transport', type: 'depends' }],
      );
      const result = applyYOps(content, [
        { drop: { path: 'trip/dining' } },
      ]);
      expect(result.ok).toBe(true);
      expect(result.trees[0].children).toHaveLength(1);
      expect(result.trees[0].children[0].key).toBe('transport');
      expect(result.relations).toHaveLength(0);
    });
  });

  describe('rename', () => {
    it('renames a node and updates relations', () => {
      const content = sc(
        [t('trip', {}, [t('food', { budget: 500 })])],
        [{ from: 'trip/food', to: 'trip', type: 'depends' }],
      );
      const result = applyYOps(content, [
        { rename: { path: 'trip/food', to: 'dining' } },
      ]);
      expect(result.ok).toBe(true);
      expect(result.trees[0].children[0].key).toBe('dining');
      expect(result.relations[0].from).toBe('trip/dining');
    });
  });

  describe('clone', () => {
    it('deep copies a node to a new parent', () => {
      const content = sc([
        t('trip', {}, [t('dining', { budget: 500 })]),
        t('reference', {}),
      ]);
      const result = applyYOps(content, [
        { clone: { path: 'trip/dining', to: 'reference' } },
      ]);
      expect(result.ok).toBe(true);
      const refChildren = result.trees[1].children;
      expect(refChildren).toHaveLength(1);
      expect(refChildren[0].key).toBe('dining');
      expect(refChildren[0].slots.budget).toBe(500);
      // Verify independence: modifying clone doesn't affect original
      refChildren[0].slots.budget = 999;
      expect(result.trees[0].children[0].slots.budget).toBe(500);
    });
  });

  describe('move', () => {
    it('moves a node to a new parent', () => {
      const content = sc([
        t('trip', {}, [t('dining', { budget: 500 }), t('food', {})]),
      ]);
      const result = applyYOps(content, [
        { move: { path: 'trip/dining', to: 'trip/food/dining' } },
      ]);
      expect(result.ok).toBe(true);
      expect(result.trees[0].children).toHaveLength(1);
      expect(result.trees[0].children[0].key).toBe('food');
      expect(result.trees[0].children[0].children[0].key).toBe('dining');
    });

    it('rejects moving into own subtree', () => {
      const content = sc([t('trip', {}, [t('dining', {}, [t('sub', {})])])]);
      const result = applyYOps(content, [
        { move: { path: 'trip/dining', to: 'trip/dining/sub/dining' } },
      ]);
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('CYCLE_DETECTED');
    });
  });

  describe('relate', () => {
    it('adds a relation between existing nodes', () => {
      const content = sc([t('trip', {}, [t('dining', {}), t('budget', {})])]);
      const result = applyYOps(content, [
        { relate: { from: 'trip/dining', to: 'trip/budget', type: 'depends', confidence: 0.8 } },
      ]);
      expect(result.ok).toBe(true);
      expect(result.relations).toHaveLength(1);
      expect(result.relations[0].type).toBe('depends');
      expect(result.relations[0].confidence).toBe(0.8);
    });

    it('rejects self-relation', () => {
      const content = sc([t('trip', {})]);
      const result = applyYOps(content, [
        { relate: { from: 'trip', to: 'trip', type: 'causes' } },
      ]);
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('SELF_RELATION');
    });

    it('rejects duplicate relation', () => {
      const rels: Relation[] = [
        { from: 'trip/dining', to: 'trip/budget', type: 'depends' },
      ];
      const content = sc([t('trip', {}, [t('dining', {}), t('budget', {})])], rels);
      const result = applyYOps(content, [
        { relate: { from: 'trip/dining', to: 'trip/budget', type: 'depends' } },
      ]);
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('DUPLICATE_RELATION');
    });
  });

  describe('unrelate', () => {
    it('removes a relation', () => {
      const rels: Relation[] = [
        { from: 'trip/dining', to: 'trip/budget', type: 'depends' },
      ];
      const content = sc([t('trip', {}, [t('dining', {}), t('budget', {})])], rels);
      const result = applyYOps(content, [
        { unrelate: { from: 'trip/dining', to: 'trip/budget', type: 'depends' } },
      ]);
      expect(result.ok).toBe(true);
      expect(result.relations).toHaveLength(0);
    });

    it('is no-op when relation does not exist', () => {
      const content = sc([t('trip', {})]);
      const result = applyYOps(content, [
        { unrelate: { from: 'trip', to: 'other', type: 'causes' } },
      ]);
      expect(result.ok).toBe(true);
      expect(result.applied).toBe(1);
    });
  });

  describe('sequential execution', () => {
    it('stops at first error', () => {
      const content = sc([t('trip', { budget: 1000 })]);
      const result = applyYOps(content, [
        { set: { path: 'trip/style', value: 'casual', source: 'q', from: 'T1' } },
        { set: { path: 'missing/budget', value: 2000, source: 'q', from: 'T2' } },
        { set: { path: 'trip/name', value: 'Test', source: 'q', from: 'T3' } },
      ]);
      expect(result.ok).toBe(false);
      expect(result.applied).toBe(1);
      expect(result.error?.op_index).toBe(1);
    });
  });
});
