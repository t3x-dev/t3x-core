import { describe, expect, it, vi } from 'vitest';
import { YamlExtractionStrategy } from '../extractors/strategies/yaml-strategy';
import type { ExtractionInput } from '../extractors/yopsPrompt';
import type { LLMProvider } from '../llm/types';

function mockProvider(responseText: string): LLMProvider {
  return {
    id: 'test',
    generate: vi.fn().mockResolvedValue({
      text: responseText,
      usage: { inputTokens: 100, outputTokens: 50 },
    }),
    resolveConflict: vi.fn(),
  };
}

const basicInput: ExtractionInput = {
  turns: [
    { role: 'user', content: 'I want to plan a trip to Tokyo' },
    { role: 'assistant', content: 'Tokyo is great! Budget around $3000.' },
  ],
};

describe('YamlExtractionStrategy', () => {
  it('extracts from a YOps list response', async () => {
    const yamlResponse = `yops:
  - define:
      path: trip
  - populate:
      path: trip
      values:
        destination: Tokyo
        budget: 3000`;

    const provider = mockProvider(yamlResponse);
    const strategy = new YamlExtractionStrategy();
    const result = await strategy.extract(basicInput, provider);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.yops.length).toBeGreaterThan(0);
      expect(result.snapshot.trees.length).toBeGreaterThan(0);
      expect(result.usage.inputTokens).toBe(100);
    }
  });

  it('retries once on parse failure', async () => {
    const badThenGood = vi
      .fn()
      .mockResolvedValueOnce({
        text: 'not valid yaml at all!!!',
        usage: { inputTokens: 50, outputTokens: 20 },
      })
      .mockResolvedValueOnce({
        text: `yops:
  - define:
      path: trip
  - populate:
      path: trip
      values:
        destination: Tokyo`,
        usage: { inputTokens: 50, outputTokens: 30 },
      });

    const provider: LLMProvider = {
      id: 'test',
      generate: badThenGood,
      resolveConflict: vi.fn(),
    };

    const strategy = new YamlExtractionStrategy();
    const result = await strategy.extract(basicInput, provider);

    expect(result.ok).toBe(true);
    expect(badThenGood).toHaveBeenCalledTimes(2);
    if (result.ok) {
      expect(result.usage.inputTokens).toBe(100); // accumulated
    }
  });

  it('returns error after all retries exhausted', async () => {
    const provider = mockProvider('garbage output');
    const strategy = new YamlExtractionStrategy();
    const result = await strategy.extract(basicInput, provider);

    expect(result.ok).toBe(false);
  });
});
