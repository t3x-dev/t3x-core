import { describe, expect, it } from 'vitest';
import { parseYOpsOutput } from '../../extractors/yopsParser';

// ── First Extraction (YAML Tree) Tests ──

describe('parseYOpsOutput — YAML tree (first extraction)', () => {
  it('parses YAML tree with metadata → format tree, define + populate ops', () => {
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
  }
}`;

    const result = parseYOpsOutput(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.format).toBe('tree');
    if (result.format !== 'tree') return;

    // Should produce define + populate
    expect(result.yops).toHaveLength(2);
    const defineOp = result.yops[0];
    expect('define' in defineOp).toBe(true);
    if (!('define' in defineOp)) return;
    expect(defineOp.define.path).toBe('trip');

    const populateOp = result.yops[1];
    expect('populate' in populateOp).toBe(true);
    if (!('populate' in populateOp)) return;
    expect(populateOp.populate.path).toBe('trip');
    expect(populateOp.populate.values).toEqual({ destination: 'Hangzhou', budget: 2000 });

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

    // define + populate
    expect(result.yops).toHaveLength(2);
    const defineOp = result.yops[0];
    expect('define' in defineOp).toBe(true);
    if (!('define' in defineOp)) return;
    expect(defineOp.define.path).toBe('project');

    const populateOp = result.yops[1];
    expect('populate' in populateOp).toBe(true);
    if (!('populate' in populateOp)) return;
    expect(populateOp.populate.values).toEqual({ name: 'T3X', status: 'active' });
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

    // Should produce define+populate for root, define+populate for child = 4 ops
    expect(result.yops.length).toBeGreaterThanOrEqual(3); // at least define(travel) + populate(travel) + define(dining)
    expect('define' in result.yops[0]).toBe(true);
  });

  it('extracts slot_quotes from JSON block into slotQuotes result', () => {
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

    // Tree nodes no longer carry slot_quotes — they're in the result's slotQuotes map only
    expect(result.tree).not.toHaveProperty('slot_quotes');
    expect(result.tree.children[0]).not.toHaveProperty('slot_quotes');

    // slotQuotes are extracted from the JSON block directly
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
    }

    const second = result.yops[1];
    expect('drop' in second).toBe(true);
    if ('drop' in second) {
      expect(second.drop.path).toBe('trip/old_plan');
    }
  });

  it('parses define + populate operations', () => {
    const raw = `yops:
  - define:
      path: trip/dining
  - populate:
      path: trip/dining
      values:
        cuisine: sushi`;

    const result = parseYOpsOutput(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.format).toBe('yops');
    expect(result.yops).toHaveLength(2);

    const defineOp = result.yops[0];
    expect('define' in defineOp).toBe(true);
    if ('define' in defineOp) {
      expect(defineOp.define.path).toBe('trip/dining');
    }

    const populateOp = result.yops[1];
    expect('populate' in populateOp).toBe(true);
    if ('populate' in populateOp) {
      expect(populateOp.populate.path).toBe('trip/dining');
      expect(populateOp.populate.values).toEqual({ cuisine: 'sushi' });
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
    const raw = '```yaml\nyops:\n  - set:\n      path: trip/budget\n      value: 3000\n```';

    const result = parseYOpsOutput(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.format).toBe('yops');
    expect(result.yops).toHaveLength(1);
  });

  it('skips invalid operations instead of failing entire parse', () => {
    const raw = `yops:
  - set:
      path: trip/budget`;

    // Missing required field: value — op is skipped, parse succeeds
    const result = parseYOpsOutput(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.yops).toHaveLength(0); // invalid op skipped
    }
  });
});

// ── All 13 Op Types — Parser Round-Trip Tests ──

describe('parseYOpsOutput — all 13 op types', () => {
  it('parses unset op', () => {
    const raw = `yops:
  - unset:
      path: trip/budget`;
    const result = parseYOpsOutput(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.yops).toHaveLength(1);
    expect('unset' in result.yops[0]).toBe(true);
    if ('unset' in result.yops[0]) {
      expect(result.yops[0].unset.path).toBe('trip/budget');
    }
  });

  it('parses rename op', () => {
    const raw = `yops:
  - rename:
      path: accom
      to: accommodation`;
    const result = parseYOpsOutput(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect('rename' in result.yops[0]).toBe(true);
    if ('rename' in result.yops[0]) {
      expect(result.yops[0].rename.path).toBe('accom');
      expect(result.yops[0].rename.to).toBe('accommodation');
    }
  });

  it('parses move op', () => {
    const raw = `yops:
  - move:
      from: hotel
      to: trip/hotel`;
    const result = parseYOpsOutput(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect('move' in result.yops[0]).toBe(true);
    if ('move' in result.yops[0]) {
      expect(result.yops[0].move.from).toBe('hotel');
      expect(result.yops[0].move.to).toBe('trip/hotel');
    }
  });

  it('parses clone op', () => {
    const raw = `yops:
  - clone:
      from: trip_plan
      to: trip_plan_copy`;
    const result = parseYOpsOutput(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect('clone' in result.yops[0]).toBe(true);
    if ('clone' in result.yops[0]) {
      expect(result.yops[0].clone.from).toBe('trip_plan');
      expect(result.yops[0].clone.to).toBe('trip_plan_copy');
    }
  });

  it('parses nest op', () => {
    const raw = `yops:
  - nest:
      path: trip
      keys:
        - flight
        - hotel
      under: logistics`;
    const result = parseYOpsOutput(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect('nest' in result.yops[0]).toBe(true);
    if ('nest' in result.yops[0]) {
      expect(result.yops[0].nest.keys).toEqual(['flight', 'hotel']);
      expect(result.yops[0].nest.under).toBe('logistics');
    }
  });

  it('parses split op', () => {
    const raw = `yops:
  - split:
      path: trip
      into:
        budget_info:
          - budget
          - currency
        timeline:
          - start_date`;
    const result = parseYOpsOutput(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect('split' in result.yops[0]).toBe(true);
    if ('split' in result.yops[0]) {
      expect(result.yops[0].split.path).toBe('trip');
      expect(result.yops[0].split.into).toEqual({
        budget_info: ['budget', 'currency'],
        timeline: ['start_date'],
      });
    }
  });

  it('parses fold op', () => {
    const raw = `yops:
  - fold:
      path: wrapper`;
    const result = parseYOpsOutput(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect('fold' in result.yops[0]).toBe(true);
    if ('fold' in result.yops[0]) {
      expect(result.yops[0].fold.path).toBe('wrapper');
    }
  });

  it('parses merge op', () => {
    const raw = `yops:
  - merge:
      path: trip
      keys:
        - hotel_a
        - hotel_b
      into: accommodation`;
    const result = parseYOpsOutput(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect('merge' in result.yops[0]).toBe(true);
    if ('merge' in result.yops[0]) {
      expect(result.yops[0].merge.keys).toEqual(['hotel_a', 'hotel_b']);
      expect(result.yops[0].merge.into).toBe('accommodation');
    }
  });

  it('parses relate op', () => {
    const raw = `yops:
  - relate:
      from: trip
      to: budget
      type: depends`;
    const result = parseYOpsOutput(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect('relate' in result.yops[0]).toBe(true);
    if ('relate' in result.yops[0]) {
      expect(result.yops[0].relate.from).toBe('trip');
      expect(result.yops[0].relate.to).toBe('budget');
      expect(result.yops[0].relate.type).toBe('depends');
    }
  });

  it('parses unrelate op', () => {
    const raw = `yops:
  - unrelate:
      from: trip
      to: budget
      type: depends`;
    const result = parseYOpsOutput(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect('unrelate' in result.yops[0]).toBe(true);
    if ('unrelate' in result.yops[0]) {
      expect(result.yops[0].unrelate.from).toBe('trip');
      expect(result.yops[0].unrelate.to).toBe('budget');
      expect(result.yops[0].unrelate.type).toBe('depends');
    }
  });

  it('parses mixed batch with all content ops', () => {
    const raw = `yops:
  - define:
      path: trip
  - populate:
      path: trip
      values:
        budget: 5000
  - set:
      path: trip/style
      value: casual
  - unset:
      path: trip/budget
  - drop:
      path: trip
  - rename:
      path: hotel
      to: accommodation
  - relate:
      from: trip
      to: hotel
      type: depends`;
    const result = parseYOpsOutput(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.yops).toHaveLength(7);
    expect('define' in result.yops[0]).toBe(true);
    expect('populate' in result.yops[1]).toBe(true);
    expect('set' in result.yops[2]).toBe(true);
    expect('unset' in result.yops[3]).toBe(true);
    expect('drop' in result.yops[4]).toBe(true);
    expect('rename' in result.yops[5]).toBe(true);
    expect('relate' in result.yops[6]).toBe(true);
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
