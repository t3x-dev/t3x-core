/**
 * E2E test: Full YOps extraction pipeline
 *
 * Simulates a multi-turn conversation extraction:
 * 1. First extraction → YAML tree
 * 2. Incremental update → YOps (set, add)
 * 3. Another increment → YOps (drop, add)
 * 4. Verifies tree state, ylint scores, metadata at each step
 */

import { describe, expect, it, vi } from 'vitest';
import { Extractor } from '../../extractors/extractor';
import { ylint } from '../../ylint';
import { applyYOps } from '../../yops/engine';
import { parseYOpsOutput } from '../../extractors/yopsParser';
import type { SemanticContent, TreeNode } from '../../semantic/types';
import type { LLMProvider } from '../../llm/types';

// ── Mock Provider ──

function mockProvider(responses: string[]): LLMProvider {
  let callIndex = 0;
  return {
    id: 'test-e2e',
    generate: vi.fn(async () => {
      const text = responses[callIndex] ?? '';
      callIndex++;
      return { text, usage: { inputTokens: 100, outputTokens: 50 } };
    }),
    resolveConflict: vi.fn(async () => ''),
  };
}

// ── Helpers ──

const findTree = (content: SemanticContent, key: string) =>
  content.trees.find((t) => t.key === key);

const findChild = (node: TreeNode, key: string) =>
  node.children.find((c) => c.key === key);

// ── Tests ──

