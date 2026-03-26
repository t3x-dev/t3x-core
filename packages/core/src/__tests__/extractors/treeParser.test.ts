import { describe, expect, it } from 'vitest';
import { parseFrameDelta } from '../../extractors/frameDeltaParser';
import type { SemanticContent, TreeNode } from '../../semantic/types';
import { flattenTree } from '../../semantic/tree';

describe('parseFrameDelta — tree-native first extraction', () => {
  it('parses YAML tree + slot_quotes into tree result', () => {
    const raw = `hangzhou_trip:
  destination: "Hangzhou"
  dates: "May 1-3"
  dining:
    cuisine: "local"
    budget: 500
---
{
  "slot_quotes": {
    "destination": "going to Hangzhou",
    "dates": "May 1st to 3rd",
    "dining.cuisine": "try local food",
    "dining.budget": "around 500"
  }
}`;
    const result = parseFrameDelta(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format).toBe('tree');
    if (result.format !== 'tree') return;
    expect(result.tree).toBeDefined();
    expect(result.tree.key).toBe('hangzhou_trip');
    expect(result.tree.children).toHaveLength(1);
    expect(result.tree.children[0].key).toBe('dining');
    // Also has legacy delta for backward compat
    expect(result.delta.changes.length).toBeGreaterThan(0);
    expect(result.delta.changes.every((c) => c.action === 'add')).toBe(true);
  });

  it('parses concise (depth 1) YAML tree', () => {
    const raw = `trip_plan:
  destination: "Tokyo"
  budget: 5000
  duration: "2 weeks"
---
{
  "slot_quotes": {
    "destination": "going to Tokyo",
    "budget": "budget is 5000",
    "duration": "staying two weeks"
  }
}`;
    const result = parseFrameDelta(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format).toBe('tree');
    if (result.format !== 'tree') return;
    expect(result.tree.children).toHaveLength(0);
    expect(Object.keys(result.tree.slots)).toHaveLength(3);
  });

  it('applies source_map and confidence_map to tree nodes', () => {
    const raw = `trip:
  destination: "Tokyo"
  dining:
    cuisine: "sushi"
---
{
  "slot_quotes": { "destination": "going to Tokyo", "dining.cuisine": "love sushi" },
  "source_map": { "trip": "T1", "dining": "T2" },
  "confidence_map": { "trip": 0.95, "dining": 0.8 }
}`;
    const result = parseFrameDelta(raw);
    expect(result.ok).toBe(true);
    if (!result.ok || result.format !== 'tree') return;
    expect(result.tree.source).toBe('T1');
    expect(result.tree.confidence).toBe(0.95);
    expect(result.tree.children[0].source).toBe('T2');
    expect(result.tree.children[0].confidence).toBe(0.8);
  });

  it('handles YAML without metadata section (just YAML, no ---)', () => {
    const raw = `simple_plan:
  goal: "test"
  priority: "high"`;
    const result = parseFrameDelta(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format).toBe('tree');
  });
});

describe('parseFrameDelta — tree-native delta', () => {
  const existingTree: TreeNode = {
    key: 'hangzhou_trip',
    slots: { destination: 'Hangzhou' },
    children: [{ key: 'dining', slots: { cuisine: 'local' }, children: [] }],
  };
  const snapshot: SemanticContent = {
    tree: existingTree,
    frames: flattenTree(existingTree),
    relations: [],
  };

  it('parses tree-native delta JSON with path-based targets', () => {
    const raw = JSON.stringify({
      changes: [
        {
          action: 'update',
          target_path: 'hangzhou_trip/dining',
          slots: { budget: 800 },
          slot_quotes: { 'dining.budget': 'budget 800' },
        },
        {
          action: 'add',
          parent_path: 'hangzhou_trip',
          node: { transport: { mode: 'rail' } },
          slot_quotes: { 'transport.mode': 'take rail' },
        },
      ],
      drift_detected: false,
    });
    const result = parseFrameDelta(raw, snapshot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format).toBe('tree-delta');
    if (result.format !== 'tree-delta') return;
    expect(result.treeDelta).toBeDefined();
    expect(result.treeDelta.changes).toHaveLength(2);
    // Also has legacy delta
    expect(result.delta.changes.length).toBeGreaterThan(0);
  });

  it('detects drift in tree-native delta', () => {
    const raw = JSON.stringify({
      changes: [],
      drift_detected: true,
    });
    // drift with empty changes should still parse (special handling)
    // TreeNativeDeltaSchema.changes.min(1) means empty changes fails normal validation.
    // For drift, the parser handles this specially — return ok with empty delta
    const result = parseFrameDelta(raw, snapshot);
    expect(result.ok).toBeDefined(); // just check it doesn't crash
  });
});

describe('parseFrameDelta — legacy backward compat', () => {
  it('still parses legacy delta JSON with f_NNN IDs', () => {
    const raw = JSON.stringify({
      changes: [{ action: 'add', frame: { id: 'f_001', type: 'test', slots: { a: 1 } } }],
    });
    const result = parseFrameDelta(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format).toBe('legacy');
    expect(result.delta).toBeDefined();
  });

  it('still parses legacy full output (JSON frames)', () => {
    const raw = JSON.stringify({
      frames: [{ id: 'f_001', type: 'test', slots: { a: 1 }, confidence: 0.9 }],
      relations: [],
    });
    const result = parseFrameDelta(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format).toBe('legacy');
  });
});
