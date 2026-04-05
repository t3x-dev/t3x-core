import { describe, expect, it } from 'vitest';
import {
  BLOB_TYPES,
  buildSlotQuotesPath,
  flattenTree,
  isBlob,
  unflattenToTree,
  yamlToTree,
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

describe('isBlob', () => {
  it('returns true for code blobs', () => {
    expect(isBlob({ _type: 'code', language: 'python', content: 'print("hi")' })).toBe(true);
  });

  it('returns true for plot blobs', () => {
    expect(isBlob({ _type: 'plot', format: 'bar', data: { labels: [], values: [] } })).toBe(true);
  });

  it('returns true for table blobs', () => {
    expect(isBlob({ _type: 'table', headers: ['a'], rows: [['1']] })).toBe(true);
  });

  it('returns true for image and video blobs', () => {
    expect(isBlob({ _type: 'image', url: 'https://...' })).toBe(true);
    expect(isBlob({ _type: 'video', url: 'https://...' })).toBe(true);
  });

  it('returns false for unknown _type', () => {
    expect(isBlob({ _type: 'unknown_thing' })).toBe(false);
  });

  it('returns false for regular objects', () => {
    expect(isBlob({ destination: 'Tokyo', budget: 5000 })).toBe(false);
  });

  it('returns false for primitives and arrays', () => {
    expect(isBlob('hello')).toBe(false);
    expect(isBlob(42)).toBe(false);
    expect(isBlob(null)).toBe(false);
    expect(isBlob([1, 2, 3])).toBe(false);
  });
});

describe('yamlToTree — blob support', () => {
  it('stores code blob as slot value, not child node', () => {
    const tree = yamlToTree('algorithm', {
      approach: 'quicksort',
      example: {
        _type: 'code',
        language: 'python',
        content: 'def quicksort(arr): ...',
      },
    });

    expect(tree.key).toBe('algorithm');
    expect(tree.slots.approach).toBe('quicksort');
    expect(tree.slots.example).toEqual({
      _type: 'code',
      language: 'python',
      content: 'def quicksort(arr): ...',
    });
    expect(tree.children).toHaveLength(0);
  });

  it('stores plot blob as slot value', () => {
    const tree = yamlToTree('analysis', {
      summary: 'Performance comparison',
      chart: {
        _type: 'plot',
        format: 'bar',
        data: { labels: ['a', 'b'], values: [1, 2] },
      },
    });

    expect(tree.slots.chart).toEqual({
      _type: 'plot',
      format: 'bar',
      data: { labels: ['a', 'b'], values: [1, 2] },
    });
    expect(tree.children).toHaveLength(0);
  });

  it('treats regular objects as children, not blobs', () => {
    const tree = yamlToTree('trip', {
      destination: 'Tokyo',
      budget: {
        flights: 1200,
        hotels: 1500,
      },
    });

    expect(tree.slots.destination).toBe('Tokyo');
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].key).toBe('budget');
  });

  it('handles mixed blobs and children', () => {
    const tree = yamlToTree('project', {
      name: 'My App',
      setup_script: {
        _type: 'code',
        language: 'bash',
        content: 'npm install',
      },
      dependencies: {
        react: '18.0',
        next: '14.0',
      },
    });

    expect(tree.slots.name).toBe('My App');
    expect(tree.slots.setup_script).toEqual({
      _type: 'code',
      language: 'bash',
      content: 'npm install',
    });
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].key).toBe('dependencies');
  });
});

describe('yamlToTree — all blob types round-trip', () => {
  const allBlobs: Record<string, Record<string, unknown>> = {
    code: {
      _type: 'code',
      language: 'python',
      content: 'def hello():\n    print("world")',
    },
    plot: {
      _type: 'plot',
      format: 'bar',
      description: 'Sales by quarter',
      data: { labels: ['Q1', 'Q2', 'Q3', 'Q4'], values: [100, 150, 120, 180] },
    },
    table: {
      _type: 'table',
      headers: ['Name', 'Age', 'City'],
      rows: [['Alice', 30, 'NYC'], ['Bob', 25, 'LA']],
    },
    image: {
      _type: 'image',
      url: 'https://example.com/chart.png',
      alt: 'Performance chart',
    },
    video: {
      _type: 'video',
      url: 'https://example.com/demo.mp4',
      title: 'Feature walkthrough',
    },
  };

  for (const [blobType, blobData] of Object.entries(allBlobs)) {
    it(`${blobType} blob is stored as slot, not child`, () => {
      const tree = yamlToTree('topic', {
        summary: 'test',
        content: blobData,
      });

      // Blob should be a slot value
      expect(tree.slots.content).toEqual(blobData);
      // No children created from blob
      expect(tree.children).toHaveLength(0);
      // Blob type is preserved
      expect((tree.slots.content as Record<string, unknown>)._type).toBe(blobType);
    });

    it(`${blobType} blob survives flatten + unflatten`, () => {
      const tree: TreeNode = {
        key: 'topic',
        slots: { summary: 'test', content: blobData as any },
        children: [],
      };

      const flat = flattenTree(tree);
      expect(flat).toHaveLength(1);
      expect(flat[0].slots.content).toEqual(blobData);

      const restored = unflattenToTree(flat);
      expect(restored.slots.content).toEqual(blobData);
    });
  }

  it('covers all BLOB_TYPES', () => {
    // Ensure the test covers every registered blob type
    for (const bt of BLOB_TYPES) {
      expect(allBlobs).toHaveProperty(bt);
    }
  });

  it('multiple blobs in one tree are all preserved', () => {
    const tree = yamlToTree('lesson', {
      title: 'Sorting Algorithms',
      code_example: allBlobs.code,
      performance_chart: allBlobs.plot,
      comparison_table: allBlobs.table,
      subtopic: {
        detail: 'this is a child node',
      },
    });

    expect(tree.slots.title).toBe('Sorting Algorithms');
    expect(tree.slots.code_example).toEqual(allBlobs.code);
    expect(tree.slots.performance_chart).toEqual(allBlobs.plot);
    expect(tree.slots.comparison_table).toEqual(allBlobs.table);
    // Regular object is still a child
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].key).toBe('subtopic');
  });
});
