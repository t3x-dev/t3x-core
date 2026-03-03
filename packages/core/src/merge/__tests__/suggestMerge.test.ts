import { describe, expect, it, vi } from 'vitest';
import { suggestMerge } from '../suggestMerge';
import type { LLMProvider } from '../../llm/types';
import type { MergeSimilarPair } from '../types';

function makeMockLLM(response: string): LLMProvider {
  return {
    id: 'mock',
    generate: vi.fn().mockResolvedValue(response),
    resolveConflict: vi.fn().mockResolvedValue(response),
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
    const llm = makeMockLLM(JSON.stringify({
      suggestion: 'The user requires OAuth 2.0 with JWT tokens for authentication.',
      reasoning: 'Combined both authentication approaches.',
    }));

    const result = await suggestMerge(pair, llm);
    expect(result).not.toBeNull();
    expect(result!.suggestion).toContain('OAuth 2.0');
    expect(result!.reasoning).toBeTruthy();
    expect(llm.generate).toHaveBeenCalledOnce();
  });

  it('returns null when no LLM provided', async () => {
    const result = await suggestMerge(pair);
    expect(result).toBeNull();
  });

  it('returns null on LLM error', async () => {
    const llm: LLMProvider = {
      id: 'mock',
      generate: vi.fn().mockRejectedValue(new Error('API error')),
      resolveConflict: vi.fn().mockRejectedValue(new Error('API error')),
    };

    const result = await suggestMerge(pair, llm);
    expect(result).toBeNull();
  });

  it('returns null on invalid JSON from LLM', async () => {
    const llm = makeMockLLM('This is not JSON');

    const result = await suggestMerge(pair, llm);
    expect(result).toBeNull();
  });

  it('returns null when suggestion field is missing', async () => {
    const llm = makeMockLLM(JSON.stringify({ reasoning: 'no suggestion field' }));

    const result = await suggestMerge(pair, llm);
    expect(result).toBeNull();
  });
});
