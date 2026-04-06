import { describe, expect, it } from 'vitest';
import type { SemanticContent, TreeNode } from '../../semantic/types';
import { applyYOps } from '../engine';
import { formatYOpsLog, parseYOpsYaml } from '../format';
import type { YOp } from '../types';

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

// ── Engine Integration Tests ──

describe('engine integration', () => {
  it('sequential execution: op 2 sees result of op 1', () => {
    const content = sc([]);
    const result = applyYOps(content, [
      // Op 1-2: define + populate root node
      { define: { parent: '', key: 'trip' } },
      { populate: { path: 'trip', slots: { budget: 2000 }, source: { budget: 'about 2000' }, from: 'T1' } },
      // Op 3: set slot on newly defined node (depends on op 1)
      { set: { path: 'trip/style', value: 'casual', source: 'keep it casual', from: 'T2' } },
    ]);
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(3);
    expect(result.trees[0].slots.budget).toBe(2000);
    expect(result.trees[0].slots.style).toBe('casual');
  });

  it('stops at first error with correct operation index', () => {
    const content = sc([t('trip', { budget: 1000 })]);
    const result = applyYOps(content, [
      { set: { path: 'trip/style', value: 'casual', source: 'q', from: 'T1' } },
      { set: { path: 'missing/budget', value: 2000, source: 'q', from: 'T2' } },
      { set: { path: 'trip/name', value: 'Test', source: 'q', from: 'T3' } },
    ]);
    expect(result.ok).toBe(false);
    expect(result.applied).toBe(1);
    expect(result.error?.op_index).toBe(1);
    expect(result.error?.code).toBe('NODE_NOT_FOUND');
    // Third op was NOT applied
    expect(result.trees[0].slots.name).toBeUndefined();
  });

  it('does not mutate input (immutability)', () => {
    const originalTree: TreeNode = {
      key: 'trip',
      slots: { budget: 1000 },
      children: [{ key: 'dining', slots: { style: 'casual' }, children: [] }],
    };
    const originalRelations = [
      { from: 'trip/dining', to: 'trip', type: 'depends' as const },
    ];
    const content = sc([originalTree], originalRelations);

    // Deep copy for comparison
    const budgetBefore = originalTree.slots.budget;
    const childStyleBefore = originalTree.children[0].slots.style;
    const relFromBefore = originalRelations[0].from;

    applyYOps(content, [
      { set: { path: 'trip/budget', value: 9999, source: 'q', from: 'T1' } },
      { set: { path: 'trip/dining/style', value: 'formal', source: 'q', from: 'T1' } },
      { rename: { path: 'trip/dining', to: 'food' } },
    ]);

    // Original must be untouched
    expect(originalTree.slots.budget).toBe(budgetBefore);
    expect(originalTree.children[0].slots.style).toBe(childStyleBefore);
    expect(originalRelations[0].from).toBe(relFromBefore);
    expect(originalTree.children[0].key).toBe('dining');
  });

  it('handles empty ops list', () => {
    const content = sc([t('trip', { budget: 1000 })]);
    const result = applyYOps(content, []);
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(0);
    expect(result.trees).toHaveLength(1);
    expect(result.trees[0].slots.budget).toBe(1000);
  });

  it('chain: define + populate + rename + relate', () => {
    const content = sc([]);
    const result = applyYOps(content, [
      { define: { parent: '', key: 'trip' } },
      { define: { parent: 'trip', key: 'food' } },
      { populate: { path: 'trip/food', slots: { budget: 500 }, source: { budget: 'about 500' }, from: 'T1' } },
      { define: { parent: 'trip', key: 'budget' } },
      { populate: { path: 'trip/budget', slots: { total: 2000 }, source: { total: 'about 2000' }, from: 'T1' } },
      { rename: { path: 'trip/food', to: 'dining' } },
      { relate: { from: 'trip/dining', to: 'trip/budget', type: 'depends' } },
    ]);
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(7);
    expect(result.trees[0].children[0].key).toBe('dining');
    expect(result.relations[0].from).toBe('trip/dining');
    expect(result.relations[0].to).toBe('trip/budget');
  });

  it('returns partial state on error', () => {
    const content = sc([t('trip', {})]);
    const result = applyYOps(content, [
      { define: { parent: 'trip', key: 'dining' } },
      { populate: { path: 'trip/dining', slots: { budget: 500 }, source: { budget: 'q' }, from: 'T1' } },
      // This will fail: defining under nonexistent parent
      { define: { parent: 'nonexistent', key: 'x' } },
    ]);
    expect(result.ok).toBe(false);
    expect(result.applied).toBe(2);
    // The first two ops were applied (dining exists in partial state)
    expect(result.trees[0].children).toHaveLength(1);
    expect(result.trees[0].children[0].key).toBe('dining');
  });
});

// ── Format Module Tests ──

describe('formatYOpsLog', () => {
  it('produces valid YAML containing operation keywords', () => {
    const ops: YOp[] = [
      { set: { path: 'trip/budget', value: 2000, source: 'about 2000', from: 'T3' } },
      { define: { parent: '', key: 'hotel' } },
      { populate: { path: 'hotel', slots: { stars: 4 }, source: { stars: 'four star' }, from: 'T2' } },
      { drop: { path: 'trip/shopping' } },
      { relate: { from: 'trip', to: 'hotel', type: 'depends' } },
    ];
    const yaml = formatYOpsLog(ops);
    expect(yaml).toContain('yops:');
    expect(yaml).toContain('set:');
    expect(yaml).toContain('define:');
    expect(yaml).toContain('populate:');
    expect(yaml).toContain('drop:');
    expect(yaml).toContain('relate:');
  });

  it('produces parseable YAML', () => {
    const ops: YOp[] = [
      { set: { path: 'trip/budget', value: 2000, source: 'about 2000', from: 'T3' } },
      { rename: { path: 'trip/food', to: 'dining' } },
    ];
    const yaml = formatYOpsLog(ops);
    // Should not throw
    const parsed = parseYOpsYaml(yaml);
    expect(parsed).toHaveLength(2);
  });
});

describe('parseYOpsYaml', () => {
  it('roundtrips with formatYOpsLog', () => {
    const ops: YOp[] = [
      { set: { path: 'trip/budget', value: 2000, source: 'about 2000', from: 'T3' } },
      { define: { parent: 'trip', key: 'dining' } },
      { populate: { path: 'trip/dining', slots: { budget: 500 }, source: { budget: 'about 500' }, from: 'T2' } },
      { drop: { path: 'trip/shopping' } },
      { rename: { path: 'trip/food', to: 'dining' } },
      { clone: { path: 'trip/dining', to: 'reference' } },
      { move: { path: 'trip/dining', to: 'trip/food/dining' } },
      { relate: { from: 'trip', to: 'hotel', type: 'depends' } },
      { unrelate: { from: 'trip', to: 'hotel', type: 'depends' } },
    ];
    const yaml = formatYOpsLog(ops);
    const parsed = parseYOpsYaml(yaml);
    expect(parsed).toEqual(ops);
  });

  it('throws on missing yops array', () => {
    expect(() => parseYOpsYaml('foo: bar')).toThrow('Invalid YOps document');
  });

  it('throws on non-array yops', () => {
    expect(() => parseYOpsYaml('yops: not_an_array')).toThrow('Invalid YOps document');
  });

  it('throws on empty YAML', () => {
    expect(() => parseYOpsYaml('')).toThrow('Invalid YOps document');
  });
});
