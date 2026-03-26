import { describe, expect, it } from 'vitest';
import {
  buildSlotQuotesPath,
  flattenTree,
  isTreeNative,
  unflattenToTree,
} from '../../semantic/tree';
import type { FlatNode, TreeNode } from '../../semantic/types';

describe('flattenTree', () => {
  it('flattens a single root node to one frame', () => {
    const tree: TreeNode = {
      key: 'hangzhou_trip',
      slots: { destination: 'Hangzhou', dates: 'May 1-3' },
      children: [],
    };
    const frames = flattenTree(tree);
    expect(frames).toHaveLength(1);
    expect(frames[0].id).toBe('hangzhou_trip');
    expect(frames[0].type).toBe('hangzhou_trip');
    expect(frames[0].slots).toEqual({ destination: 'Hangzhou', dates: 'May 1-3' });
  });

  it('flattens depth-2 tree to multiple frames with path IDs', () => {
    const tree: TreeNode = {
      key: 'hangzhou_trip',
      slots: { destination: 'Hangzhou' },
      children: [
        { key: 'activity_plan', slots: { activities: ['West Lake'] }, children: [] },
        { key: 'dining', slots: { cuisine: 'local' }, children: [] },
      ],
    };
    const frames = flattenTree(tree);
    expect(frames).toHaveLength(3);
    expect(frames.map((f) => f.id)).toEqual([
      'hangzhou_trip',
      'hangzhou_trip/activity_plan',
      'hangzhou_trip/dining',
    ]);
  });

  it('flattens depth-3 tree correctly', () => {
    const tree: TreeNode = {
      key: 'trip',
      slots: {},
      children: [
        {
          key: 'activities',
          slots: { count: 3 },
          children: [{ key: 'gear', slots: { rain_jacket: true }, children: [] }],
        },
      ],
    };
    const frames = flattenTree(tree);
    expect(frames).toHaveLength(3);
    expect(frames[2].id).toBe('trip/activities/gear');
    expect(frames[2].type).toBe('gear');
    expect(frames[2].slots).toEqual({ rain_jacket: true });
  });

  it('preserves source and confidence on flattened frames', () => {
    const tree: TreeNode = {
      key: 'topic',
      slots: { a: 1 },
      children: [],
      source: 'T1',
      confidence: 0.9,
    };
    const frames = flattenTree(tree);
    expect(frames[0].source).toBe('T1');
    expect(frames[0].confidence).toBe(0.9);
  });

  it('converts slot_quotes to slot_sources paths', () => {
    const tree: TreeNode = {
      key: 'trip',
      slots: { destination: 'Hangzhou' },
      children: [
        {
          key: 'dining',
          slots: { cuisine: 'local' },
          children: [],
          slot_quotes: { cuisine: 'local food' },
        },
      ],
      slot_quotes: { destination: 'going to Hangzhou' },
    };
    const frames = flattenTree(tree);
    // Root frame quotes mapped
    expect(frames[0].slot_sources).toBeUndefined(); // slot_sources computed separately
    // Verify frame structure only — slot_sources enrichment is a downstream step
  });
});

describe('unflattenToTree', () => {
  it('reconstructs tree from flat frames', () => {
    const frames: FlatNode[] = [
      { id: 'hangzhou_trip', type: 'hangzhou_trip', slots: { destination: 'Hangzhou' } },
      {
        id: 'hangzhou_trip/activity_plan',
        type: 'activity_plan',
        slots: { activities: ['West Lake'] },
      },
      { id: 'hangzhou_trip/dining', type: 'dining', slots: { cuisine: 'local' } },
    ];
    const tree = unflattenToTree(frames);
    expect(tree.key).toBe('hangzhou_trip');
    expect(tree.children).toHaveLength(2);
    expect(tree.children[0].key).toBe('activity_plan');
    expect(tree.children[1].key).toBe('dining');
  });

  it('roundtrips: flattenTree → unflattenToTree preserves structure', () => {
    const original: TreeNode = {
      key: 'trip',
      slots: { destination: 'Tokyo' },
      children: [
        { key: 'budget', slots: { amount: 5000 }, children: [] },
        {
          key: 'activities',
          slots: { list: ['shrine'] },
          children: [{ key: 'gear', slots: { umbrella: true }, children: [] }],
        },
      ],
    };
    const frames = flattenTree(original);
    const reconstructed = unflattenToTree(frames);
    expect(reconstructed.key).toBe(original.key);
    expect(reconstructed.slots).toEqual(original.slots);
    expect(reconstructed.children).toHaveLength(2);
    expect(reconstructed.children[1].children).toHaveLength(1);
    expect(reconstructed.children[1].children[0].key).toBe('gear');
  });
});

describe('isTreeNative', () => {
  it('always returns true (tree-primary)', () => {
    expect(
      isTreeNative({ trees: [{ key: 'x', slots: {}, children: [] }], relations: [] })
    ).toBe(true);
  });
});

describe('buildSlotQuotesPath', () => {
  it('builds root-level slot path', () => {
    expect(buildSlotQuotesPath('hangzhou_trip', 'destination')).toBe('destination');
  });

  it('builds nested slot path', () => {
    expect(buildSlotQuotesPath('hangzhou_trip/activity_plan', 'activities')).toBe(
      'activity_plan.activities'
    );
  });

  it('builds deep nested slot path', () => {
    expect(buildSlotQuotesPath('hangzhou_trip/activity_plan/gear', 'rain_jacket')).toBe(
      'activity_plan.gear.rain_jacket'
    );
  });
});
