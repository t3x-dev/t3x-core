import { describe, expect, it, vi } from 'vitest';
import { runBenchmark, type BenchmarkResult } from '../extractors/benchmark';
import type { LLMProvider, ToolUseResult } from '../llm/types';
import type { ExtractionInput } from '../extractors/yopsPrompt';

const basicInput: ExtractionInput = {
  turns: [
    { role: 'user', content: 'I want to plan a trip to Tokyo' },
    { role: 'assistant', content: 'Great choice! Budget around $3000 for a week.' },
  ],
};

const yamlResponse = `yops:
  - add:
      parent: ""
      node:
        trip:
          destination: Tokyo
          budget: 3000
          duration: "1 week"
      source:
        destination: "trip to Tokyo"
        budget: "around $3000"
        duration: "for a week"
      from: T1`;

const toolUseResponse: ToolUseResult = {
  tool_calls: [
    {
      id: 'tc_1',
      name: 'yop_add',
      input: {
        parent: '',
        node: { trip: { destination: 'Tokyo', budget: 3000, duration: '1 week' } },
        source: { destination: 'trip to Tokyo', budget: 'around $3000', duration: 'for a week' },
        from: 'T1',
      },
    },
  ],
  stop_reason: 'end_turn' as const,
  usage: { inputTokens: 300, outputTokens: 80 },
};

function createDualProvider(): LLMProvider {
  return {
    id: 'test-dual',
    generate: vi.fn().mockResolvedValue({
      text: yamlResponse,
      usage: { inputTokens: 100, outputTokens: 50 },
    }),
    resolveConflict: vi.fn(),
    generateWithTools: vi.fn().mockResolvedValue(toolUseResponse),
  };
}

describe('runBenchmark', () => {
  it('runs both strategies and returns comparison', async () => {
    const provider = createDualProvider();
    const result = await runBenchmark(basicInput, provider);

    expect(result.yaml.ok).toBe(true);
    expect(result.toolUse.ok).toBe(true);
    expect(result.comparison.tokenRatio).toBeGreaterThan(0);
    expect(typeof result.comparison.yamlTotalTokens).toBe('number');
    expect(typeof result.comparison.toolUseTotalTokens).toBe('number');
  });

  it('reports quality metrics', async () => {
    const provider = createDualProvider();
    const result = await runBenchmark(basicInput, provider);

    expect(typeof result.comparison.yamlNodeCount).toBe('number');
    expect(typeof result.comparison.toolUseNodeCount).toBe('number');
    expect(typeof result.comparison.yamlSlotCount).toBe('number');
    expect(typeof result.comparison.toolUseSlotCount).toBe('number');
  });

  it('handles tool-use failure gracefully', async () => {
    const provider: LLMProvider = {
      id: 'yaml-only',
      generate: vi.fn().mockResolvedValue({
        text: yamlResponse,
        usage: { inputTokens: 100, outputTokens: 50 },
      }),
      resolveConflict: vi.fn(),
      // no generateWithTools
    };

    const result = await runBenchmark(basicInput, provider);

    expect(result.yaml.ok).toBe(true);
    expect(result.toolUse.ok).toBe(false);
  });

  it('reports duration for both strategies', async () => {
    const provider = createDualProvider();
    const result = await runBenchmark(basicInput, provider);

    expect(result.yamlDurationMs).toBeGreaterThanOrEqual(0);
    expect(result.toolUseDurationMs).toBeGreaterThanOrEqual(0);
  });
});
