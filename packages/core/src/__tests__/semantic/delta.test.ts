import { describe, expect, it } from 'vitest';
import { applyTreeChanges } from '../../semantic/delta';
import type { TreeChangeBatch, SemanticContent, TreeNode } from '../../semantic/types';

const t = (key: string, slots: Record<string, unknown>, children: TreeNode[] = []): TreeNode => ({
  key,
  slots,
  children,
});

const sc = (trees: TreeNode[], relations: SemanticContent['relations'] = []): SemanticContent => ({
  trees,
  relations,
});

describe('applyTreeChanges', () => {
  it('adds a child node', () => {
    const snapshot = sc([t('root', { a: 1 })]);
    const batch: TreeChangeBatch = {
      changes: [{ action: 'add', parent_path: 'root', node: t('child', { b: 2 }) }],
    };
    const result = applyTreeChanges(snapshot, batch);
    expect(result.trees[0].children).toHaveLength(1);
    expect(result.trees[0].children[0].key).toBe('child');
    expect(result.trees[0].children[0].slots.b).toBe(2);
  });

  it('updates a node slot', () => {
    const snapshot = sc([t('root', { a: 1, b: 2 }, [t('child', { x: 10 })])]);
    const batch: TreeChangeBatch = {
      changes: [{ action: 'update', target_path: 'root/child', slots: { x: 99 } }],
    };
    const result = applyTreeChanges(snapshot, batch);
    expect(result.trees[0].children[0].slots.x).toBe(99);
  });

  it('removes a slot with null', () => {
    const snapshot = sc([t('root', { a: 1 }, [t('child', { x: 10, y: 20 })])]);
    const batch: TreeChangeBatch = {
      changes: [{ action: 'update', target_path: 'root/child', slots: { y: null } }],
    };
    const result = applyTreeChanges(snapshot, batch);
    expect(result.trees[0].children[0].slots.y).toBeUndefined();
    expect(result.trees[0].children[0].slots.x).toBe(10);
  });

  it('removes a node and cleans up relations', () => {
    const snapshot: SemanticContent = {
      trees: [t('root', { a: 1 }, [t('child', { b: 2 })])],
      relations: [{ from: 'root/child', to: 'root', type: 'causes' }],
    };
    const batch: TreeChangeBatch = {
      changes: [{ action: 'remove', target_path: 'root/child' }],
    };
    const result = applyTreeChanges(snapshot, batch);
    expect(result.trees[0].children).toHaveLength(0);
    expect(result.relations).toHaveLength(0);
  });

  it('adds new relations', () => {
    const snapshot = sc([t('topic_a', { a: 1 }), t('topic_b', { b: 2 })]);
    const batch: TreeChangeBatch = {
      changes: [{ action: 'add', parent_path: 'topic_a', node: t('detail', { c: 3 }) }],
      new_relations: [{ from: 'topic_a', to: 'topic_b', type: 'causes' }],
    };
    const result = applyTreeChanges(snapshot, batch);
    expect(result.relations).toHaveLength(1);
    expect(result.relations[0].type).toBe('causes');
  });

  it('removes specified relations', () => {
    const snapshot: SemanticContent = {
      trees: [t('topic_a', { a: 1 }), t('topic_b', { b: 2 })],
      relations: [{ from: 'topic_a', to: 'topic_b', type: 'causes' }],
    };
    const batch: TreeChangeBatch = {
      changes: [{ action: 'add', parent_path: 'topic_a', node: t('detail', { c: 3 }) }],
      remove_relations: [{ from: 'topic_a', to: 'topic_b', type: 'causes' }],
    };
    const result = applyTreeChanges(snapshot, batch);
    expect(result.relations).toHaveLength(0);
  });

  it('skips update with non-existent target silently', () => {
    const snapshot = sc([t('root', { a: 1 })]);
    const result = applyTreeChanges(snapshot, {
      changes: [{ action: 'update', target_path: 'nonexistent', slots: { a: 1 } }],
    });
    expect(result.trees).toHaveLength(1);
  });

  it('skips remove with non-existent target silently', () => {
    const snapshot = sc([t('root', { a: 1 })]);
    const result = applyTreeChanges(snapshot, {
      changes: [{ action: 'remove', target_path: 'nonexistent' }],
    });
    expect(result.trees).toHaveLength(1);
  });

  it('is immutable — does not modify input', () => {
    const snapshot = sc([t('root', { a: 1 }, [t('child', { x: 10 })])]);
    applyTreeChanges(snapshot, {
      changes: [{ action: 'update', target_path: 'root/child', slots: { x: 99 } }],
    });
    expect(snapshot.trees[0].children[0].slots.x).toBe(10);
  });

  it('updates root node slots', () => {
    const snapshot = sc([t('root', { dates: 'May 1-3', dest: 'Hangzhou' })]);
    const batch: TreeChangeBatch = {
      changes: [{ action: 'update', target_path: 'root', slots: { dates: 'May 2-4' } }],
    };
    const result = applyTreeChanges(snapshot, batch);
    expect(result.trees[0].slots.dates).toBe('May 2-4');
    expect(result.trees[0].slots.dest).toBe('Hangzhou');
  });

  it('merges slot_quotes on update', () => {
    const snapshot = sc([
      {
        key: 'root',
        slots: { dest: 'Hangzhou' },
        children: [
          { key: 'dining', slots: { cuisine: 'local', budget: 500 }, children: [], slot_quotes: { cuisine: 'local food' } },
        ],
      },
    ]);
    const batch: TreeChangeBatch = {
      changes: [
        {
          action: 'update',
          target_path: 'root/dining',
          slots: { budget: 800 },
          slot_quotes: { 'dining.budget': 'budget to 800' },
        },
      ],
    };
    const result = applyTreeChanges(snapshot, batch);
    expect(result.trees[0].children[0].slot_quotes?.cuisine).toBe('local food');
    expect(result.trees[0].children[0].slot_quotes?.budget).toBe('budget to 800');
  });
});
