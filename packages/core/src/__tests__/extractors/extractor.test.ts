import { describe, expect, it, vi } from 'vitest';
import { Extractor } from '../../extractors/extractor';
import type { LLMProvider } from '../../llm/types';
import type { SemanticContent } from '../../semantic/types';

// ── Helpers ──

function mockProvider(responses: string[]): LLMProvider {
  let callIndex = 0;
  return {
    id: 'test-provider',
    generate: vi.fn(async () => {
      const response = responses[callIndex] ?? '';
      callIndex++;
      return { text: response, usage: { inputTokens: 10, outputTokens: 5 } };
    }),
    resolveConflict: vi.fn(async () => ''),
  };
}

// ── Fixtures ──

// YOps-format: first extraction (YAML tree + metadata)
const validTreeOutput = `travel_plan:\n  destination: Tokyo\n---\n{"slot_quotes":{"destination":"travel to Tokyo"},"source_map":{"travel_plan":"T1"},"confidence_map":{"travel_plan":0.9}}`;

// YOps-format: incremental define + populate
const validYOpsAdd = `yops:\n  - define:\n      parent: ""\n      key: budget\n  - populate:\n      path: budget\n      slots:\n        amount: 3000\n      source:\n        amount: "3000 dollars"\n      from: T1`;

// YOps-format: incremental define + populate with relation
const validYOpsAddWithRelation = `yops:\n  - define:\n      parent: ""\n      key: budget\n  - populate:\n      path: budget\n      slots:\n        amount: 3000\n      source:\n        amount: "budget is 3000"\n      from: T1\n  - relate:\n      from: travel_plan\n      to: budget\n      type: depends`;

const existingSnapshot: SemanticContent = {
  trees: [{ key: 'travel_plan', slots: { destination: 'Tokyo' }, children: [], confidence: 0.95 }],
  relations: [],
};

// ── Tests ──

describe('Extractor', () => {
  it('extracts from turns (no existing snapshot)', async () => {
    const provider = mockProvider([validTreeOutput]);
    const extractor = new Extractor(provider);

    const result = await extractor.extract({
      turns: [
        { role: 'user', content: 'I want to travel to Tokyo' },
        { role: 'assistant', content: 'Great choice! Tokyo is wonderful.' },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.yops).toBeDefined();
    expect(result.yops.length).toBeGreaterThan(0);
    expect(result.snapshot.trees).toHaveLength(1);
    expect(result.snapshot.trees[0].key).toBe('travel_plan');

    expect(provider.generate).toHaveBeenCalledTimes(1);
    expect(provider.generate).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ temperature: 0.1, maxTokens: 8192 })
    );
  });

  it('applies YOps to existing snapshot', async () => {
    const provider = mockProvider([validYOpsAddWithRelation]);
    const extractor = new Extractor(provider);

    const result = await extractor.extract({
      turns: [{ role: 'user', content: 'My budget is 3000 dollars' }],
      snapshot: existingSnapshot,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.snapshot.trees).toHaveLength(2);
    expect(result.snapshot.relations).toHaveLength(1);
    expect(result.snapshot.relations[0].type).toBe('depends');
  });

  it('retries once on parse failure then succeeds', async () => {
    const provider = mockProvider(['this is garbage not json', validTreeOutput]);
    const extractor = new Extractor(provider);

    const result = await extractor.extract({
      turns: [{ role: 'user', content: 'I want to travel to Tokyo' }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.yops.length).toBeGreaterThan(0);
    expect(provider.generate).toHaveBeenCalledTimes(2);
  });

  it('returns error after retries exhausted', async () => {
    const provider = mockProvider(['garbage one', 'garbage two']);
    const extractor = new Extractor(provider);

    const result = await extractor.extract({
      turns: [{ role: 'user', content: 'hello' }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error).toContain('parse');
    expect(provider.generate).toHaveBeenCalledTimes(2);
  });

  it('retries on validation failure then succeeds', async () => {
    // First response: valid parse but self-relation (applyYOps will reject)
    const invalidYOps = `yops:\n  - define:\n      parent: ""\n      key: travel_plan\n  - populate:\n      path: travel_plan\n      slots:\n        destination: Tokyo\n      source:\n        destination: "Tokyo"\n      from: T1\n  - relate:\n      from: travel_plan\n      to: travel_plan\n      type: causes`;

    const provider = mockProvider([invalidYOps, validTreeOutput]);
    const extractor = new Extractor(provider);

    const result = await extractor.extract({
      turns: [{ role: 'user', content: 'I want to travel to Tokyo' }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.snapshot.trees).toHaveLength(1);
    expect(provider.generate).toHaveBeenCalledTimes(2);
  });
});
