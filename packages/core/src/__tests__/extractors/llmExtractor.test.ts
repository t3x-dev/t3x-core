/**
 * LLM Extractor Tests
 *
 * Tests for LLM-based semantic extraction pipeline:
 * - parseExtractionResponse: JSON parsing + Zod validation
 * - resolveSourceRef: quote → source_ref resolution
 * - LLMExtractor.extract: end-to-end flow with mock LLMProvider
 * - validateExtractedSentences: validation rules
 */

import { describe, expect, it, vi } from 'vitest';
import { ExtractionParseError, parseExtractionResponse } from '../../extractors/extractionParser';
import type { TurnInput } from '../../extractors/extractionPrompt';
import { buildExtractionPrompt } from '../../extractors/extractionPrompt';
import { validateExtractedSentences } from '../../extractors/extractionValidator';
import { createLLMExtractor, LLMExtractor } from '../../extractors/llmExtractor';
import { resolveSourceRef } from '../../extractors/sourceRefResolver';
import type { LLMProvider } from '../../llm/types';

// ============================================================
// Mock LLM Provider
// ============================================================

function createMockProvider(response: string): LLMProvider {
  return {
    id: 'mock-provider',
    generate: vi
      .fn()
      .mockResolvedValue({ text: response, usage: { inputTokens: 10, outputTokens: 5 } }),
    resolveConflict: vi
      .fn()
      .mockResolvedValue({ text: 'resolved', usage: { inputTokens: 0, outputTokens: 0 } }),
  };
}

const sampleTurns: TurnInput[] = [
  {
    conversation_id: 'conv_test1',
    turn_hash: 'sha256:turn0',
    role: 'user',
    content: 'I really love Japanese food, especially sushi and ramen.',
  },
  {
    conversation_id: 'conv_test1',
    turn_hash: 'sha256:turn1',
    role: 'assistant',
    content: 'Great choices! Japanese cuisine is known for its fresh ingredients.',
  },
  {
    conversation_id: 'conv_test1',
    turn_hash: 'sha256:turn2',
    role: 'user',
    content: 'I plan to visit Tokyo next March for a food tour.',
  },
];

// ============================================================
// parseExtractionResponse
// ============================================================

describe('parseExtractionResponse', () => {
  it('parses valid JSON array', () => {
    const raw = JSON.stringify([
      {
        text: 'The user prefers Japanese food.',
        confidence: 0.95,
        quote: 'love Japanese food',
        turn_index: 0,
      },
    ]);
    const result = parseExtractionResponse(raw);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('The user prefers Japanese food.');
    expect(result[0].confidence).toBe(0.95);
    expect(result[0].turn_index).toBe(0);
  });

  it('strips markdown json fences', () => {
    const raw =
      '```json\n[{"text":"A sentence.","confidence":0.8,"quote":"sentence","turn_index":0}]\n```';
    const result = parseExtractionResponse(raw);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('A sentence.');
  });

  it('strips bare markdown fences', () => {
    const raw = '```\n[{"text":"Test.","confidence":0.9,"quote":"test","turn_index":0}]\n```';
    const result = parseExtractionResponse(raw);
    expect(result).toHaveLength(1);
  });

  it('throws ExtractionParseError on invalid JSON', () => {
    expect(() => parseExtractionResponse('not json at all')).toThrow(ExtractionParseError);
  });

  it('throws ExtractionParseError on invalid schema', () => {
    const raw = JSON.stringify([{ text: '', confidence: 2, quote: 'x', turn_index: -1 }]);
    expect(() => parseExtractionResponse(raw)).toThrow(ExtractionParseError);
  });

  it('throws ExtractionParseError on non-array JSON', () => {
    expect(() => parseExtractionResponse('{"text":"not an array"}')).toThrow(ExtractionParseError);
  });

  it('parses empty array', () => {
    const result = parseExtractionResponse('[]');
    expect(result).toHaveLength(0);
  });
});

