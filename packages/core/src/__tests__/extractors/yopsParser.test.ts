import { describe, expect, it } from 'vitest';
import { parseYOpsOutput } from '../../extractors/yopsParser';

// ── First Extraction (YAML Tree) Tests ──

describe('parseYOpsOutput — YAML tree (first extraction)', () => {
  it('parses YAML tree with metadata → format tree, 1 add op', () => {
    const raw = `trip:
  destination: Hangzhou
  budget: 2000
---
{
  "slot_quotes": {
    "destination": "I want to go to Hangzhou",
    "budget": "about 2000 yuan"
  },
  "source_map": {
    "trip": "T1"
  },
  "confidence_map": {
    "trip": 0.95
  }
}`;

    const result = parseYOpsOutput(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.format).toBe('tree');
    if (result.format !== 'tree') return;

    expect(result.yops).toHaveLength(1);
    const op = result.yops[0];
    expect('add' in op).toBe(true);
    if (!('add' in op)) return;

    expect(op.add.parent).toBe('');
    expect(op.add.from).toBe('T1');
    expect(op.add.confidence).toBe(0.95);
    expect(op.add.node).toEqual({
      trip: { destination: 'Hangzhou', budget: 2000 },
    });
    expect(op.add.source).toEqual({
      destination: 'I want to go to Hangzhou',
      budget: 'about 2000 yuan',
    });

    // Tree structure
    expect(result.tree.key).toBe('trip');
    expect(result.tree.slots).toEqual({ destination: 'Hangzhou', budget: 2000 });
  });

  it('parses YAML tree without metadata (no --- separator)', () => {
    const raw = `project:
  name: T3X
  status: active`;

    const result = parseYOpsOutput(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.format).toBe('tree');
    if (result.format !== 'tree') return;

    expect(result.yops).toHaveLength(1);
    const op = result.yops[0];
    expect('add' in op).toBe(true);
    if (!('add' in op)) return;

    expect(op.add.parent).toBe('');
    expect(op.add.from).toBe('T1'); // default when no source_map
    expect(op.add.node).toEqual({
      project: { name: 'T3X', status: 'active' },
    });
  });

  it('handles nested children in YAML tree', () => {
    const raw = `travel:
  destination: Tokyo
  dining:
    cuisine: sushi
    budget: 500`;

    const result = parseYOpsOutput(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.format).toBe('tree');
    if (result.format !== 'tree') return;

    // Tree has children
    expect(result.tree.key).toBe('travel');
    expect(result.tree.children).toHaveLength(1);
    expect(result.tree.children[0].key).toBe('dining');
    expect(result.tree.children[0].slots).toEqual({ cuisine: 'sushi', budget: 500 });

    // add op node includes nested structure
    const op = result.yops[0];
    expect('add' in op).toBe(true);
    if (!('add' in op)) return;
    expect(op.add.node).toEqual({
      travel: {
        destination: 'Tokyo',
        dining: { cuisine: 'sushi', budget: 500 },
      },
    });
  });

  it('applies slot_quotes to tree nodes', () => {
    const raw = `trip:
  destination: Hangzhou
  dining:
    cuisine: local
---
{
  "slot_quotes": {
    "destination": "headed to Hangzhou",
    "dining.cuisine": "local Hangzhou food"
  }
}`;

    const result = parseYOpsOutput(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.format).toBe('tree');
    if (result.format !== 'tree') return;

    // Root node slot_quotes
    expect(result.tree.slot_quotes).toEqual({ destination: 'headed to Hangzhou' });
    // Child node slot_quotes
    expect(result.tree.children[0].slot_quotes).toEqual({ cuisine: 'local Hangzhou food' });

    // slotQuotes in result
    expect(result.slotQuotes).toEqual({
      destination: 'headed to Hangzhou',
      'dining.cuisine': 'local Hangzhou food',
    });
  });
});

// ── Incremental (YOps List) Tests ──

describe('parseYOpsOutput — yops list (incremental)', () => {
  it('parses yops list with set/drop → correct count', () => {
    const raw = `yops:
  - set:
      path: trip/budget
      value: 2000
      source: "budget is 2000"
      from: T3
  - drop:
      path: trip/old_plan`;

    const result = parseYOpsOutput(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.format).toBe('yops');
    expect(result.yops).toHaveLength(2);

    const first = result.yops[0];
    expect('set' in first).toBe(true);
    if ('set' in first) {
      expect(first.set.path).toBe('trip/budget');
      expect(first.set.value).toBe(2000);
      expect(first.set.from).toBe('T3');
    }

    const second = result.yops[1];
    expect('drop' in second).toBe(true);
    if ('drop' in second) {
      expect(second.drop.path).toBe('trip/old_plan');
    }
  });

  it('parses add operation with nested node', () => {
    const raw = `yops:
  - add:
      parent: trip
      node:
        dining:
          cuisine: sushi
      source:
        cuisine: "wants sushi"
      from: T2`;

    const result = parseYOpsOutput(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.format).toBe('yops');
    expect(result.yops).toHaveLength(1);

    const op = result.yops[0];
    expect('add' in op).toBe(true);
    if ('add' in op) {
      expect(op.add.parent).toBe('trip');
      expect(op.add.node).toEqual({ dining: { cuisine: 'sushi' } });
      expect(op.add.from).toBe('T2');
    }
  });

  it('empty yops list (drift detection) → returns empty array', () => {
    const raw = `yops: []`;

    const result = parseYOpsOutput(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.format).toBe('yops');
    expect(result.yops).toHaveLength(0);
  });

  it('strips markdown fences', () => {
    const raw = '```yaml\nyops:\n  - set:\n      path: trip/budget\n      value: 3000\n      source: "updated budget"\n      from: T4\n```';

    const result = parseYOpsOutput(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.format).toBe('yops');
    expect(result.yops).toHaveLength(1);
  });

  it('validates operations against schema (rejects invalid)', () => {
    const raw = `yops:
  - set:
      path: trip/budget`;

    // Missing required fields: value, source, from
    const result = parseYOpsOutput(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Invalid yop');
    }
  });
});

// ── Error Tests ──

describe('parseYOpsOutput — errors', () => {
  it('invalid YAML returns ok: false', () => {
    const raw = `yops:
  - set:
      path: [invalid
      unclosed`;

    const result = parseYOpsOutput(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('YAML parse error');
    }
  });

  it('missing yops key returns ok: false when not a valid tree', () => {
    // Not a YAML tree (starts with non-snake_case), not a yops list
    const raw = `Some random text that is not YAML
and has no structure`;

    const result = parseYOpsOutput(raw);
    expect(result.ok).toBe(false);
  });

  it('object without yops key parsed as YAML fails fallback', () => {
    // Starts with uppercase — not a YAML tree, not yops, fallback tries yops parse
    const raw = `Operations:
  - set:
      path: foo`;

    const result = parseYOpsOutput(raw);
    expect(result.ok).toBe(false);
  });

  it('empty input returns ok: false', () => {
    const result = parseYOpsOutput('');
    expect(result.ok).toBe(false);
  });
});
