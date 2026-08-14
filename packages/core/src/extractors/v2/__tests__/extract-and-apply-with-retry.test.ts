import { describe, expect, it } from 'vitest';
import type { LLMProvider } from '../../../llm/types';
import { LLMProviderError } from '../../../llm/types';
import { extractAndApplyWithRetry } from '../extract-and-apply-with-retry';

function input(provider: Pick<LLMProvider, 'generateStructured'>, sleeps: number[]) {
  return {
    turns: [{ turn_hash: 'sha256:t1', role: 'user' as const, content: 'Hangzhou trip' }],
    mode: 'bootstrap' as const,
    providerId: 'google',
    provider,
    model: 'gemini-3.1-flash-lite',
    transportRetry: {
      baseDelayMs: 10,
      sleep: async (delayMs: number) => {
        sleeps.push(delayMs);
      },
    },
  };
}

function draft() {
  return {
    schema: 't3x/provider-extraction-draft',
    version: 1,
    mode: 'bootstrap',
    items: [
      {
        id: 'item_1',
        intent: 'add',
        confidence: 0.9,
        reasoning_type: 'direct',
        target_ref: { node_key: null, path: null, existing_node_id: null },
        candidate: {
          key: 'trip',
          path_hint: 'trip',
          slot: null,
          value_json: null,
          values_json: '{"city":"Hangzhou"}',
          children_json: null,
        },
        evidence: [{ turn_tag: 'T1', quote: 'Hangzhou trip', role: 'primary' }],
      },
    ],
    warnings: [],
  };
}

describe('extractAndApplyWithRetry', () => {
  it('retries transient transport failures with bounded attempts', async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const provider: Pick<LLMProvider, 'generateStructured'> = {
      async generateStructured() {
        calls += 1;
        if (calls === 1) throw new LLMProviderError('google', 503, 'unavailable');
        return { data: draft(), usage: { inputTokens: 10, outputTokens: 5 } };
      },
    };

    const result = await extractAndApplyWithRetry(input(provider, sleeps));
    expect(result.ok).toBe(true);
    expect(calls).toBe(2);
    expect(sleeps).toEqual([10]);
  });

  it('does not retry authentication failures', async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const provider: Pick<LLMProvider, 'generateStructured'> = {
      async generateStructured() {
        calls += 1;
        throw new LLMProviderError('openai', 401, 'invalid key');
      },
    };

    const result = await extractAndApplyWithRetry(input(provider, sleeps));
    expect(result.ok).toBe(false);
    expect(calls).toBe(1);
    expect(sleeps).toEqual([]);
  });
});