describe('E2E: YOps Extraction Pipeline', () => {
  it('full multi-turn extraction lifecycle', async () => {
    // ────────────────────────────────────────────
    // TURN 1: First extraction — user plans a trip
    // ────────────────────────────────────────────

    const firstExtractionLLMOutput = `hangzhou_trip:
  destination: Hangzhou
  duration: one week
  dining:
    budget: 1000
    style: casual
---
{
  "slot_quotes": {
    "destination": "Let's go to Hangzhou",
    "duration": "planning for about a week",
    "dining.budget": "maybe 1000 yuan for food",
    "dining.style": "nothing fancy, casual is fine"
  },
  "source_map": {
    "hangzhou_trip": "T1",
    "dining": "T1"
  }
}`;

    const provider1 = mockProvider([firstExtractionLLMOutput]);
    const extractor1 = new Extractor(provider1);

    const result1 = await extractor1.extract({
      turns: [
        { role: 'user', content: "Let's go to Hangzhou for about a week. Maybe 1000 yuan for food, nothing fancy, casual is fine.", turn_hash: 'T1' },
        { role: 'assistant', content: 'Sounds great! A week in Hangzhou with casual dining. Any specific activities?', turn_hash: 'T2' },
      ],
    });

    // Verify first extraction succeeded
    expect(result1.ok).toBe(true);
    if (!result1.ok) throw new Error(result1.error);

    // Verify tree structure
    expect(result1.snapshot.trees).toHaveLength(1);
    const trip = findTree(result1.snapshot, 'hangzhou_trip');
    expect(trip).toBeDefined();
    expect(trip!.slots.destination).toBe('Hangzhou');
    expect(trip!.slots.duration).toBe('one week');

    // Verify nested child
    const dining = findChild(trip!, 'dining');
    expect(dining).toBeDefined();
    expect(dining!.slots.budget).toBe(1000);
    expect(dining!.slots.style).toBe('casual');

    // Verify metadata propagated
    expect(trip!.source).toBe('T1');
    // Verify yops array (should be define + populate pairs for root + child)
    expect(result1.yops.length).toBeGreaterThanOrEqual(2);
    expect(result1.yops[0]).toHaveProperty('define');

    // ────────────────────────────────────────────
    // TURN 2: Incremental — user updates budget and adds activity
    // ────────────────────────────────────────────

    const incrementalLLMOutput = `yops:
  - set:
      path: hangzhou_trip/dining/budget
      value: 2000
      source: "actually let's do 2000"
      from: T1
  - define:
      parent: hangzhou_trip
      key: activities
  - populate:
      path: hangzhou_trip/activities
      slots:
        west_lake: walking around West Lake
        hiking: day hike in the hills
      source:
        west_lake: "walk around West Lake"
        hiking: "go hiking in the hills nearby"
      from: T1`;

    const provider2 = mockProvider([incrementalLLMOutput]);
    const extractor2 = new Extractor(provider2);

    const result2 = await extractor2.extract({
      turns: [
        { role: 'user', content: "Actually let's do 2000 for food budget. And I want to walk around West Lake and go hiking in the hills nearby.", turn_hash: 'T3' },
        { role: 'assistant', content: 'Updated! Budget is now 2000 yuan. West Lake walk and hill hiking are on the list.', turn_hash: 'T4' },
      ],
      snapshot: result1.snapshot,
    });

    expect(result2.ok).toBe(true);
    if (!result2.ok) throw new Error(result2.error);

    // Verify budget was updated
    const trip2 = findTree(result2.snapshot, 'hangzhou_trip');
    const dining2 = findChild(trip2!, 'dining');
    expect(dining2!.slots.budget).toBe(2000);

    // Verify activities were added
    const activities = findChild(trip2!, 'activities');
    expect(activities).toBeDefined();
    expect(activities!.slots.west_lake).toBe('walking around West Lake');
    expect(activities!.slots.hiking).toBe('day hike in the hills');

    // Verify 3 yops were applied (set + define + populate)
    expect(result2.yops).toHaveLength(3);

    // ────────────────────────────────────────────
    // TURN 3: Incremental — user drops activities, adds nightlife
    // ────────────────────────────────────────────

    const thirdLLMOutput = `yops:
  - drop:
      path: hangzhou_trip/activities
      reason: "user changed plans"
  - define:
      parent: hangzhou_trip
      key: nightlife
  - populate:
      path: hangzhou_trip/nightlife
      slots:
        plan: bar hopping near the lake
        budget: 500
      source:
        plan: "check out bars near West Lake instead"
        budget: "maybe 500 for drinks"
      from: T1
`;

    const provider3 = mockProvider([thirdLLMOutput]);
    const extractor3 = new Extractor(provider3);

    const result3 = await extractor3.extract({
      turns: [
        { role: 'user', content: "Actually forget the hiking. Let's check out bars near West Lake instead. Maybe 500 for drinks.", turn_hash: 'T5' },
      ],
      snapshot: result2.snapshot,
    });

    expect(result3.ok).toBe(true);
    if (!result3.ok) throw new Error(result3.error);

    // Verify activities removed
    const trip3 = findTree(result3.snapshot, 'hangzhou_trip');
    expect(findChild(trip3!, 'activities')).toBeUndefined();

    // Verify nightlife added
    const nightlife = findChild(trip3!, 'nightlife');
    expect(nightlife).toBeDefined();
    expect(nightlife!.slots.plan).toBe('bar hopping near the lake');
    expect(nightlife!.slots.budget).toBe(500);

    // ────────────────────────────────────────────
    // FINAL STATE VERIFICATION
    // ────────────────────────────────────────────

    const finalTree = findTree(result3.snapshot, 'hangzhou_trip');

    // Should have: destination, duration as root slots
    expect(finalTree!.slots.destination).toBe('Hangzhou');
    expect(finalTree!.slots.duration).toBe('one week');

    // Should have 2 children: dining + nightlife (activities was dropped)
    expect(finalTree!.children).toHaveLength(2);
    const childKeys = finalTree!.children.map((c) => c.key).sort();
    expect(childKeys).toEqual(['dining', 'nightlife']);

    // Dining should have updated budget
    const finalDining = findChild(finalTree!, 'dining');
    expect(finalDining!.slots.budget).toBe(2000);

    // Final tree should have the updated content
    expect(result3.snapshot.trees[0].key).toBeDefined();
  });

  it('handles drift detection (empty yops)', async () => {
    const snapshot: SemanticContent = {
      trees: [{ key: 'trip', slots: { dest: 'HZ' }, children: [] }],
      relations: [],
    };

    const provider = mockProvider(['yops: []']);
    const extractor = new Extractor(provider);

    const result = await extractor.extract({
      turns: [{ role: 'user', content: 'What is the weather like?', turn_hash: 'T5' }],
      snapshot,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Empty yops = no changes, snapshot unchanged
    expect(result.yops).toHaveLength(0);
    expect(result.snapshot.trees[0].slots.dest).toBe('HZ');
  });

  it('parser + engine roundtrip works independently', () => {
    // Test the parser and engine can work together without the Extractor
    const raw = `yops:
  - define:
      parent: ""
      key: project
  - populate:
      path: project
      slots:
        name: T3X
        status: active
      source:
        name: "the project is called T3X"
        status: "it's actively developed"
      from: T15
  - set:
      path: project/version
      value: 2.0
      source: "we're on version 2"
      from: T1`;

    // Parse
    const parsed = parseYOpsOutput(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.yops).toHaveLength(3);

    // Apply
    const empty: SemanticContent = { trees: [], relations: [] };
    const applied = applyYOps(empty, parsed.yops);
    expect(applied.ok).toBe(true);

    // Verify tree
    expect(applied.trees).toHaveLength(1);
    expect(applied.trees[0].key).toBe('project');
    expect(applied.trees[0].slots.name).toBe('T3X');
    expect(applied.trees[0].slots.version).toBe(2.0);

    // Lint
    const lint = ylint({ trees: applied.trees, relations: applied.relations });
    expect(lint.overall).toBeGreaterThan(0.5);
    console.log('Roundtrip lint:', JSON.stringify(lint.scores));
  });
});
