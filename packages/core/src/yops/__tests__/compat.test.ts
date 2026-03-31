import { describe, expect, it } from 'vitest';
import type { TreeChangeBatch } from '../compat';
import { treeChangesToYOps } from '../compat';

describe('treeChangesToYOps', () => {
  it('converts add action to add YOp', () => {
    const batch: TreeChangeBatch = {
      changes: [
        {
          action: 'add',
          parent_path: '',
          node: {
            key: 'trip',
            slots: { budget: 5000, style: 'casual' },
            children: [],
          },
          slot_quotes: { budget: 'about 5k', style: 'casual vibes' },
        },
      ],
    };
    const ops = treeChangesToYOps(batch);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({
      add: {
        parent: '',
        node: { trip: { budget: 5000, style: 'casual' } },
        source: { budget: 'about 5k', style: 'casual vibes' },
        from: 'manual',
      },
    });
  });

  it('converts add action with non-root parent', () => {
    const batch: TreeChangeBatch = {
      changes: [
        {
          action: 'add',
          parent_path: 'trip',
          node: {
            key: 'dining',
            slots: { cuisine: 'italian' },
            children: [],
          },
        },
      ],
    };
    const ops = treeChangesToYOps(batch);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({
      add: {
        parent: 'trip',
        node: { dining: { cuisine: 'italian' } },
        source: {},
        from: 'manual',
      },
    });
  });

  it('converts update action to set YOps (one per slot)', () => {
    const batch: TreeChangeBatch = {
      changes: [
        {
          action: 'update',
          target_path: 'trip',
          slots: { budget: 6000, duration: 10 },
          slot_quotes: { 'trip.budget': 'changed to 6k' },
        },
      ],
    };
    const ops = treeChangesToYOps(batch);
    expect(ops).toHaveLength(2);
    expect(ops[0]).toEqual({
      set: {
        path: 'trip/budget',
        value: 6000,
        source: 'changed to 6k',
        from: 'manual',
      },
    });
    expect(ops[1]).toEqual({
      set: {
        path: 'trip/duration',
        value: 10,
        source: '10',
        from: 'manual',
      },
    });
  });

  it('converts update with null slot values to unset YOps', () => {
    const batch: TreeChangeBatch = {
      changes: [
        {
          action: 'update',
          target_path: 'trip',
          slots: { budget: null, style: 'fancy' },
        },
      ],
    };
    const ops = treeChangesToYOps(batch);
    expect(ops).toHaveLength(2);
    expect(ops[0]).toEqual({ unset: { path: 'trip/budget' } });
    expect(ops[1]).toEqual({
      set: {
        path: 'trip/style',
        value: 'fancy',
        source: 'fancy',
        from: 'manual',
      },
    });
  });

  it('converts remove action to drop YOp', () => {
    const batch: TreeChangeBatch = {
      changes: [
        { action: 'remove', target_path: 'trip', reason: 'user deleted' },
      ],
    };
    const ops = treeChangesToYOps(batch);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({
      drop: { path: 'trip', reason: 'user deleted' },
    });
  });

  it('converts remove without reason', () => {
    const batch: TreeChangeBatch = {
      changes: [{ action: 'remove', target_path: 'trip' }],
    };
    const ops = treeChangesToYOps(batch);
    expect(ops[0]).toEqual({ drop: { path: 'trip' } });
  });

  it('converts mixed batch in order', () => {
    const batch: TreeChangeBatch = {
      changes: [
        {
          action: 'add',
          parent_path: '',
          node: { key: 'hotel', slots: { name: 'Hilton' }, children: [] },
        },
        {
          action: 'update',
          target_path: 'hotel',
          slots: { stars: 5 },
        },
        { action: 'remove', target_path: 'old_hotel' },
      ],
    };
    const ops = treeChangesToYOps(batch);
    expect(ops).toHaveLength(3);
    expect('add' in ops[0]).toBe(true);
    expect('set' in ops[1]).toBe(true);
    expect('drop' in ops[2]).toBe(true);
  });

  it('converts new_relations to relate YOps', () => {
    const batch: TreeChangeBatch = {
      changes: [],
      new_relations: [{ from: 'trip', to: 'hotel', type: 'depends' }],
    };
    const ops = treeChangesToYOps(batch);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({
      relate: { from: 'trip', to: 'hotel', type: 'depends' },
    });
  });

  it('converts remove_relations to unrelate YOps', () => {
    const batch: TreeChangeBatch = {
      changes: [],
      remove_relations: [{ from: 'trip', to: 'hotel', type: 'depends' }],
    };
    const ops = treeChangesToYOps(batch);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({
      unrelate: { from: 'trip', to: 'hotel', type: 'depends' },
    });
  });

  it('returns empty array for empty batch', () => {
    expect(treeChangesToYOps({ changes: [] })).toEqual([]);
  });
});