// ============================================================
// resolveSourceRef
// ============================================================

describe('resolveSourceRef', () => {
  const conversationId = 'conv_test1';
  const turnHash = 'sha256:abc';

  it('finds exact match', () => {
    const content = 'I really love Japanese food, especially sushi and ramen.';
    const ref = resolveSourceRef('love Japanese food', content, conversationId, turnHash);
    expect(ref).toBeDefined();
    expect(ref!.start_char).toBe(9);
    expect(ref!.end_char).toBe(27);
    expect(ref!.conversation_id).toBe(conversationId);
    expect(ref!.turn_hash).toBe(turnHash);
  });

  it('finds case-insensitive match', () => {
    const content = 'I LOVE Japanese food.';
    const ref = resolveSourceRef('i love japanese', content, conversationId, turnHash);
    expect(ref).toBeDefined();
    expect(ref!.start_char).toBe(0);
    expect(ref!.end_char).toBe(15);
  });

  it('returns undefined when quote not found', () => {
    const content = 'Something completely different.';
    const ref = resolveSourceRef('Japanese food', content, conversationId, turnHash);
    expect(ref).toBeUndefined();
  });

  it('returns first occurrence for duplicate substrings', () => {
    const content = 'food and more food and even more food.';
    const ref = resolveSourceRef('food', content, conversationId, turnHash);
    expect(ref).toBeDefined();
    expect(ref!.start_char).toBe(0);
  });
});

// ============================================================
// buildExtractionPrompt
// ============================================================

describe('buildExtractionPrompt', () => {
  it('builds system and user prompts', () => {
    const { systemPrompt, userPrompt } = buildExtractionPrompt(sampleTurns);
    expect(systemPrompt).toContain('knowledge extraction engine');
    expect(systemPrompt).toContain('30'); // default maxSentences
    expect(userPrompt).toContain('[Turn 0] [user]:');
    expect(userPrompt).toContain('[Turn 1] [assistant]:');
    expect(userPrompt).toContain('[Turn 2] [user]:');
  });

  it('respects maxSentences option', () => {
    const { systemPrompt } = buildExtractionPrompt(sampleTurns, { maxSentences: 10 });
    expect(systemPrompt).toContain('10');
  });

  it('includes language hint', () => {
    const { systemPrompt } = buildExtractionPrompt(sampleTurns, { language: 'Chinese' });
    expect(systemPrompt).toContain('Chinese');
  });
});

// ============================================================
// LLMExtractor.extract
// ============================================================

describe('LLMExtractor', () => {
  it('extracts sentences end-to-end', async () => {
    const mockResponse = JSON.stringify([
      {
        text: 'The user prefers Japanese food, especially sushi and ramen.',
        confidence: 0.95,
        quote: 'love Japanese food, especially sushi and ramen',
        turn_index: 0,
      },
      {
        text: 'The user plans to visit Tokyo in March for a food tour.',
        confidence: 0.9,
        quote: 'plan to visit Tokyo next March for a food tour',
        turn_index: 2,
      },
    ]);

    const provider = createMockProvider(mockResponse);
    const extractor = createLLMExtractor(provider);
    const result = await extractor.extract(sampleTurns);

    expect(result.model).toBe('mock-provider');
    expect(result.sentences).toHaveLength(2);

    // First sentence should have source_ref (exact match in turn 0)
    expect(result.sentences[0].source_ref).toBeDefined();
    expect(result.sentences[0].source_ref!.turn_hash).toBe('sha256:turn0');

    // Second sentence should have source_ref (exact match in turn 2)
    expect(result.sentences[1].source_ref).toBeDefined();
    expect(result.sentences[1].source_ref!.turn_hash).toBe('sha256:turn2');

    // Provider was called with combined prompt
    expect(provider.generate).toHaveBeenCalledOnce();
    const callArgs = (provider.generate as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[0]).toContain('knowledge extraction engine');
    expect(callArgs[1]).toEqual({ temperature: 0.1, maxTokens: 4096 });
  });

  it('lowers confidence when source_ref not found', async () => {
    const mockResponse = JSON.stringify([
      {
        text: 'The user enjoys cooking.',
        confidence: 0.9,
        quote: 'this quote does not exist in any turn',
        turn_index: 0,
      },
    ]);

    const provider = createMockProvider(mockResponse);
    const extractor = new LLMExtractor(provider);
    const result = await extractor.extract(sampleTurns);

    expect(result.sentences[0].source_ref).toBeUndefined();
    expect(result.sentences[0].confidence).toBeLessThanOrEqual(0.6);
  });

  it('handles empty extraction response', async () => {
    const provider = createMockProvider('[]');
    const extractor = createLLMExtractor(provider);
    const result = await extractor.extract(sampleTurns);

    expect(result.sentences).toHaveLength(0);
  });
});

