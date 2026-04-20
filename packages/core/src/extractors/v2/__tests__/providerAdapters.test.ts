import { describe, expect, it } from 'vitest';
import { LLMProviderError } from '../../../llm/types';
import {
  buildOpenAIChatCompletionBody,
  mapProviderErrorToExtractionFailure,
  normalizeProviderDraftText,
} from '../providerAdapters';
import { buildPromptTurnMap } from '../normalization';

describe('extractors/v2 normalization', () => {
  it('uses deterministic T-tags while preserving the full turn hash map', () => {
    const result = buildPromptTurnMap([
      { turn_hash: 'sha256:turn-1', role: 'user', content: 'hello' },
      { turn_hash: 'sha256:turn-2', role: 'assistant', content: 'world' },
    ]);

    expect(result.taggedTurns).toEqual([
      { turn_tag: 'T1', turn_hash: 'sha256:turn-1', role: 'user', content: 'hello' },
      { turn_tag: 'T2', turn_hash: 'sha256:turn-2', role: 'assistant', content: 'world' },
    ]);
    expect(result.turnHashByTag).toEqual({
      T1: 'sha256:turn-1',
      T2: 'sha256:turn-2',
    });
  });
});

describe('extractors/v2 provider adapters', () => {
  it('normalizes syntax-only provider wrappers deterministically', () => {
    expect(normalizeProviderDraftText('\uFEFF```yaml\r\nfoo: “bar”\r\n```\r\n')).toBe('foo: "bar"\n');
  });

  it('maps provider transport errors to shared failure codes', () => {
    const failure = mapProviderErrorToExtractionFailure(
      'openai',
      new LLMProviderError('openai', 429, 'rate limited')
    );

    expect(failure.code).toBe('transport');
    expect(failure.provider).toBe('openai');
    expect(failure.retry.strategy).toBe('backoff');
  });

  it('uses max_completion_tokens for GPT-5 family requests', () => {
    expect(
      buildOpenAIChatCompletionBody({
        model: 'gpt-5.4',
        temperature: 0.1,
        maxTokens: 100,
        messages: [{ role: 'user', content: 'hello' }],
      })
    ).toMatchObject({
      model: 'gpt-5.4',
      max_completion_tokens: 100,
      temperature: 0.1,
    });

    expect(
      buildOpenAIChatCompletionBody({
        model: 'gpt-4o',
        temperature: 0.1,
        maxTokens: 100,
        messages: [{ role: 'user', content: 'hello' }],
      })
    ).toMatchObject({
      model: 'gpt-4o',
      max_tokens: 100,
      temperature: 0.1,
    });
  });
});
