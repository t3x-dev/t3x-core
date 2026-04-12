import { describe, expect, it } from 'vitest';
import { isHumanSource, isLLMSource, type Source } from '../source';

describe('Source type guards', () => {
  it('identifies LLMSource', () => {
    const src: Source = {
      type: 'llm',
      model: 'claude-sonnet-4-6',
      at: '2026-04-12T00:00:00Z',
      turn_ref: { turn_hash: 'sha256:abc', quote: 'hello world' },
    };
    expect(isLLMSource(src)).toBe(true);
    expect(isHumanSource(src)).toBe(false);
  });

  it('identifies HumanSource', () => {
    const src: Source = {
      type: 'human',
      author: 'ethan',
      at: '2026-04-12T00:00:00Z',
    };
    expect(isHumanSource(src)).toBe(true);
    expect(isLLMSource(src)).toBe(false);
  });
});
