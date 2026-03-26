import { describe, expect, it, vi } from 'vitest';
import { FrameExtractor } from '../../extractors/frameExtractor';
import type { LLMProvider } from '../../llm/types';
import { flattenTrees } from '../../semantic/tree';
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

// Legacy delta output (frames format — still supported by parser)
const validDeltaOutput = JSON.stringify({
  changes: [
    {
      action: 'add',
      parent_path: '',
      node: { key: 'travel_plan', slots: { destination: 'Tokyo' }, children: [] },
    },
  ],
});

const validDeltaWithRelations = JSON.stringify({
  changes: [
    {
      action: 'add',
      parent_path: '',
      node: { key: 'budget', slots: { amount: 3000 }, children: [] },
    },
  ],
  new_relations: [{ from: 'travel_plan', to: 'budget', type: 'depends' }],
});

const existingSnapshot: SemanticContent = {
  trees: [{ key: 'travel_plan', slots: { destination: 'Tokyo' }, children: [], confidence: 0.95 }],
  relations: [],
};

// ── Tests ──

describe('FrameExtractor', () => {
  it('extracts delta from turns (no existing snapshot)', async () => {
    const provider = mockProvider([validDeltaOutput]);
    const extractor = new FrameExtractor(provider);

    const result = await extractor.extract({
      turns: [
        { role: 'user', content: 'I want to travel to Tokyo' },
        { role: 'assistant', content: 'Great choice! Tokyo is wonderful.' },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.delta.changes).toHaveLength(1);
    expect(result.delta.changes[0].action).toBe('add');
    const frames = flattenTrees(result.snapshot.trees);
    expect(frames).toHaveLength(1);
    expect(frames[0].type).toBe('travel_plan');

    expect(provider.generate).toHaveBeenCalledTimes(1);
    expect(provider.generate).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ temperature: 0.1, maxTokens: 4096 })
    );
  });

  it('applies delta to existing snapshot', async () => {
    const provider = mockProvider([validDeltaWithRelations]);
    const extractor = new FrameExtractor(provider);

    const result = await extractor.extract({
      turns: [{ role: 'user', content: 'My budget is 3000 dollars' }],
      snapshot: existingSnapshot,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const frames = flattenTrees(result.snapshot.trees);
    expect(frames).toHaveLength(2);
    expect(result.snapshot.relations).toHaveLength(1);
    expect(result.snapshot.relations[0].type).toBe('depends');
  });

  it('retries once on parse failure then succeeds', async () => {
    const provider = mockProvider(['this is garbage not json', validDeltaOutput]);
    const extractor = new FrameExtractor(provider);

    const result = await extractor.extract({
      turns: [{ role: 'user', content: 'I want to travel to Tokyo' }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.delta.changes).toHaveLength(1);
    expect(provider.generate).toHaveBeenCalledTimes(2);
  });

  it('returns error after retries exhausted', async () => {
    const provider = mockProvider(['garbage one', 'garbage two']);
    const extractor = new FrameExtractor(provider);

    const result = await extractor.extract({
      turns: [{ role: 'user', content: 'hello' }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error).toContain('parse');
    expect(provider.generate).toHaveBeenCalledTimes(2);
  });

  it('retries on validation failure then succeeds', async () => {
    // First response: valid parse but creates a self-referencing relation (validation error)
    const invalidValidation = JSON.stringify({
      changes: [
        {
          action: 'add',
          parent_path: '',
          node: { key: 'travel_plan', slots: { destination: 'Tokyo' }, children: [] },
        },
      ],
      new_relations: [{ from: 'travel_plan', to: 'travel_plan', type: 'causes' }],
    });

    const provider = mockProvider([invalidValidation, validDeltaOutput]);
    const extractor = new FrameExtractor(provider);

    const result = await extractor.extract({
      turns: [{ role: 'user', content: 'I want to travel to Tokyo' }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const frames = flattenTrees(result.snapshot.trees);
    expect(frames).toHaveLength(1);
    expect(provider.generate).toHaveBeenCalledTimes(2);
  });
});
