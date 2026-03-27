import type { TreeDiff, SemanticContent } from '@t3x-dev/core';
import { describe, expect, it } from 'vitest';
import {
  buildAlignedNodes,
  buildDiffStatusMap,
  buildTreeGraph,
  deriveRootNodeId,
} from '../DiffYAMLUtils';

describe('buildAlignedNodes', () => {
  it('orders: modified -> removed -> added -> identical', () => {
    const diff: TreeDiff = {
      modified: [
        {
          path: 'f1',
          slotDiffs: [{ key: 'x', type: 'changed', oldValue: 1, newValue: 2 }],
        },
      ],
      onlyInSource: ['f2'],
      onlyInTarget: ['f3'],
      identical: ['f4'],
      relationsAdded: [],
      relationsRemoved: [],
    };
    const aligned = buildAlignedNodes(diff);
    expect(aligned.map((a) => a.type)).toEqual(['modified', 'removed', 'added', 'identical']);
    expect(aligned.map((a) => a.treeId)).toEqual(['f1', 'f2', 'f3', 'f4']);
  });

  it('handles empty diff', () => {
    const diff: TreeDiff = {
      modified: [],
      onlyInSource: [],
      onlyInTarget: [],
      identical: [],
      relationsAdded: [],
      relationsRemoved: [],
    };
    expect(buildAlignedNodes(diff)).toEqual([]);
  });
});

describe('deriveRootNodeId', () => {
  it('returns explicit root_tree_id if set', () => {
    const content: SemanticContent = {
      trees: [
        { key: 'a', slots: {}, children: [] },
        { key: 'b', slots: {}, children: [] },
      ],
      relations: [{ from: 'a', to: 'b', type: 'depends' }],
    };
    expect(deriveRootNodeId(content)).toBeDefined();
  });

  it('derives root from most incoming edges', () => {
    const content: SemanticContent = {
      trees: [
        { key: 'a', slots: {}, children: [] },
        { key: 'b', slots: {}, children: [] },
        { key: 'c', slots: {}, children: [] },
      ],
      relations: [
        { from: 'b', to: 'a', type: 'depends' },
        { from: 'c', to: 'a', type: 'conditions' },
      ],
    };
    expect(deriveRootNodeId(content)).toBe('a');
  });

  it('returns first tree key when no relations', () => {
    const content: SemanticContent = {
      trees: [{ key: 'x', slots: {}, children: [] }],
      relations: [],
    };
    expect(deriveRootNodeId(content)).toBe('x');
  });

  it('returns undefined for empty trees', () => {
    const content: SemanticContent = { trees: [], relations: [] };
    expect(deriveRootNodeId(content)).toBeUndefined();
  });
});

describe('buildDiffStatusMap', () => {
  it('maps all tree statuses', () => {
    const diff: TreeDiff = {
      modified: [
        {
          path: 'f1',
          slotDiffs: [],
        },
      ],
      onlyInSource: ['f2'],
      onlyInTarget: ['f3'],
      identical: ['f4'],
      relationsAdded: [],
      relationsRemoved: [],
    };
    const map = buildDiffStatusMap(diff);
    expect(map.get('f1')).toBe('modified');
    expect(map.get('f2')).toBe('removed');
    expect(map.get('f3')).toBe('added');
    expect(map.get('f4')).toBe('identical');
  });
});

describe('buildTreeGraph', () => {
  it('builds tree from relations', () => {
    const content: SemanticContent = {
      trees: [
        { key: 'plan', slots: {}, children: [] },
        { key: 'budget', slots: {}, children: [] },
        { key: 'pref', slots: {}, children: [] },
      ],
      relations: [
        { from: 'budget', to: 'plan', type: 'conditions' },
        { from: 'pref', to: 'plan', type: 'depends' },
      ],
    };
    const statusMap = new Map<string, 'modified' | 'added' | 'removed' | 'identical'>([
      ['plan', 'modified'],
      ['budget', 'identical'],
      ['pref', 'added'],
    ]);
    const trees = buildTreeGraph(content, statusMap, 'plan');
    expect(trees).toHaveLength(1);
    expect(trees[0].treeId).toBe('plan');
    expect(trees[0].children).toHaveLength(2);
    expect(trees[0].children.map((c) => c.treeId).sort()).toEqual(['budget', 'pref']);
  });

  it('handles orphan trees', () => {
    const content: SemanticContent = {
      trees: [
        { key: 'a', slots: {}, children: [] },
        { key: 'b', slots: {}, children: [] },
      ],
      relations: [],
    };
    const statusMap = new Map<string, 'modified' | 'added' | 'removed' | 'identical'>([
      ['a', 'identical'],
      ['b', 'added'],
    ]);
    const trees = buildTreeGraph(content, statusMap);
    expect(trees).toHaveLength(2); // both are roots since no relations
  });
});
