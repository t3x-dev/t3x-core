import { describe, expect, it } from 'vitest';
import { type LLMProvider, LLMProviderError } from '../../../llm/types';
import { runExtractionV2Pipeline } from '../pipeline';

describe('extractors/v2 pipeline', () => {
  it('runs one canonical bootstrap pipeline from structured draft to compiled ops', async () => {
    const provider: Pick<LLMProvider, 'generateStructured'> = {
      async generateStructured() {
        return {
          data: {
            schema: 't3x/provider-extraction-draft',
            version: 1,
            mode: 'bootstrap',
            items: [
              {
                id: 'item_1',
                intent: 'add',
                confidence: 0.9,
                reasoning_type: 'direct',
                target_ref: {
                  node_key: null,
                  path: null,
                  existing_node_id: null,
                },
                candidate: {
                  key: 'airport_issue',
                  path_hint: 'airport_issue',
                  slot: null,
                  value_json: null,
                  values_json: '{"summary":"SEA had a cyberattack"}',
                  children_json: null,
                },
                evidence: [
                  {
                    turn_tag: 'T1',
                    quote: 'Seattle-Tacoma International Airport (SEA)',
                    role: 'primary',
                  },
                ],
              },
            ],
            warnings: [],
          },
          usage: { inputTokens: 10, outputTokens: 5 },
        };
      },
    };

    const result = await runExtractionV2Pipeline({
      turns: [
        {
          turn_hash: 'sha256:turn-1',
          role: 'assistant',
          content: 'Seattle-Tacoma International Airport (SEA) had a cyberattack.',
        },
      ],
      mode: 'bootstrap',
      providerId: 'anthropic',
      model: 'claude-sonnet-4-6',
      provider,
      extractedAt: '2026-04-19T00:00:00.000Z',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.turnHashByTag).toEqual({ T1: 'sha256:turn-1' });
    expect(result.draft.schema).toBe('t3x/extraction-draft');
    expect(result.compiled.ops).toHaveLength(2);
  });

  it('preserves original turn roles in the provider prompt context', async () => {
    let capturedPrompt = '';
    const provider: Pick<LLMProvider, 'generateStructured'> = {
      async generateStructured(prompt) {
        capturedPrompt = prompt.messages[0].content as string;
        return {
          data: {
            schema: 't3x/provider-extraction-draft',
            version: 1,
            mode: 'incremental',
            items: [],
            warnings: [],
          },
          usage: { inputTokens: 1, outputTokens: 1 },
        };
      },
    };

    await runExtractionV2Pipeline({
      turns: [
        { turn_hash: 'sha256:1', role: 'user', content: 'hello' },
        { turn_hash: 'sha256:2', role: 'assistant', content: 'world' },
      ],
      mode: 'incremental',
      providerId: 'openai',
      model: 'gpt-5.4',
      provider,
    });

    expect(capturedPrompt).toContain('[T1][user]');
    expect(capturedPrompt).toContain('[T2][assistant]');
    expect(capturedPrompt).toContain('ProviderExtractionDraft');
    expect(capturedPrompt).toContain('Mode: incremental');
  });

  it('uses one provider-agnostic prompt (F9): no per-provider branches, no shape rules', async () => {
    // F9 removed the per-provider prompt branches and the redundant shape
    // rules. All providers now receive the same short prompt; shape drift
    // is fixed deterministically in providerDraft.ts.
    const captured: Record<string, { system?: string; user: string }> = {};
    const capture = (providerId: string): Pick<LLMProvider, 'generateStructured'> =>
      ({
        async generateStructured(prompt) {
          captured[providerId] = {
            system: prompt.system,
            user: prompt.messages[0].content as string,
          };
          return {
            data: {
              schema: 't3x/provider-extraction-draft',
              version: 1,
              mode: 'bootstrap',
              items: [],
              warnings: [],
            },
            usage: { inputTokens: 1, outputTokens: 1 },
          };
        },
      }) as Pick<LLMProvider, 'generateStructured'>;

    const baseInput = {
      turns: [{ turn_hash: 'sha256:1', role: 'assistant', content: 'SEA had a cyberattack.' }],
      mode: 'bootstrap' as const,
    };

    await runExtractionV2Pipeline({
      ...baseInput,
      providerId: 'anthropic',
      model: 'claude-sonnet-4-6',
      provider: capture('anthropic'),
    });
    await runExtractionV2Pipeline({
      ...baseInput,
      providerId: 'openai',
      model: 'gpt-5.4',
      provider: capture('openai'),
    });
    await runExtractionV2Pipeline({
      ...baseInput,
      providerId: 'google',
      model: 'gemini-2.5-pro',
      provider: capture('google'),
    });

    // All three prompts must be identical.
    expect(captured.anthropic).toEqual(captured.openai);
    expect(captured.openai).toEqual(captured.google);

    // And must not drag in the old rules the deterministic layer now handles.
    const prompt = captured.anthropic.user;
    expect(prompt).not.toContain('children_json must always be a JSON array string');
    expect(prompt).not.toContain('Use value_json for scalar values and arrays');
    expect(prompt).not.toContain('ProviderExtractionDraft JSON shape example');
    expect(prompt).not.toContain('For update or reinforce items');
    expect(prompt).not.toContain('schema, version, mode, items, warnings');
  });

  it('returns a typed draft_parse failure when provider JSON string fields are invalid', async () => {
    const provider: Pick<LLMProvider, 'generateStructured'> = {
      async generateStructured() {
        return {
          data: {
            schema: 't3x/provider-extraction-draft',
            version: 1,
            mode: 'bootstrap',
            items: [
              {
                id: 'item_1',
                intent: 'add',
                confidence: 0.9,
                reasoning_type: 'direct',
                target_ref: {
                  node_key: null,
                  path: null,
                  existing_node_id: null,
                },
                candidate: {
                  key: 'airport_issue',
                  path_hint: 'airport_issue',
                  slot: null,
                  value_json: null,
                  values_json: '{"summary"',
                  children_json: null,
                },
                evidence: [
                  {
                    turn_tag: 'T1',
                    quote: 'Seattle-Tacoma International Airport (SEA)',
                    role: 'primary',
                  },
                ],
              },
            ],
            warnings: [],
          },
          usage: { inputTokens: 1, outputTokens: 1 },
        };
      },
    };

    const result = await runExtractionV2Pipeline({
      turns: [{ turn_hash: 'sha256:1', role: 'assistant', content: 'SEA had a cyberattack.' }],
      mode: 'bootstrap',
      providerId: 'anthropic',
      model: 'claude-sonnet-4-6',
      provider,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.failure.code).toBe('draft_parse');
  });

  it('returns typed transport failures instead of throwing provider errors', async () => {
    const provider: Pick<LLMProvider, 'generateStructured'> = {
      async generateStructured() {
        throw new LLMProviderError('openai', 429, 'rate limited');
      },
    };

    const result = await runExtractionV2Pipeline({
      turns: [{ turn_hash: 'sha256:1', role: 'user', content: 'hello' }],
      mode: 'bootstrap',
      providerId: 'openai',
      model: 'gpt-5.4',
      provider,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.failure.code).toBe('transport');
    expect(result.failure.retry.strategy).toBe('backoff');
  });

  it('reasks once on draft_schema failure with targeted validation feedback', async () => {
    let calls = 0;
    let secondPrompt = '';
    const provider: Pick<LLMProvider, 'generateStructured'> = {
      async generateStructured(prompt) {
        calls += 1;
        if (calls === 2) {
          secondPrompt = prompt.messages[1]?.content as string;
        }

        if (calls === 1) {
          return {
            data: {
              schema: 't3x/provider-extraction-draft',
              version: 1,
              mode: 'bootstrap',
              items: [
                {
                  id: 'item_1',
                  intent: 'add',
                  confidence: 0.9,
                  reasoning_type: 'direct',
                  target_ref: {
                    node_key: null,
                    path: null,
                    existing_node_id: null,
                  },
                  candidate: {
                    key: 'airport_issue',
                    path_hint: 'airport_issue',
                    slot: null,
                    value_json: null,
                    values_json: '{"summary":"SEA had a cyberattack"}',
                    children_json:
                      '[{"key":"Baggage Handling","values":{"description":"Automated baggage systems were disrupted"}}]',
                  },
                  // Empty evidence fails min(1) and cannot be rescued
                  // deterministically — we must not fabricate provenance.
                  evidence: [],
                },
              ],
              warnings: [],
            },
            usage: { inputTokens: 1, outputTokens: 1 },
          };
        }

        return {
          data: {
            schema: 't3x/provider-extraction-draft',
            version: 1,
            mode: 'bootstrap',
            items: [
              {
                id: 'item_1',
                intent: 'add',
                confidence: 0.9,
                reasoning_type: 'direct',
                target_ref: {
                  node_key: null,
                  path: null,
                  existing_node_id: null,
                },
                candidate: {
                  key: 'airport_issue',
                  path_hint: 'airport_issue',
                  slot: null,
                  value_json: null,
                  values_json: '{"summary":"SEA had a cyberattack"}',
                  children_json:
                    '[{"key":"Baggage Handling","values":{"description":"Automated baggage systems were disrupted"}}]',
                },
                evidence: [
                  {
                    turn_tag: 'T1',
                    quote: 'Seattle-Tacoma International Airport (SEA)',
                    role: 'primary',
                  },
                ],
              },
            ],
            warnings: [],
          },
          usage: { inputTokens: 1, outputTokens: 1 },
        };
      },
    };

    const result = await runExtractionV2Pipeline({
      turns: [{ turn_hash: 'sha256:1', role: 'assistant', content: 'SEA had a cyberattack.' }],
      mode: 'bootstrap',
      providerId: 'anthropic',
      model: 'claude-sonnet-4-6',
      provider,
    });

    expect(result.ok).toBe(true);
    expect(calls).toBe(2);
    expect(secondPrompt).toContain('Your previous ProviderExtractionDraft failed validation');
    // First attempt emitted empty evidence; reask prompt should surface that.
    expect(secondPrompt).toContain('evidence');
  });

  it('reasks once on provenance failure and lists allowed turn tags', async () => {
    let calls = 0;
    let secondPrompt = '';
    const provider: Pick<LLMProvider, 'generateStructured'> = {
      async generateStructured(prompt) {
        calls += 1;
        if (calls === 2) {
          secondPrompt = prompt.messages[1]?.content as string;
        }

        return {
          data: {
            schema: 't3x/provider-extraction-draft',
            version: 1,
            mode: 'bootstrap',
            items: [
              {
                id: 'item_1',
                intent: 'add',
                confidence: 0.9,
                reasoning_type: 'direct',
                target_ref: {
                  node_key: null,
                  path: null,
                  existing_node_id: null,
                },
                candidate: {
                  key: 'airport_issue',
                  path_hint: 'airport_issue',
                  slot: null,
                  value_json: null,
                  values_json: '{"summary":"SEA had a cyberattack"}',
                  children_json: null,
                },
                evidence: [
                  {
                    turn_tag: calls === 1 ? 'T3' : 'T1',
                    quote: 'Seattle-Tacoma International Airport (SEA)',
                    role: 'primary',
                  },
                ],
              },
            ],
            warnings: [],
          },
          usage: { inputTokens: 1, outputTokens: 1 },
        };
      },
    };

    const result = await runExtractionV2Pipeline({
      turns: [{ turn_hash: 'sha256:1', role: 'assistant', content: 'SEA had a cyberattack.' }],
      mode: 'bootstrap',
      providerId: 'openai',
      model: 'gpt-5.4',
      provider,
    });

    expect(result.ok).toBe(true);
    expect(calls).toBe(2);
    expect(secondPrompt).toContain('Use only these turn tags');
    expect(secondPrompt).toContain('T1');
  });

  it('reasks once on reaskable compile failure with candidate payload guidance', async () => {
    let calls = 0;
    let secondPrompt = '';
    const provider: Pick<LLMProvider, 'generateStructured'> = {
      async generateStructured(prompt) {
        calls += 1;
        if (calls === 2) {
          secondPrompt = prompt.messages[1]?.content as string;
        }

        return {
          data: {
            schema: 't3x/provider-extraction-draft',
            version: 1,
            mode: 'incremental',
            items: [
              {
                id: 'item_1',
                intent: 'reinforce',
                confidence: 0.9,
                reasoning_type: 'direct',
                target_ref: {
                  node_key: calls === 1 ? 'airport_issue' : null,
                  path: calls === 1 ? null : 'airport_issue',
                  existing_node_id: null,
                },
                candidate: {
                  key: null,
                  path_hint: null,
                  slot: null,
                  value_json: null,
                  values_json: calls === 1 ? null : '{"summary":"SEA had a cyberattack"}',
                  children_json: null,
                },
                evidence: [
                  {
                    turn_tag: 'T1',
                    quote: 'Seattle-Tacoma International Airport (SEA)',
                    role: 'primary',
                  },
                ],
              },
            ],
            warnings: [],
          },
          usage: { inputTokens: 1, outputTokens: 1 },
        };
      },
    };

    const result = await runExtractionV2Pipeline({
      turns: [{ turn_hash: 'sha256:1', role: 'assistant', content: 'SEA had a cyberattack.' }],
      mode: 'incremental',
      providerId: 'openai',
      model: 'gpt-5.4-nano',
      provider,
    });

    expect(result.ok).toBe(true);
    expect(calls).toBe(2);
    expect(secondPrompt).toContain('include either candidate.values_json as a JSON object string');
    expect(secondPrompt).toContain('airport_issue');
  });
});
