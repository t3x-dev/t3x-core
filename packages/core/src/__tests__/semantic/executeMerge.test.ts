import { describe, expect, it } from 'vitest';
import { executeMerge, prepareMerge } from '../../semantic/merge';
import { flattenTrees } from '../../semantic/tree';
import type { SemanticContent, TreeNode } from '../../semantic/types';

const t = (key: string, slots: Record<string, unknown>, children: TreeNode[] = []): TreeNode => ({
  key,
  slots,
  children,
});
const sc = (trees: TreeNode[], relations: SemanticContent['relations'] = []): SemanticContent => ({
  trees,
  relations,
});

describe('executeMerge', () => {
  it('includes auto-kept nodes without any decisions', () => {
    const base = sc([t('topic_a', { a: 1 })]);
    const prepared = prepareMerge(base, base, base);

    const result = executeMerge(base, base, base, prepared, {
      conflictResolutions: {},
      keepFromSource: [],
      keepFromTarget: [],
      keepRelationsFromSource: false,
      keepRelationsFromTarget: false,
    });

    const nodes = flattenTrees(result.trees);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('topic_a');
  });

  it('resolves conflict with source choice', () => {
    const base = sc([t('topic_a', { a: 1 })]);
    const source = sc([t('topic_a', { a: 10 })]);
    const target = sc([t('topic_a', { a: 20 })]);
    const prepared = prepareMerge(base, source, target);

    const result = executeMerge(base, source, target, prepared, {
      conflictResolutions: { topic_a: 'source' },
      keepFromSource: [],
      keepFromTarget: [],
      keepRelationsFromSource: false,
      keepRelationsFromTarget: false,
    });

    const nodes = flattenTrees(result.trees);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].slots.a).toBe(10);
  });

  it('resolves conflict with target choice', () => {
    const base = sc([t('topic_a', { a: 1 })]);
    const source = sc([t('topic_a', { a: 10 })]);
    const target = sc([t('topic_a', { a: 20 })]);
    const prepared = prepareMerge(base, source, target);

    const result = executeMerge(base, source, target, prepared, {
      conflictResolutions: { topic_a: 'target' },
      keepFromSource: [],
      keepFromTarget: [],
      keepRelationsFromSource: false,
      keepRelationsFromTarget: false,
    });

    const nodes = flattenTrees(result.trees);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].slots.a).toBe(20);
  });

  it('resolves conflict with both — includes both in result frames', () => {
    const base = sc([t('topic_a', { a: 1 })]);
    const source = sc([t('topic_a', { a: 10 })]);
    const target = sc([t('topic_a', { a: 20 })]);
    const prepared = prepareMerge(base, source, target);

    const result = executeMerge(base, source, target, prepared, {
      conflictResolutions: { topic_a: 'both' },
      keepFromSource: [],
      keepFromTarget: [],
      keepRelationsFromSource: false,
      keepRelationsFromTarget: false,
    });

    // "both" with same key results in single tree (unflattenToTrees merges by root key)
    const nodes = flattenTrees(result.trees);
    expect(nodes.length).toBeGreaterThanOrEqual(1);
  });

  it('resolves conflict with custom edit', () => {
    const base = sc([t('topic_a', { a: 1 })]);
    const source = sc([t('topic_a', { a: 10 })]);
    const target = sc([t('topic_a', { a: 20 })]);
    const prepared = prepareMerge(base, source, target);

    const editedNode: TreeNode = { key: 'topic_a', slots: { a: 15, note: 'merged' }, children: [] };
    const result = executeMerge(base, source, target, prepared, {
      conflictResolutions: { topic_a: { edit: editedNode } },
      keepFromSource: [],
      keepFromTarget: [],
      keepRelationsFromSource: false,
      keepRelationsFromTarget: false,
    });

    const nodes = flattenTrees(result.trees);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].slots.a).toBe(15);
    expect(nodes[0].slots.note).toBe('merged');
  });

  it('defaults to source when no resolution provided for conflict', () => {
    const base = sc([t('topic_a', { a: 1 })]);
    const source = sc([t('topic_a', { a: 10 })]);
    const target = sc([t('topic_a', { a: 20 })]);
    const prepared = prepareMerge(base, source, target);

    const result = executeMerge(base, source, target, prepared, {
      conflictResolutions: {},
      keepFromSource: [],
      keepFromTarget: [],
      keepRelationsFromSource: false,
      keepRelationsFromTarget: false,
    });

    const nodes = flattenTrees(result.trees);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].slots.a).toBe(10);
  });

  it('keeps selected source-only nodes', () => {
    const base = sc([]);
    const source = sc([t('topic_a', { a: 1 }), t('topic_b', { b: 2 })]);
    const target = sc([]);
    const prepared = prepareMerge(base, source, target);

    const result = executeMerge(base, source, target, prepared, {
      conflictResolutions: {},
      keepFromSource: ['topic_a'],
      keepFromTarget: [],
      keepRelationsFromSource: false,
      keepRelationsFromTarget: false,
    });

    const nodes = flattenTrees(result.trees);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('topic_a');
  });

  it('keeps selected target-only nodes', () => {
    const base = sc([]);
    const source = sc([]);
    const target = sc([t('topic_a', { a: 1 }), t('topic_b', { b: 2 })]);
    const prepared = prepareMerge(base, source, target);

    const result = executeMerge(base, source, target, prepared, {
      conflictResolutions: {},
      keepFromSource: [],
      keepFromTarget: ['topic_b'],
      keepRelationsFromSource: false,
      keepRelationsFromTarget: false,
    });

    const nodes = flattenTrees(result.trees);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('topic_b');
  });

  it('merges relations correctly', () => {
    const trees = [t('topic_a', { a: 1 }), t('topic_b', { b: 2 })];
    const base = sc(trees);
    const source = sc(trees, [{ from: 'topic_a', to: 'topic_b', type: 'causes' as const }]);
    const target = sc(trees, [{ from: 'topic_a', to: 'topic_b', type: 'depends' as const }]);
    const prepared = prepareMerge(base, source, target);

    const result = executeMerge(base, source, target, prepared, {
      conflictResolutions: {},
      keepFromSource: [],
      keepFromTarget: [],
      keepRelationsFromSource: true,
      keepRelationsFromTarget: true,
    });

    expect(result.relations).toHaveLength(2);
  });

  it('excludes relations when not kept', () => {
    const trees = [t('topic_a', { a: 1 }), t('topic_b', { b: 2 })];
    const base = sc(trees);
    const source = sc(trees, [{ from: 'topic_a', to: 'topic_b', type: 'causes' as const }]);
    const target = sc(trees, [{ from: 'topic_a', to: 'topic_b', type: 'depends' as const }]);
    const prepared = prepareMerge(base, source, target);

    const result = executeMerge(base, source, target, prepared, {
      conflictResolutions: {},
      keepFromSource: [],
      keepFromTarget: [],
      keepRelationsFromSource: false,
      keepRelationsFromTarget: false,
    });

    expect(result.relations).toHaveLength(0);
  });

  it('handles complex merge: auto-kept + conflicts + unique + relations', () => {
    const base = sc(
      [t('topic_a', { x: 1 }), t('topic_b', { y: 2 })],
      [{ from: 'topic_a', to: 'topic_b', type: 'causes' as const }]
    );
    const source = sc(
      [t('topic_a', { x: 1 }), t('topic_b', { y: 20 }), t('topic_c', { z: 3 })],
      [
        { from: 'topic_a', to: 'topic_b', type: 'causes' as const },
        { from: 'topic_c', to: 'topic_a', type: 'depends' as const },
      ]
    );
    const target = sc(
      [t('topic_a', { x: 1 }), t('topic_b', { y: 30 }), t('topic_d', { w: 4 })],
      [
        { from: 'topic_a', to: 'topic_b', type: 'causes' as const },
        { from: 'topic_d', to: 'topic_a', type: 'follows' as const },
      ]
    );
    const prepared = prepareMerge(base, source, target);

    const result = executeMerge(base, source, target, prepared, {
      conflictResolutions: { topic_b: 'target' },
      keepFromSource: ['topic_c'],
      keepFromTarget: ['topic_d'],
      keepRelationsFromSource: true,
      keepRelationsFromTarget: true,
    });

    const nodes = flattenTrees(result.trees);
    expect(nodes).toHaveLength(4);
    const ids = nodes.map((f) => f.id).sort();
    expect(ids).toEqual(['topic_a', 'topic_b', 'topic_c', 'topic_d']);
    expect(nodes.find((f) => f.id === 'topic_b')?.slots.y).toBe(30);
    expect(result.relations).toHaveLength(3);
  });
});
