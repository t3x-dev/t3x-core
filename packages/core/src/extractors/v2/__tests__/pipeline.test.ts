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

  it('compiles bare value_json add items into define plus value-slot set ops', async () => {
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
                confidence: 0.99,
                reasoning_type: 'direct',
                target_ref: {
                  node_key: null,
                  path: null,
                  existing_node_id: null,
                },
                candidate: {
                  key: 'trip_duration_days',
                  path_hint: 'trip.duration_days',
                  slot: null,
                  value_json: '5',
                  values_json: null,
                  children_json: null,
                },
                evidence: [
                  {
                    turn_tag: 'T1',
                    quote: '5 days',
                    role: 'primary',
                  },
                ],
              },
              {
                id: 'item_2',
                intent: 'add',
                confidence: 0.98,
                reasoning_type: 'direct',
                target_ref: {
                  node_key: null,
                  path: null,
                  existing_node_id: null,
                },
                candidate: {
                  key: 'must_visit_pois',
                  path_hint: 'trip.preferences.must_visit_pois',
                  slot: null,
                  value_json: '["West Lake","Lingyin Temple"]',
                  values_json: null,
                  children_json: null,
                },
                evidence: [
                  {
                    turn_tag: 'T1',
                    quote: 'West Lake and Lingyin Temple',
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
      turns: [{ turn_hash: 'sha256:turn-1', role: 'user', content: '5 days in Hangzhou.' }],
      mode: 'bootstrap',
      providerId: 'openai',
      model: 'gpt-5.4',
      provider,
      extractedAt: '2026-04-22T00:00:00.000Z',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.compiled.ops).toHaveLength(4);
    expect(result.compiled.ops).toEqual(
      expect.arrayContaining([
        // Compiler normalises dotted LLM paths (`trip.duration_days`) to
        // slashed YOps paths so the workspace renders the result as a
        // proper nested tree, not a flat root with literal-dot keys.
        expect.objectContaining({ define: { path: 'trip/duration_days' } }),
        expect.objectContaining({ set: { path: 'trip/duration_days/value', value: 5 } }),
        expect.objectContaining({ define: { path: 'trip/preferences/must_visit_pois' } }),
        expect.objectContaining({
          set: {
            path: 'trip/preferences/must_visit_pois/value',
            value: ['West Lake', 'Lingyin Temple'],
          },
        }),
      ])
    );
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

  it('system prompt instructs LLM not to emit empty structure (small-model failure mode)', () => {
    // Quality rules in the system prompt are the second layer behind
    // the deterministic empty-define guard in compileExtractionDraft.
    // The guard is the safety net; the prompt is the first attempt to
    // get good output. Pinning the key phrases here keeps the rules
    // from being silently weakened in a future prompt edit.
    const captured: { system?: string } = {};
    const capture: Pick<LLMProvider, 'generateStructured'> = {
      async generateStructured(prompt) {
        captured.system = prompt.system;
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
    };

    return runExtractionV2Pipeline({
      turns: [{ turn_hash: 'sha256:1', role: 'assistant', content: 'fact.' }],
      mode: 'bootstrap',
      providerId: 'anthropic',
      model: 'claude-sonnet-4-6',
      provider: capture,
    }).then(() => {
      const system = captured.system ?? '';
      // Concrete-fact requirement.
      expect(system).toMatch(/concrete fact/i);
      // No section-header / outline mode.
      expect(system).toMatch(/section headers/i);
      // Extend snapshot, don't duplicate categories.
      expect(system).toMatch(/extend it|extend the snapshot|extend it\./i);
      // Empty draft is correct, outline of empty buckets is not.
      expect(system).toMatch(/empty buckets|items: \[\]/i);
    });
  });

  it('system prompt names provider schema fields (values_json, value_json, children_json)', () => {
    // The provider schema's candidate fields are JSON-string-shaped:
    // value_json, values_json, children_json. Earlier prompt drafts
    // referenced canonical post-normalization names (candidate.values,
    // candidate.value, candidate.children[].values), which are not
    // accepted by ProviderCandidateSchema and would be silently dropped
    // by coerceCandidate — turning real facts back into bare defines
    // that the empty-define guard would then drop.
    //
    // Pin the provider field names + JSON-string shape so a future
    // prompt edit can't drift back to the canonical names.
    const captured: { system?: string } = {};
    const capture: Pick<LLMProvider, 'generateStructured'> = {
      async generateStructured(prompt) {
        captured.system = prompt.system;
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
    };

    return runExtractionV2Pipeline({
      turns: [{ turn_hash: 'sha256:1', role: 'assistant', content: 'fact.' }],
      mode: 'bootstrap',
      providerId: 'anthropic',
      model: 'claude-sonnet-4-6',
      provider: capture,
    }).then(() => {
      const system = captured.system ?? '';
      expect(system).toContain('values_json');
      expect(system).toContain('value_json');
      expect(system).toContain('children_json');
      // The example values_json clearly shows it as a stringified object —
      // a model copying the example will emit a JSON-string, not a raw
      // object that the strict schema rejects.
      expect(system).toMatch(/"values_json"\s*:\s*"\{/);
    });
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
          secondPrompt = prompt.messages[prompt.messages.length - 1]?.content as string;
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
                    '[{"key":"baggage_handling","values":{"description":"Automated baggage systems were disrupted"}}]',
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

  it('F13: the reask prompt replays the prior draft as an assistant message', async () => {
    let calls = 0;
    let secondPromptMessages: Array<{ role: string; content: unknown }> = [];
    const provider: Pick<LLMProvider, 'generateStructured'> = {
      async generateStructured(prompt) {
        calls += 1;
        if (calls === 2) {
          secondPromptMessages = prompt.messages as Array<{ role: string; content: unknown }>;
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
                  target_ref: { node_key: null, path: null, existing_node_id: null },
                  candidate: {
                    key: 'airport_issue',
                    path_hint: 'airport_issue',
                    slot: null,
                    value_json: null,
                    values_json: '{"summary":"SEA had a cyberattack"}',
                    children_json: null,
                  },
                  // First attempt: empty evidence triggers draft_schema failure.
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
                target_ref: { node_key: null, path: null, existing_node_id: null },
                candidate: {
                  key: 'airport_issue',
                  path_hint: 'airport_issue',
                  slot: null,
                  value_json: null,
                  values_json: '{"summary":"SEA had a cyberattack"}',
                  children_json: null,
                },
                evidence: [{ turn_tag: 'T1', quote: 'SEA cyberattack', role: 'primary' }],
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
    // The reask conversation should be: [original user prompt, assistant replay
    // of prior draft, user correction]. Assistant replay carries what the model
    // previously emitted so it can fix incrementally.
    expect(secondPromptMessages.length).toBeGreaterThanOrEqual(3);
    const assistantReplay = secondPromptMessages.find((m) => m.role === 'assistant');
    expect(assistantReplay).toBeDefined();
    // The replay should quote back the item structure verbatim.
    expect(String(assistantReplay?.content)).toContain('airport_issue');
    // The final message should be the user correction.
    const last = secondPromptMessages[secondPromptMessages.length - 1];
    expect(last.role).toBe('user');
    expect(String(last.content)).toContain(
      'Your previous ProviderExtractionDraft failed validation'
    );
  });

  it('reasks once on provenance failure and lists allowed turn tags', async () => {
    let calls = 0;
    let secondPrompt = '';
    const provider: Pick<LLMProvider, 'generateStructured'> = {
      async generateStructured(prompt) {
        calls += 1;
        if (calls === 2) {
          secondPrompt = prompt.messages[prompt.messages.length - 1]?.content as string;
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
          secondPrompt = prompt.messages[prompt.messages.length - 1]?.content as string;
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

  it('reasks with child-key-specific guidance when candidate.children[].key is invalid', async () => {
    // Pre-fix the targeted reask only knew how to talk about
    // candidate.values_json / candidate.slot — a model emitting an invalid
    // child key got the wrong instructions back. After the fix, the reask
    // names the field, surfaces the rejected key, and gives examples.
    let calls = 0;
    let secondPrompt = '';
    const provider: Pick<LLMProvider, 'generateStructured'> = {
      async generateStructured(prompt) {
        calls += 1;
        if (calls === 2) {
          secondPrompt = prompt.messages[prompt.messages.length - 1]?.content as string;
        }
        const childKey = calls === 1 ? 'Bad Key' : 'fixed_child';
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
                target_ref: { node_key: null, path: null, existing_node_id: null },
                candidate: {
                  key: 'parent',
                  path_hint: 'parent',
                  slot: null,
                  value_json: null,
                  values_json: null,
                  children_json: `[{"key":"${childKey}","values":{"k":"v"}}]`,
                },
                evidence: [{ turn_tag: 'T1', quote: 'parent material', role: 'primary' }],
              },
            ],
            warnings: [],
          },
          usage: { inputTokens: 1, outputTokens: 1 },
        };
      },
    };

    const result = await runExtractionV2Pipeline({
      turns: [{ turn_hash: 'sha256:1', role: 'user', content: 'parent material' }],
      mode: 'bootstrap',
      providerId: 'openai',
      model: 'gpt-5.4-nano',
      provider,
    });

    expect(result.ok).toBe(true);
    expect(calls).toBe(2);
    expect(secondPrompt).toContain('candidate.children[].key');
    expect(secondPrompt).toContain('Bad Key');
    expect(secondPrompt).toContain('snake_case');
    // The values_json branch must NOT fire for this failure shape; that
    // was the old bug — wrong field-specific guidance.
    expect(secondPrompt).not.toContain('include either candidate.values_json');
  });

  it('reasks with path-field-specific guidance when candidate.path_hint is invalid', async () => {
    // P2 fail-fast: the compiler now emits a reaskable failure naming
    // the specific path field (target_ref.path / candidate.path_hint /
    // etc.) instead of silently falling through to the next candidate.
    // The reask should mention the field, surface the invalid value,
    // and tell the model to fix THAT field — not switch to a different
    // field or invent values_json.
    let calls = 0;
    let secondPrompt = '';
    const provider: Pick<LLMProvider, 'generateStructured'> = {
      async generateStructured(prompt) {
        calls += 1;
        if (calls === 2) {
          secondPrompt = prompt.messages[prompt.messages.length - 1]?.content as string;
        }
        const pathHint = calls === 1 ? 'CamelCasePath' : 'snake_case_path';
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
                target_ref: { node_key: null, path: null, existing_node_id: null },
                candidate: {
                  key: null,
                  path_hint: pathHint,
                  slot: null,
                  value_json: null,
                  values_json: '{"k":"v"}',
                  children_json: null,
                },
                evidence: [{ turn_tag: 'T1', quote: 'q', role: 'primary' }],
              },
            ],
            warnings: [],
          },
          usage: { inputTokens: 1, outputTokens: 1 },
        };
      },
    };

    const result = await runExtractionV2Pipeline({
      turns: [{ turn_hash: 'sha256:1', role: 'user', content: 'q' }],
      mode: 'bootstrap',
      providerId: 'openai',
      model: 'gpt-5.4-nano',
      provider,
    });

    expect(result.ok).toBe(true);
    expect(calls).toBe(2);
    expect(secondPrompt).toContain('candidate.path_hint');
    expect(secondPrompt).toContain('CamelCasePath');
    // Tells the model to fix THIS field, not introduce values_json or
    // switch to a different intent. The exact wording is the
    // anti-fall-through guidance.
    expect(secondPrompt).toContain('Fix this exact field');
    expect(secondPrompt).not.toContain('include either candidate.values_json');
  });

  it('after reask exhaustion on a reaskable compile failure, salvages well-formed siblings via partial compile', async () => {
    // Repro of the conv_bedc22e9 failure shape on the Claude path: the
    // model keeps emitting the same bad child key across all reask
    // attempts. Pre-fix the whole batch was thrown away with a 400.
    // Post-fix: after reask attempts exhaust, the pipeline runs one
    // more compile in `allowPartial` mode and returns the siblings that
    // *did* compile, with a warning naming the dropped item.
    let calls = 0;
    const provider: Pick<LLMProvider, 'generateStructured'> = {
      async generateStructured() {
        calls += 1;
        // Every attempt emits the same shape: one good item, one item
        // with a bad child key. The model never fixes it.
        return {
          data: {
            schema: 't3x/provider-extraction-draft',
            version: 1,
            mode: 'bootstrap',
            items: [
              {
                id: 'item_good',
                intent: 'add',
                confidence: 0.9,
                reasoning_type: 'direct',
                target_ref: { node_key: null, path: null, existing_node_id: null },
                candidate: {
                  key: 'sony',
                  path_hint: 'sony',
                  slot: null,
                  value_json: null,
                  values_json: '{"availability":"unreleased"}',
                  children_json: null,
                },
                evidence: [{ turn_tag: 'T1', quote: 'unreleased', role: 'primary' }],
              },
              {
                id: 'item_bad_child',
                intent: 'add',
                confidence: 0.9,
                reasoning_type: 'direct',
                target_ref: { node_key: null, path: null, existing_node_id: null },
                candidate: {
                  key: 'specs',
                  path_hint: 'specs',
                  slot: null,
                  value_json: null,
                  values_json: null,
                  children_json: '[{"key":"61 megapixels","values":{"v":"x"}}]',
                },
                evidence: [{ turn_tag: 'T1', quote: 'spec', role: 'primary' }],
              },
            ],
            warnings: [],
          },
          usage: { inputTokens: 1, outputTokens: 1 },
        };
      },
    };

    const result = await runExtractionV2Pipeline({
      turns: [
        {
          turn_hash: 'sha256:1',
          role: 'user',
          content: 'sony availability unreleased; spec is 61 megapixels',
        },
      ],
      mode: 'bootstrap',
      providerId: 'anthropic',
      model: 'claude-sonnet-4-6',
      provider,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Both reask attempts ran (the model never fixed the child key),
    // then partial compile salvaged the well-formed sibling.
    expect(calls).toBe(2);
    const definePaths = result.compiled.ops
      .filter((op): op is Extract<typeof op, { define: unknown }> => 'define' in op)
      .map((op) => op.define.path);
    expect(definePaths).toContain('sony');
    expect(definePaths).not.toContain('specs');
    // Warnings name both the partial-compile boundary and the dropped item.
    const warnings = result.compiled.warnings.join('\n');
    expect(warnings).toMatch(/Partial compile after reask exhaustion/);
    expect(warnings).toMatch(/item_bad_child/);
  });

  it('does not partial-salvage non-reaskable compile failures on attempt 1 (no silent drop without reask)', async () => {
    // Guards against the gate being too loose: a non-reaskable compile
    // failure (e.g. unsupported draft intent) must NOT silently drop
    // items and return siblings without any reask ever happening. The
    // model never had a chance to self-correct, so the only honest
    // outcome is the original failure.
    let calls = 0;
    const provider: Pick<LLMProvider, 'generateStructured'> = {
      async generateStructured() {
        calls += 1;
        return {
          data: {
            schema: 't3x/provider-extraction-draft',
            version: 1,
            mode: 'bootstrap',
            items: [
              {
                id: 'item_good',
                intent: 'add',
                confidence: 0.9,
                reasoning_type: 'direct',
                target_ref: { node_key: null, path: null, existing_node_id: null },
                candidate: {
                  key: 'sony',
                  path_hint: 'sony',
                  slot: null,
                  value_json: null,
                  values_json: '{"availability":"unreleased"}',
                  children_json: null,
                },
                evidence: [{ turn_tag: 'T1', quote: 'unreleased', role: 'primary' }],
              },
              {
                id: 'item_remove_no_target',
                // `remove intent requires target_ref or candidate path`
                // (compiler.ts:422-427) emits a compile failure WITHOUT
                // `reaskable: true`, so `shouldTargetedReask` returns
                // false. Pre-fix, the partial branch fired on attempt 1
                // and silently dropped this item; post-fix the gate
                // requires `attempt >= maxAttempts && reaskable`, so
                // the original failure surfaces and the model is never
                // asked to fix something we have no targeted guidance
                // for.
                intent: 'remove',
                confidence: 0.9,
                reasoning_type: 'direct',
                target_ref: { node_key: null, path: null, existing_node_id: null },
                candidate: {
                  key: null,
                  path_hint: null,
                  slot: null,
                  value_json: null,
                  values_json: null,
                  children_json: null,
                },
                evidence: [{ turn_tag: 'T1', quote: 'spec', role: 'primary' }],
              },
            ],
            warnings: [],
          },
          usage: { inputTokens: 1, outputTokens: 1 },
        };
      },
    };

    const result = await runExtractionV2Pipeline({
      turns: [{ turn_hash: 'sha256:1', role: 'user', content: 'q' }],
      mode: 'bootstrap',
      providerId: 'anthropic',
      model: 'claude-sonnet-4-6',
      provider,
    });

    // No reask attempted (failure isn't reaskable), no salvage path
    // taken, no silently dropped item — the original failure is what
    // the caller sees.
    expect(calls).toBe(1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('compile');
    expect(result.failure.message).toMatch(/remove intent requires target_ref/);
  });

  it('does not partial-salvage when every item is malformed — surfaces the original compile failure', async () => {
    // Guard the floor: partial mode returns ok with empty ops in this
    // case, but the pipeline must still report failure so the client
    // sees a real diagnostic instead of "0 ops with no error".
    const provider: Pick<LLMProvider, 'generateStructured'> = {
      async generateStructured() {
        return {
          data: {
            schema: 't3x/provider-extraction-draft',
            version: 1,
            mode: 'bootstrap',
            items: [
              {
                id: 'item_a',
                intent: 'add',
                confidence: 0.9,
                reasoning_type: 'direct',
                target_ref: { node_key: null, path: null, existing_node_id: null },
                candidate: {
                  key: 'parent_a',
                  path_hint: 'parent_a',
                  slot: null,
                  value_json: null,
                  values_json: null,
                  children_json: '[{"key":"Bad A","values":{"v":"x"}}]',
                },
                evidence: [{ turn_tag: 'T1', quote: 'a', role: 'primary' }],
              },
              {
                id: 'item_b',
                intent: 'add',
                confidence: 0.9,
                reasoning_type: 'direct',
                target_ref: { node_key: null, path: null, existing_node_id: null },
                candidate: {
                  key: 'parent_b',
                  path_hint: 'parent_b',
                  slot: null,
                  value_json: null,
                  values_json: null,
                  children_json: '[{"key":"Bad B","values":{"v":"y"}}]',
                },
                evidence: [{ turn_tag: 'T1', quote: 'b', role: 'primary' }],
              },
            ],
            warnings: [],
          },
          usage: { inputTokens: 1, outputTokens: 1 },
        };
      },
    };

    const result = await runExtractionV2Pipeline({
      turns: [{ turn_hash: 'sha256:1', role: 'user', content: 'a and b' }],
      mode: 'bootstrap',
      providerId: 'anthropic',
      model: 'claude-sonnet-4-6',
      provider,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('compile');
  });

  describe('extraction style threading', () => {
    // The Concise/Balanced/Detailed dropdown in the workspace was UI-only
    // before this PR — the preset never reached the prompt. These tests
    // pin the wire-through: a `style` input on the pipeline materially
    // changes the system prompt, with concise carrying a hard budget.

    function captureSystem() {
      const captured: { system?: string } = {};
      const provider: Pick<LLMProvider, 'generateStructured'> = {
        async generateStructured(prompt) {
          captured.system = prompt.system;
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
      };
      return { captured, provider };
    }

    it('omits style guidance when no style is supplied (preserves historical prompt)', async () => {
      const { captured, provider } = captureSystem();
      await runExtractionV2Pipeline({
        turns: [{ turn_hash: 'sha256:1', role: 'user', content: 'a' }],
        mode: 'bootstrap',
        providerId: 'anthropic',
        model: 'claude-sonnet-4-6',
        provider,
      });
      const system = captured.system ?? '';
      expect(system).not.toMatch(/Extraction mode:/i);
      expect(system).not.toMatch(/Concise budget/i);
    });

    it('concise style adds a hard 6-item budget + single-tree shape rule', async () => {
      const { captured, provider } = captureSystem();
      await runExtractionV2Pipeline({
        turns: [{ turn_hash: 'sha256:1', role: 'user', content: 'a' }],
        mode: 'bootstrap',
        providerId: 'anthropic',
        model: 'claude-sonnet-4-6',
        provider,
        style: {
          granularity: 'concise',
          quote_length: 'representative',
          update_stance: 'conservative',
          tier3: 'extract',
        },
      });
      const system = captured.system ?? '';
      // Style summary line is present.
      expect(system).toMatch(/Extraction mode: concise/i);
      // Hard 6-item ceiling — concise must not produce 60-op outputs.
      expect(system).toMatch(/at most ~6 items/i);
      // Single-tree shape rule — direct fix for the "17 parallel root
      // nodes" failure mode in the Sony camera reproduction.
      expect(system).toMatch(/path prefix/i);
      expect(system).toMatch(/cameras\/sony/i);
    });

    it('detailed style asks for nuance under existing tree paths', async () => {
      const { captured, provider } = captureSystem();
      await runExtractionV2Pipeline({
        turns: [{ turn_hash: 'sha256:1', role: 'user', content: 'a' }],
        mode: 'bootstrap',
        providerId: 'anthropic',
        model: 'claude-sonnet-4-6',
        provider,
        style: {
          granularity: 'detailed',
          quote_length: 'representative',
          update_stance: 'aggressive',
          tier3: 'extract',
        },
      });
      const system = captured.system ?? '';
      expect(system).toMatch(/Extraction mode: detailed/i);
      expect(system).toMatch(/capture nuance/i);
      // Still must not encourage flat root.
      expect(system).toMatch(/not a flat root/i);
    });

    it('balanced style emits the summary but no extra budget rules', async () => {
      const { captured, provider } = captureSystem();
      await runExtractionV2Pipeline({
        turns: [{ turn_hash: 'sha256:1', role: 'user', content: 'a' }],
        mode: 'bootstrap',
        providerId: 'anthropic',
        model: 'claude-sonnet-4-6',
        provider,
        style: {
          granularity: 'balanced',
          quote_length: 'representative',
          update_stance: 'balanced',
          tier3: 'extract',
        },
      });
      const system = captured.system ?? '';
      expect(system).toMatch(/Extraction mode: balanced/i);
      expect(system).not.toMatch(/at most ~6 items/i);
    });

    it('concise prompt is materially different from balanced (sanity)', async () => {
      const concise = captureSystem();
      const balanced = captureSystem();
      await runExtractionV2Pipeline({
        turns: [{ turn_hash: 'sha256:1', role: 'user', content: 'a' }],
        mode: 'bootstrap',
        providerId: 'anthropic',
        model: 'claude-sonnet-4-6',
        provider: concise.provider,
        style: {
          granularity: 'concise',
          quote_length: 'representative',
          update_stance: 'conservative',
          tier3: 'extract',
        },
      });
      await runExtractionV2Pipeline({
        turns: [{ turn_hash: 'sha256:1', role: 'user', content: 'a' }],
        mode: 'bootstrap',
        providerId: 'anthropic',
        model: 'claude-sonnet-4-6',
        provider: balanced.provider,
        style: {
          granularity: 'balanced',
          quote_length: 'representative',
          update_stance: 'balanced',
          tier3: 'extract',
        },
      });
      // The whole point of the dropdown is that prompts differ. If they're
      // ever equal again, the preset is back to being dead UI.
      expect(concise.captured.system).not.toEqual(balanced.captured.system);
    });
  });
});
