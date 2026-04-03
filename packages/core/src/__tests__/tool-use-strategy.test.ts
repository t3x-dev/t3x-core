import { describe, expect, it, vi } from 'vitest';
import { ToolUseExtractionStrategy } from '../extractors/strategies/tool-use-strategy';
import type { LLMProvider, ToolUseResult } from '../llm/types';
import type { ExtractionInput } from '../extractors/yopsPrompt';

function mockToolUseProvider(toolUseResult: ToolUseResult): LLMProvider {
  return {
    id: 'test-tool',
    generate: vi.fn(),
    resolveConflict: vi.fn(),
    generateWithTools: vi.fn().mockResolvedValue(toolUseResult),
  };
}

const basicInput: ExtractionInput = {
  turns: [
    { role: 'user', content: 'I want to plan a trip to Tokyo' },
    { role: 'assistant', content: 'Tokyo is great! Budget around $3000.' },
  ],
};

describe('ToolUseExtractionStrategy', () => {
  it('converts tool calls to YOps and applies them', async () => {
    const provider = mockToolUseProvider({
      tool_calls: [
        {
          id: 'tc_1',
          name: 'yop_add',
          input: {
            parent: '',
            node: { trip: { destination: 'Tokyo', budget: 3000 } },
            source: { destination: 'trip to Tokyo', budget: 'around $3000' },
            from: 'T1',
          },
        },
      ],
      stop_reason: 'end_turn',
      usage: { inputTokens: 200, outputTokens: 100 },
    });

    const strategy = new ToolUseExtractionStrategy();
    const result = await strategy.extract(basicInput, provider);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.yops).toHaveLength(1);
      expect(result.snapshot.trees).toHaveLength(1);
      expect(result.snapshot.trees[0].key).toBe('trip');
      expect(result.usage.inputTokens).toBe(200);
    }
  });

  it('handles multiple tool calls in single response', async () => {
    const provider = mockToolUseProvider({
      tool_calls: [
        {
          id: 'tc_1',
          name: 'yop_add',
          input: {
            parent: '',
            node: { trip: { destination: 'Tokyo' } },
            source: { destination: 'trip to Tokyo' },
            from: 'T1',
          },
        },
        {
          id: 'tc_2',
          name: 'yop_set',
          input: {
            path: 'trip/budget',
            value: 3000,
            source: 'around $3000',
            from: 'T2',
          },
        },
      ],
      stop_reason: 'end_turn',
      usage: { inputTokens: 200, outputTokens: 150 },
    });

    const strategy = new ToolUseExtractionStrategy();
    const result = await strategy.extract(basicInput, provider);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.yops).toHaveLength(2);
      expect(result.snapshot.trees[0].slots.budget).toBe(3000);
    }
  });

  it('skips invalid tool calls and continues with valid ones', async () => {
    const provider = mockToolUseProvider({
      tool_calls: [
        {
          id: 'tc_1',
          name: 'yop_add',
          input: {
            parent: '',
            node: { trip: { destination: 'Tokyo' } },
            source: { destination: 'trip to Tokyo' },
            from: 'T1',
          },
        },
        {
          id: 'tc_2',
          name: 'yop_set',
          input: { path: '' }, // invalid: empty path, missing required fields
        },
      ],
      stop_reason: 'end_turn',
      usage: { inputTokens: 200, outputTokens: 100 },
    });

    const strategy = new ToolUseExtractionStrategy();
    const result = await strategy.extract(basicInput, provider);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.yops).toHaveLength(1); // only valid one
      expect(result.snapshot.trees[0].key).toBe('trip');
    }
  });

  it('returns error when provider lacks generateWithTools', async () => {
    const provider: LLMProvider = {
      id: 'basic',
      generate: vi.fn(),
      resolveConflict: vi.fn(),
    };

    const strategy = new ToolUseExtractionStrategy();
    const result = await strategy.extract(basicInput, provider);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('generateWithTools');
    }
  });

  it('returns error when all tool calls are invalid', async () => {
    const provider = mockToolUseProvider({
      tool_calls: [
        { id: 'tc_1', name: 'yop_set', input: { path: '' } },
        { id: 'tc_2', name: 'yop_unknown', input: {} },
      ],
      stop_reason: 'end_turn',
      usage: { inputTokens: 200, outputTokens: 100 },
    });

    const strategy = new ToolUseExtractionStrategy();
    const result = await strategy.extract(basicInput, provider);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('No valid');
    }
  });

  it('returns empty extraction when no tool calls returned', async () => {
    const provider = mockToolUseProvider({
      tool_calls: [],
      stop_reason: 'end_turn',
      usage: { inputTokens: 200, outputTokens: 10 },
    });

    const strategy = new ToolUseExtractionStrategy();
    const result = await strategy.extract(basicInput, provider);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.yops).toHaveLength(0);
      expect(result.snapshot.trees).toHaveLength(0);
    }
  });

  it('returns error when LLM provider throws', async () => {
    const provider: LLMProvider = {
      id: 'failing',
      generate: vi.fn(),
      resolveConflict: vi.fn(),
      generateWithTools: vi.fn().mockRejectedValue(new Error('API timeout')),
    };

    const strategy = new ToolUseExtractionStrategy();
    const result = await strategy.extract(basicInput, provider);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('API timeout');
    }
  });

  it('has name "tool-use"', () => {
    const strategy = new ToolUseExtractionStrategy();
    expect(strategy.name).toBe('tool-use');
  });
});
