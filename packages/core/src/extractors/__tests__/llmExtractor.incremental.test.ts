import { describe, expect, it, vi } from 'vitest';
import { LLMExtractor } from '../llmExtractor';
import type { LLMProvider } from '../../llm/types';
import type { TurnInput } from '../extractionPrompt';

function createMockProvider(response: string): LLMProvider {
  return {
    id: 'mock-model',
    generate: vi.fn().mockResolvedValue(response),
    resolveConflict: vi.fn(),
  };
}

const turns: TurnInput[] = [
  { conversation_id: 'conv_1', turn_hash: 'sha256:turn1', role: 'user', content: 'I prefer dark mode for all my IDEs.' },
  { conversation_id: 'conv_1', turn_hash: 'sha256:turn2', role: 'assistant', content: 'Dark mode is a popular choice.' },
];

const llmResponse = JSON.stringify([{
  type: 'new',
  text: 'The user prefers dark mode for all IDEs.',
  confidence: 0.92,
  inference_type: 'direct',
  reasoning: 'User explicitly stated preference',
  evidence: [{
    conversation_id: 'conv_1',
    turn_hash: 'sha256:turn1',
    quoted_text: 'prefer dark mode for all my IDEs',
    role: 'primary',
    relevance: 'directly stated preference',
  }],
}]);

describe('LLMExtractor.extractIncremental', () => {
  it('returns ready and review points with cursor', async () => {
    const provider = createMockProvider(llmResponse);
    const extractor = new LLMExtractor(provider);

    const result = await extractor.extractIncremental(turns, [], {
      cursors: {},
    });

    expect(result.readyPoints.length + result.reviewPoints.length).toBeGreaterThan(0);
    expect(result.newCursor.cursors['conv_1']).toBeDefined();
    expect(result.stats.proposals).toBe(1);
  });

  it('assigns sp_ prefixed IDs to new points', async () => {
    const provider = createMockProvider(llmResponse);
    const extractor = new LLMExtractor(provider);

    const result = await extractor.extractIncremental(turns, [], { cursors: {} });

    const allPoints = [...result.readyPoints, ...result.reviewPoints];
    for (const sp of allPoints) {
      expect(sp.id).toMatch(/^sp_/);
    }
  });

  it('sets extraction_mode to llm_extracted', async () => {
    const provider = createMockProvider(llmResponse);
    const extractor = new LLMExtractor(provider);

    const result = await extractor.extractIncremental(turns, [], { cursors: {} });
    const allPoints = [...result.readyPoints, ...result.reviewPoints];
    for (const sp of allPoints) {
      expect(sp.extraction_mode).toBe('llm_extracted');
    }
  });

  it('rejects proposals that fail verification', async () => {
    const badResponse = JSON.stringify([{
      type: 'new',
      text: 'Hallucinated fact',
      confidence: 0.9,
      inference_type: 'direct',
      reasoning: 'made up',
      evidence: [{
        conversation_id: 'conv_1',
        turn_hash: 'sha256:nonexistent',
        quoted_text: 'does not exist',
        role: 'primary',
        relevance: 'fake',
      }],
    }]);

    const provider = createMockProvider(badResponse);
    const extractor = new LLMExtractor(provider);

    const result = await extractor.extractIncremental(turns, [], { cursors: {} });
    expect(result.readyPoints).toHaveLength(0);
    expect(result.reviewPoints).toHaveLength(0);
    expect(result.stats.rejected).toBe(1);
  });
});
