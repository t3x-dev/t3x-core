import { describe, expect, it } from 'vitest';
import { executeMerge, prepareMerge } from '../../semantic/merge';
import { flattenTrees } from '../../semantic/tree';
import type { SemanticContent, TreeNode } from '../../semantic/types';
import { validateIntegrity } from '../../semantic/validate';

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

  it('preserves a unilateral node and relation deletion', () => {
    const relation = { from: 'topic_a', to: 'topic_b', type: 'causes' as const };
    const base = sc([t('topic_a', { a: 1 }), t('topic_b', { b: 2 })], [relation]);
    const source = sc([t('topic_b', { b: 2 })], []);
    const prepared = prepareMerge(base, source, base);

    const result = executeMerge(base, source, base, prepared, {
      conflictResolutions: {},
      keepFromSource: [],
      keepFromTarget: [],
      keepRelationsFromSource: true,
      keepRelationsFromTarget: true,
    });

    expect(flattenTrees(result.trees).map((node) => node.id)).toEqual(['topic_b']);
    expect(result.relations).toEqual([]);
  });

  it('resolves a modify/delete conflict to deletion or modification', () => {
    const base = sc([t('topic_a', { a: 1 })]);
    const source = sc([]);
    const target = sc([t('topic_a', { a: 2 })]);
    const prepared = prepareMerge(base, source, target);

    const deleted = executeMerge(base, source, target, prepared, {
      conflictResolutions: { topic_a: 'source' },
      keepFromSource: [],
      keepFromTarget: [],
      keepRelationsFromSource: false,
      keepRelationsFromTarget: false,
    });
    expect(deleted.trees).toEqual([]);

    const modified = executeMerge(base, source, target, prepared, {
      conflictResolutions: { topic_a: 'target' },
      keepFromSource: [],
      keepFromTarget: [],
      keepRelationsFromSource: false,
      keepRelationsFromTarget: false,
    });
    expect(flattenTrees(modified.trees)[0]?.slots.a).toBe(2);
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

  it('keeps a custom edit at its nested conflict path', () => {
    const relation = { from: 'root', to: 'root/section/child', type: 'depends' };
    const base = sc([t('root', {}, [t('section', {}, [t('child', { value: 1 })])])], [relation]);
    const source = sc([t('root', {}, [t('section', {}, [t('child', { value: 10 })])])], [relation]);
    const target = sc([t('root', {}, [t('section', {}, [t('child', { value: 20 })])])], [relation]);
    const prepared = prepareMerge(base, source, target);

    const result = executeMerge(base, source, target, prepared, {
      conflictResolutions: {
        'root/section/child': { edit: t('child', { value: 15 }) },
      },
      keepFromSource: [],
      keepFromTarget: [],
      keepRelationsFromSource: false,
      keepRelationsFromTarget: false,
    });

    expect(result.trees).toHaveLength(1);
    expect(result.trees[0]).toMatchObject({
      key: 'root',
      children: [{ key: 'section', children: [{ key: 'child', slots: { value: 15 } }] }],
    });
    expect(flattenTrees(result.trees).map((frame) => frame.id)).toEqual([
      'root',
      'root/section',
      'root/section/child',
    ]);
    expect(result.relations).toEqual([relation]);
    expect(validateIntegrity(result).valid).toBe(true);
  });

  it('does not duplicate an auto-kept descendant included in a custom edit', () => {
    const stableChild = t('child', { stable: true });
    const editedChild = t('child', { edited: true, stable: true });
    const base = sc([t('root', { value: 1 }, [stableChild])]);
    const source = sc([t('root', { value: 10 }, [stableChild])]);
    const target = sc([t('root', { value: 20 }, [stableChild])]);
    const prepared = prepareMerge(base, source, target);

    const result = executeMerge(base, source, target, prepared, {
      conflictResolutions: {
        root: { edit: t('root', { value: 15 }, [editedChild]) },
      },
      keepFromSource: [],
      keepFromTarget: [],
      keepRelationsFromSource: false,
      keepRelationsFromTarget: false,
    });

    expect(flattenTrees(result.trees).map((frame) => frame.id)).toEqual(['root', 'root/child']);
    expect(result.trees[0].children).toEqual([editedChild]);
  });

  it.each([
    ['source', 10],
    ['target', 20],
  ] as const)('lets a nested %s decision replace the same path from a parent edit regardless of prepared order', (resolution, expectedValue) => {
    const base = sc([t('root', { value: 1 }, [t('child', { value: 1 })])]);
    const source = sc([t('root', { value: 10 }, [t('child', { value: 10 })])]);
    const target = sc([t('root', { value: 20 }, [t('child', { value: 20 })])]);
    const prepared = prepareMerge(base, source, target);
    prepared.conflicts.reverse();

    const result = executeMerge(base, source, target, prepared, {
      conflictResolutions: {
        root: { edit: t('root', { value: 15 }, [t('child', { value: 15 })]) },
        'root/child': resolution,
      },
      keepFromSource: [],
      keepFromTarget: [],
      keepRelationsFromSource: false,
      keepRelationsFromTarget: false,
    });

    expect(flattenTrees(result.trees).map((frame) => frame.id)).toEqual(['root', 'root/child']);
    expect(result.trees[0].slots.value).toBe(15);
    expect(result.trees[0].children[0].slots.value).toBe(expectedValue);
  });

  it('preserves both later conflict choices after removing the overlapping edit frame', () => {
    const base = sc([t('root', { value: 1 }, [t('child', { value: 1 })])]);
    const source = sc([t('root', { value: 10 }, [t('child', { value: 10 })])]);
    const target = sc([t('root', { value: 20 }, [t('child', { value: 20 })])]);
    const prepared = prepareMerge(base, source, target);

    const result = executeMerge(base, source, target, prepared, {
      conflictResolutions: {
        root: { edit: t('root', { value: 15 }, [t('child', { value: 15 })]) },
        'root/child': 'both',
      },
      keepFromSource: [],
      keepFromTarget: [],
      keepRelationsFromSource: false,
      keepRelationsFromTarget: false,
    });

    expect(result.trees[0].children.map((child) => child.slots.value)).toEqual([10, 20]);
  });

  it('does not duplicate edited descendants selected later from either side', () => {
    const base = sc([t('root', { value: 1 })]);
    const source = sc([t('root', { value: 10 }, [t('source_child', { value: 10 })])]);
    const target = sc([t('root', { value: 20 }, [t('target_child', { value: 20 })])]);
    const prepared = prepareMerge(base, source, target);

    const result = executeMerge(base, source, target, prepared, {
      conflictResolutions: {
        root: {
          edit: t('root', { value: 15 }, [
            t('source_child', { value: 15 }),
            t('target_child', { value: 25 }),
          ]),
        },
      },
      keepFromSource: ['root/source_child'],
      keepFromTarget: ['root/target_child'],
      keepRelationsFromSource: false,
      keepRelationsFromTarget: false,
    });

    expect(flattenTrees(result.trees).map((frame) => frame.id)).toEqual([
      'root',
      'root/source_child',
      'root/target_child',
    ]);
    expect(result.trees[0].children.map((child) => child.slots.value)).toEqual([10, 20]);
  });

  it('rejects a custom edit whose key disagrees with the conflict path', () => {
    const sibling = t('renamed_child', { stable: true });
    const base = sc([t('root', {}, [t('child', { value: 1 }), sibling])]);
    const source = sc([t('root', {}, [t('child', { value: 10 }), sibling])]);
    const target = sc([t('root', {}, [t('child', { value: 20 }), sibling])]);
    const prepared = prepareMerge(base, source, target);

    expect(() =>
      executeMerge(base, source, target, prepared, {
        conflictResolutions: {
          'root/child': { edit: t('renamed_child', { value: 15 }) },
        },
        keepFromSource: [],
        keepFromTarget: [],
        keepRelationsFromSource: false,
        keepRelationsFromTarget: false,
      })
    ).toThrow('Edited node key "renamed_child" does not match conflict path "root/child"');
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