// ============================================================
// validateExtractedSentences
// ============================================================

describe('validateExtractedSentences', () => {
  it('passes valid sentences through', () => {
    const sentences = [
      { text: 'The user prefers Japanese food.', confidence: 0.9, quote: 'q', turn_index: 0 },
    ];
    const { valid, removed } = validateExtractedSentences(sentences, sampleTurns);
    expect(valid).toHaveLength(1);
    expect(removed).toHaveLength(0);
  });

  it('removes out-of-bounds turn_index', () => {
    const sentences = [
      { text: 'Valid sentence here.', confidence: 0.9, quote: 'q', turn_index: 99 },
    ];
    const { valid, removed } = validateExtractedSentences(sentences, sampleTurns);
    expect(valid).toHaveLength(0);
    expect(removed).toHaveLength(1);
    expect(removed[0].reason).toContain('out of bounds');
  });

  it('removes short text', () => {
    const sentences = [{ text: 'Hi', confidence: 0.9, quote: 'q', turn_index: 0 }];
    const { valid, removed } = validateExtractedSentences(sentences, sampleTurns);
    expect(valid).toHaveLength(0);
    expect(removed[0].reason).toContain('too short');
  });

  it('removes duplicate text (keeps first)', () => {
    const sentences = [
      { text: 'The user likes sushi.', confidence: 0.9, quote: 'q', turn_index: 0 },
      { text: 'The user likes sushi.', confidence: 0.85, quote: 'q2', turn_index: 1 },
    ];
    const { valid, removed } = validateExtractedSentences(sentences, sampleTurns);
    expect(valid).toHaveLength(1);
    expect(valid[0].confidence).toBe(0.9); // kept first
    expect(removed).toHaveLength(1);
    expect(removed[0].reason).toContain('duplicate');
  });

  it('removes low confidence', () => {
    const sentences = [
      { text: 'Some uncertain claim.', confidence: 0.2, quote: 'q', turn_index: 0 },
    ];
    const { valid, removed } = validateExtractedSentences(sentences, sampleTurns);
    expect(valid).toHaveLength(0);
    expect(removed[0].reason).toContain('confidence too low');
  });

  it('handles mixed valid and invalid', () => {
    const sentences = [
      { text: 'Good sentence one.', confidence: 0.9, quote: 'q1', turn_index: 0 },
      { text: 'Bad', confidence: 0.9, quote: 'q2', turn_index: 0 }, // too short
      { text: 'Good sentence two.', confidence: 0.8, quote: 'q3', turn_index: 1 },
      { text: 'Good sentence one.', confidence: 0.7, quote: 'q4', turn_index: 2 }, // duplicate
      { text: 'Uncertain thing here.', confidence: 0.1, quote: 'q5', turn_index: 0 }, // low conf
    ];
    const { valid, removed } = validateExtractedSentences(sentences, sampleTurns);
    expect(valid).toHaveLength(2);
    expect(removed).toHaveLength(3);
  });
});
