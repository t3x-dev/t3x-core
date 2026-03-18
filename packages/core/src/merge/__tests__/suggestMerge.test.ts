import { describe, expect, it, vi } from 'vitest';
import type { LLMProvider } from '../../llm/types';
import { suggestMerge } from '../suggestMerge';
import type { MergeSimilarPair } from '../types';

function makeMockLLM(response: string): LLMProvider {
  return {
    id: 'mock',
    generate: vi
      .fn()
      .mockResolvedValue({ text: response, usage: { inputTokens: 10, outputTokens: 5 } }),
    resolveConflict: vi
      .fn()
      .mockResolvedValue({ text: response, usage: { inputTokens: 10, outputTokens: 5 } }),
  };
}

const pair: MergeSimilarPair = {
  source: { id: 's_src1', text: 'The user prefers OAuth 2.0 for authentication.' },
  target: { id: 's_tgt1', text: 'The user requires JWT-based authentication.' },
  wordDiff: [
    { type: 'removed', text: 'OAuth 2.0' },
    { type: 'added', text: 'JWT-based' },
    { type: 'unchanged', text: 'authentication' },
  ],
};

describe('suggestMerge', () => {
  it('returns suggestion from LLM', async () => {
    const llm = makeMockLLM(
      JSON.stringify({
        suggestion: 'The user requires OAuth 2.0 with JWT tokens for authentication.',
        reasoning: 'Combined both authentication approaches.',
      })
    );

    const { suggestion, usage } = await suggestMerge(pair, llm);
    expect(suggestion).not.toBeNull();
    expect(suggestion!.suggestion).toContain('OAuth 2.0');
    expect(suggestion!.reasoning).toBeTruthy();
    expect(usage.inputTokens).toBe(10);
    expect(usage.outputTokens).toBe(5);
    expect(llm.generate).toHaveBeenCalledOnce();
  });

  it('returns null suggestion when no LLM provided', async () => {
    const { suggestion, usage } = await suggestMerge(pair);
    expect(suggestion).toBeNull();
    expect(usage.inputTokens).toBe(0);
    expect(usage.outputTokens).toBe(0);
  });

  it('returns null suggestion on LLM error', async () => {
    const llm: LLMProvider = {
      id: 'mock',
      generate: vi.fn().mockRejectedValue(new Error('API error')),
      resolveConflict: vi.fn().mockRejectedValue(new Error('API error')),
    };

    const { suggestion, usage } = await suggestMerge(pair, llm);
    expect(suggestion).toBeNull();
    expect(usage.inputTokens).toBe(0);
  });

  it('returns null suggestion on invalid JSON from LLM', async () => {
    const llm = makeMockLLM('This is not JSON');

    const { suggestion } = await suggestMerge(pair, llm);
    expect(suggestion).toBeNull();
  });

  it('returns null suggestion when suggestion field is missing', async () => {
    const llm = makeMockLLM(JSON.stringify({ reasoning: 'no suggestion field' }));

    const { suggestion } = await suggestMerge(pair, llm);
    expect(suggestion).toBeNull();
  });
});
