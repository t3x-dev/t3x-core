import { describe, expect, it, vi } from 'vitest';
import type { LLMProvider } from '../../../llm/types';
import type { ExtractionInput } from '../../yopsPrompt';
import { YamlExtractionStrategy } from '../yaml-strategy';

/**
 * Mock LLM provider that returns controlled responses in sequence.
 * Matches the full LLMProvider interface shape.
 */
function mockProvider(responses: string[]): LLMProvider {
  let callIndex = 0;
  return {
    id: 'mock',
    generate: vi.fn(async () => {
      const text = responses[callIndex] ?? '';
      callIndex++;
      return { text, usage: { inputTokens: 100, outputTokens: 50 } };
    }),
    resolveConflict: vi.fn(async () => ({
      text: '',
      usage: { inputTokens: 0, outputTokens: 0 },
    })),
  };
}

const baseTurns = [
  { role: 'user' as const, content: 'I want to plan a trip to Tokyo', turn_hash: 'sha256:aaa' },
  {
    role: 'assistant' as const,
    content: 'Great choice! Tokyo is wonderful.',
    turn_hash: 'sha256:bbb',
  },
];

const baseInput: ExtractionInput = {
  turns: baseTurns,
  snapshot: undefined,
  processedTurnCount: 0,
};

/**
 * A valid first-extraction YAML tree response.
 * parseYOpsOutput handles tree format (no "yops:" prefix) for first extractions.
 */
const goodTreeYaml = `trip:
  destination: Tokyo
  slot_quotes:
    destination: "trip to Tokyo"
  source_map:
    trip: T1
  confidence_map:
    trip: 0.9`;

describe('YamlExtractionStrategy — smart repair', () => {
  const strategy = new YamlExtractionStrategy();

  it('calls LLM twice when first response has YAML parse error and repair succeeds', async () => {
    const badYaml = 'trip:\n\tdestination: Tokyo'; // tab indent — YAML parse error
    const provider = mockProvider([badYaml, goodTreeYaml]);
    const result = await strategy.extract(baseInput, provider);

    // Provider should have been called twice: main + repair
    expect(provider.generate).toHaveBeenCalledTimes(2);

    // Second call (repair) should contain the parse error context
    const secondCall = (provider.generate as ReturnType<typeof vi.fn>).mock.calls[1][0] as string;
    expect(secondCall).toContain('Syntax Error');
  });

  it('returns error when both main and repair fail to parse', async () => {
    const badYaml1 = 'trip:\n\tdestination: Tokyo'; // tab indent — YAML parse error
    const badYaml2 = 'still:\n\tbroken: too';       // also tab indent

    // MAX_RETRIES=1, so we get 2 attempts. Each attempt: main call + repair call = 4 total.
    const provider = mockProvider([badYaml1, badYaml2, badYaml1, badYaml2]);
    const result = await strategy.extract(baseInput, provider);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('repair failed');
    }
  });

  it('does not call repair round on happy path', async () => {
    const provider = mockProvider([goodTreeYaml]);
    const result = await strategy.extract(baseInput, provider);

    // Only one LLM call — no repair needed
    expect(provider.generate).toHaveBeenCalledTimes(1);
    if (result.ok) {
      expect(result.snapshot.trees.length).toBeGreaterThan(0);
    }
  });

  it('accumulates token usage from repair rounds', async () => {
    const badYaml = 'trip:\n\tdestination: Tokyo'; // tab indent — YAML parse error
    const provider = mockProvider([badYaml, goodTreeYaml]);
    const result = await strategy.extract(baseInput, provider);

    // 2 calls x (100 input + 50 output) each
    expect(result.usage.inputTokens).toBe(200);
    expect(result.usage.outputTokens).toBe(100);
  });
});
