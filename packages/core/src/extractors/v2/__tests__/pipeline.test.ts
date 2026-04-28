import { describe, expect, it } from 'vitest';
import { type LLMProvider, LLMProviderError } from '../../../llm/types';
import { applyYOps } from '../../../t3x-yops/engine';
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
      // Turn content carries every quote the provider response references —
      // server-side validateSource runs after compile and rejects ops whose
      // turn_ref.quote is not an exact substring. Earlier this fixture had
      // a 5-word turn that didn't contain "West Lake and Lingyin Temple"
      // and got away with it only because validation lived on the web side.
      turns: [
        {
          turn_hash: 'sha256:turn-1',
          role: 'user',
          content: '5 days in Hangzhou. West Lake and Lingyin Temple are highlights.',
        },
      ],
      mode: 'bootstrap',
      providerId: 'openai',
      model: 'gpt-5.4',
      provider,
      extractedAt: '2026-04-22T00:00:00.000Z',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Strict define inserts ancestor defines for each missing parent in
    // a multi-segment path, so the bootstrap compile produces:
    //   define trip
    //   define trip/duration_days
    //   set    trip/duration_days/value = 5
    //   define trip/preferences        ← injected ancestor
    //   define trip/preferences/must_visit_pois
    //   set    trip/preferences/must_visit_pois/value = [...]
    expect(result.compiled.ops).toHaveLength(6);
    expect(result.compiled.ops).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ define: { path: 'trip' } }),
        expect.objectContaining({ define: { path: 'trip/duration_days' } }),
        expect.objectContaining({ set: { path: 'trip/duration_days/value', value: 5 } }),
        expect.objectContaining({ define: { path: 'trip/preferences' } }),
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

  it('treats caller mode as authoritative when provider draft mode drifts', async () => {
    const provider: Pick<LLMProvider, 'generateStructured'> = {
      async generateStructured() {
        return {
          data: {
            schema: 't3x/provider-extraction-draft',
            version: 1,
            // Drift shape observed in real failures: caller selected
            // incremental, but provider still emits bootstrap.
            mode: 'bootstrap',
            items: [
              {
                id: 'item_update',
                intent: 'update',
                confidence: 0.9,
                reasoning_type: 'direct',
                target_ref: {
                  node_key: null,
                  path: 'existing_node',
                  existing_node_id: null,
                },
                candidate: {
                  key: null,
                  path_hint: null,
                  slot: null,
                  value_json: null,
                  values_json: '{"note":"refined"}',
                  children_json: null,
                },
                evidence: [{ turn_tag: 'T1', quote: 'refined', role: 'primary' }],
              },
            ],
            warnings: [],
          },
          usage: { inputTokens: 1, outputTokens: 1 },
        };
      },
    };

    const result = await runExtractionV2Pipeline({
      turns: [{ turn_hash: 'sha256:1', role: 'user', content: 'refined' }],
      mode: 'incremental',
      providerId: 'openai',
      model: 'gpt-5.4',
      provider,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.mode).toBe('incremental');
    expect(result.compiled.ops.some((op) => 'define' in op)).toBe(false);
    expect(result.compiled.ops).toContainEqual(
      expect.objectContaining({ populate: { path: 'existing_node', values: { note: 'refined' } } })
    );
    expect(result.compiled.warnings).not.toContain(
      expect.stringContaining('Promoted update to add in bootstrap mode')
    );
  });

  it('compiles incremental add on existing snapshot nodes as updates that apply cleanly', async () => {
    const snapshot = {
      trees: [
        {
          key: 'trip',
          slots: {},
          children: [{ key: 'budget', slots: { currency: 'CNY' }, children: [] }],
        },
      ],
      relations: [],
    };
    const provider: Pick<LLMProvider, 'generateStructured'> = {
      async generateStructured() {
        return {
          data: {
            schema: 't3x/provider-extraction-draft',
            version: 1,
            mode: 'incremental',
            items: [
              {
                id: 'item_existing_budget',
                intent: 'add',
                confidence: 0.9,
                reasoning_type: 'direct',
                target_ref: {
                  node_key: null,
                  path: null,
                  existing_node_id: null,
                },
                candidate: {
                  key: 'budget',
                  path_hint: 'trip/budget',
                  slot: null,
                  value_json: null,
                  values_json: '{"total":"5000 yuan"}',
                  children_json: null,
                },
                evidence: [{ turn_tag: 'T1', quote: '5000 yuan', role: 'primary' }],
              },
            ],
            warnings: [],
          },
          usage: { inputTokens: 1, outputTokens: 1 },
        };
      },
    };

    const result = await runExtractionV2Pipeline({
      turns: [{ turn_hash: 'sha256:1', role: 'user', content: 'budget is 5000 yuan' }],
      mode: 'incremental',
      snapshot,
      providerId: 'openai',
      model: 'gpt-5.4',
      provider,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.compiled.ops.some((op) => 'define' in op && op.define.path === 'trip/budget')
    ).toBe(false);
    expect(result.compiled.ops).toContainEqual(
      expect.objectContaining({
        populate: { path: 'trip/budget', values: { total: '5000 yuan' } },
      })
    );
    expect(result.compiled.warnings).toContain(
      'Rewrote add intent for existing baseline node "trip/budget" to update semantics (item item_existing_budget)'
    );

    const applied = applyYOps(snapshot, result.compiled.ops);
    expect(applied.ok).toBe(true);
    expect(applied.applied).toBe(result.compiled.ops.length);
  });

  it('routes incremental structured facts away from existing snapshot slots', async () => {
    const snapshot = {
      trees: [
        {
          key: 'travel',
          slots: {},
          children: [
            {
              key: 'destination_trip',
              slots: { budget: 'old budget summary' },
              children: [],
            },
          ],
        },
      ],
      relations: [],
    };
    const provider: Pick<LLMProvider, 'generateStructured'> = {
      async generateStructured() {
        return {
          data: {
            schema: 't3x/provider-extraction-draft',
            version: 1,
            mode: 'incremental',
            items: [
              {
                id: 'item_budget_details',
                intent: 'add',
                confidence: 0.9,
                reasoning_type: 'direct',
                target_ref: {
                  node_key: null,
                  path: null,
                  existing_node_id: null,
                },
                candidate: {
                  key: 'budget',
                  path_hint: 'travel/destination_trip/budget',
                  slot: null,
                  value_json: null,
                  values_json: '{"simple_meal":"20-35 RMB","expected_total":"1,800-2,500 RMB"}',
                  children_json: null,
                },
                evidence: [{ turn_tag: 'T1', quote: '20-35 RMB', role: 'primary' }],
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
          role: 'assistant',
          content: 'For meals, simple meal 20-35 RMB and total 1,800-2,500 RMB.',
        },
      ],
      mode: 'incremental',
      snapshot,
      providerId: 'anthropic',
      model: 'claude-sonnet-4-6',
      provider,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.compiled.ops).toContainEqual(
      expect.objectContaining({ define: { path: 'travel/destination_trip/budget_details' } })
    );
    expect(result.compiled.ops).toContainEqual(
      expect.objectContaining({
        populate: {
          path: 'travel/destination_trip/budget_details',
          values: {
            expected_total: '1,800-2,500 RMB',
            simple_meal: '20-35 RMB',
          },
        },
      })
    );

    const applied = applyYOps(snapshot, result.compiled.ops);
    expect(applied.ok).toBe(true);
    expect(applied.applied).toBe(result.compiled.ops.length);
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

    it('concise style adds the configured item budget + single-tree shape rule', async () => {
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
          max_items: 6,
        },
      });
      const system = captured.system ?? '';
      // Style summary line is present.
      expect(system).toMatch(/Extraction mode: concise/i);
      // Item budget cites the configured max_items, not a hardcoded value.
      expect(system).toMatch(/at most ~6 items/i);
      // Single-tree shape rule — direct fix for the "17 parallel root
      // nodes" failure mode in the Sony camera reproduction.
      expect(system).toMatch(/path prefix/i);
      expect(system).toMatch(/cameras\/sony/i);
    });

    it('concise prompt reflects a custom max_items when caller overrides the preset', async () => {
      // Direct/custom callers can pass max_items=10 with concise. Prompt
      // and deterministic selection must agree on the number — otherwise
      // the model is told 6 while selection keeps 10 (or vice versa).
      // This was the original drift the reviewer flagged.
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
          max_items: 10,
        },
      });
      const system = captured.system ?? '';
      expect(system).toMatch(/at most ~10 items/i);
      expect(system).not.toMatch(/at most ~6 items/i);
    });

    it('concise style without max_items softens the wording (no false hard limit)', async () => {
      // Custom config: granularity 'concise' but no cap. The selection
      // step is a no-op, so the prompt must NOT claim a hard ceiling
      // — that would mislead the model with a number we don't enforce.
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
          // max_items intentionally omitted
        },
      });
      const system = captured.system ?? '';
      // With max_items omitted, this config doesn't exactly match
      // PRESETS.concise (which now requires max_items: 6), so
      // matchPreset → null and styleSummaryLine returns the
      // 'custom — granularity=concise, ...' line. Either form
      // counts as "concise direction was picked".
      expect(system).toMatch(/granularity=concise|Extraction mode: concise/i);
      // No specific item count claimed.
      expect(system).not.toMatch(/at most ~\d+ items/i);
      // The "hard limits" framing also drops — there's no cap to
      // enforce, so claiming hard limits would be misleading.
      expect(system).not.toMatch(/hard limits/i);
      // Wording switches to qualitative-direction framing instead.
      expect(system).toMatch(/qualitative guidance/i);
      // The qualitative direction stays — concise still means brief,
      // single-tree, skip-secondary-specs.
      expect(system).toMatch(/Be brief|highest-signal facts/i);
      expect(system).toMatch(/path prefix/i);
    });

    it('concise style WITH max_items keeps the hard-limits header', async () => {
      // Inverse pin for the conditional header — when a cap IS
      // configured, the prompt must keep the "hard limits" framing
      // so the model takes the number seriously.
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
          max_items: 6,
        },
      });
      const system = captured.system ?? '';
      expect(system).toMatch(/hard limits/i);
      expect(system).not.toMatch(/qualitative guidance/i);
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
          max_items: 20, // matches PRESETS.balanced; without it
          // matchPreset rightly reports 'custom' (drift coverage in
          // extractionStyleConfig.test). Pass the full preset shape
          // here so styleSummaryLine returns the friendly 'balanced'
          // summary line.
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

  describe('deterministic item-level cap (style.max_items)', () => {
    // Hard counterpart to the prompt budget. Selection runs at the
    // canonical-draft layer (post-lift, pre-compile), so each surviving
    // item produces a complete, dependency-correct op group. The
    // applyYOps-on-empty-base assertion below is the contract anchor:
    // if the selection accidentally splits a parent define from its
    // populate, apply fails and the test goes red.
    function buildItem(
      id: string,
      key: string,
      confidence: number,
      evidenceCount: number,
      values: Record<string, string> = { fact: `value for ${id}` }
    ) {
      return {
        id,
        intent: 'add' as const,
        confidence,
        reasoning_type: 'direct' as const,
        target_ref: { node_key: null, path: null, existing_node_id: null },
        candidate: {
          key,
          path_hint: null,
          slot: null,
          value_json: null,
          values_json: JSON.stringify(values),
          children_json: null,
        },
        // Use a single-char quote that's guaranteed to be a substring
        // of the test turn content (which is 'a' in every cap test).
        // The cap suite is testing item selection logic, not source
        // validation — quote content is incidental, but it must still
        // pass validateSource since #N+1 enforces that contract
        // server-side. Multiple evidence rows reuse the same quote;
        // the validator is content-of-quote agnostic, only verbatim-
        // substring matters.
        evidence: Array.from({ length: evidenceCount }, () => ({
          turn_tag: 'T1',
          quote: 'a',
          role: 'primary' as const,
        })),
      };
    }

    function providerWithItems(
      items: ReturnType<typeof buildItem>[]
    ): Pick<LLMProvider, 'generateStructured'> {
      return {
        async generateStructured() {
          return {
            data: {
              schema: 't3x/provider-extraction-draft',
              version: 1,
              mode: 'bootstrap',
              items,
              warnings: [],
            },
            usage: { inputTokens: 1, outputTokens: 1 },
          };
        },
      };
    }

    it('concise (max_items=6) trims a 10-item draft to 6 by confidence', async () => {
      // High-confidence first 6 + low-confidence last 4. After cap, the
      // low-confidence items should be the ones dropped.
      const items = [
        buildItem('keep_a', 'a', 0.95, 1),
        buildItem('keep_b', 'b', 0.94, 1),
        buildItem('keep_c', 'c', 0.93, 1),
        buildItem('keep_d', 'd', 0.92, 1),
        buildItem('keep_e', 'e', 0.91, 1),
        buildItem('keep_f', 'f', 0.9, 1),
        buildItem('drop_g', 'g', 0.7, 1),
        buildItem('drop_h', 'h', 0.6, 1),
        buildItem('drop_i', 'i', 0.5, 1),
        buildItem('drop_j', 'j', 0.4, 1),
      ];
      const result = await runExtractionV2Pipeline({
        turns: [{ turn_hash: 'sha256:turn-1', role: 'user', content: 'a' }],
        mode: 'bootstrap',
        providerId: 'anthropic',
        model: 'claude-sonnet-4-6',
        provider: providerWithItems(items),
        style: {
          granularity: 'concise',
          quote_length: 'representative',
          update_stance: 'conservative',
          tier3: 'extract',
          max_items: 6,
        },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // The compiled output reflects only the kept items. Each item
      // compiles to define + populate (2 ops), so 6 items → 12 ops.
      const definePaths = result.compiled.ops
        .filter((op) => 'define' in op)
        .map((op) => (op as { define: { path: string } }).define.path);
      expect(definePaths).toEqual(expect.arrayContaining(['a', 'b', 'c', 'd', 'e', 'f']));
      expect(definePaths).not.toContain('g');
      expect(definePaths).not.toContain('h');
      expect(definePaths).not.toContain('i');
      expect(definePaths).not.toContain('j');
      // Warning names every dropped id, the cap, and the original count.
      const capWarning = result.compiled.warnings.find((w) => w.includes('Extraction style cap'));
      expect(capWarning).toBeDefined();
      expect(capWarning).toContain('produced 10 items');
      expect(capWarning).toContain('kept top 6');
      expect(capWarning).toContain('drop_g');
      expect(capWarning).toContain('drop_j');
    });

    it('compiled ops apply cleanly against an empty base (no broken dependencies)', async () => {
      // Each item compiles into a define + populate group. Selection at
      // item level guarantees that for every surviving item, both ops
      // are present together — applyYOps must succeed against an empty
      // base. If selection ever drops the wrong half of a group, this
      // goes red.
      const items = [
        buildItem('a', 'root_a', 0.95, 2),
        buildItem('b', 'root_b', 0.93, 1),
        buildItem('c', 'root_c', 0.91, 1),
        buildItem('d', 'root_d', 0.6, 1),
        buildItem('e', 'root_e', 0.5, 1),
        buildItem('f', 'root_f', 0.4, 1),
        buildItem('g', 'root_g', 0.3, 1),
        buildItem('h', 'root_h', 0.2, 1),
      ];
      const result = await runExtractionV2Pipeline({
        turns: [{ turn_hash: 'sha256:turn-1', role: 'user', content: 'a' }],
        mode: 'bootstrap',
        providerId: 'anthropic',
        model: 'claude-sonnet-4-6',
        provider: providerWithItems(items),
        style: {
          granularity: 'concise',
          quote_length: 'representative',
          update_stance: 'conservative',
          tier3: 'extract',
          max_items: 6,
        },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const applied = applyYOps({ trees: [], relations: [] }, result.compiled.ops);
      expect(applied.ok).toBe(true);
      expect(applied.applied).toBe(result.compiled.ops.length);
    });

    it('balanced (max_items=20) is a no-op when draft has fewer items than the cap', async () => {
      const items = [
        buildItem('a', 'a', 0.9, 1),
        buildItem('b', 'b', 0.9, 1),
        buildItem('c', 'c', 0.9, 1),
      ];
      const result = await runExtractionV2Pipeline({
        turns: [{ turn_hash: 'sha256:turn-1', role: 'user', content: 'a' }],
        mode: 'bootstrap',
        providerId: 'anthropic',
        model: 'claude-sonnet-4-6',
        provider: providerWithItems(items),
        style: {
          granularity: 'balanced',
          quote_length: 'representative',
          update_stance: 'balanced',
          tier3: 'extract',
          max_items: 20,
        },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // No cap warning when nothing was dropped.
      expect(result.compiled.warnings.some((w) => w.includes('Extraction style cap'))).toBe(false);
    });

    it('detailed (no max_items) lets all items through with no cap warning', async () => {
      // Detailed config has no max_items. A 30-item draft must compile
      // entirely — capture nuance is the whole point of detailed.
      const items = Array.from({ length: 30 }, (_, i) =>
        buildItem(`item_${i}`, `root_${i}`, 0.9, 1)
      );
      const result = await runExtractionV2Pipeline({
        turns: [{ turn_hash: 'sha256:turn-1', role: 'user', content: 'a' }],
        mode: 'bootstrap',
        providerId: 'anthropic',
        model: 'claude-sonnet-4-6',
        provider: providerWithItems(items),
        style: {
          granularity: 'detailed',
          quote_length: 'representative',
          update_stance: 'aggressive',
          tier3: 'extract',
          // max_items intentionally omitted (detailed = no cap)
        },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const definePaths = result.compiled.ops.filter((op) => 'define' in op);
      expect(definePaths.length).toBe(30);
      expect(result.compiled.warnings.some((w) => w.includes('Extraction style cap'))).toBe(false);
    });

    it('omitted style → no cap, no warning (preserves historical behaviour)', async () => {
      const items = Array.from({ length: 12 }, (_, i) =>
        buildItem(`item_${i}`, `root_${i}`, 0.9, 1)
      );
      const result = await runExtractionV2Pipeline({
        turns: [{ turn_hash: 'sha256:turn-1', role: 'user', content: 'a' }],
        mode: 'bootstrap',
        providerId: 'anthropic',
        model: 'claude-sonnet-4-6',
        provider: providerWithItems(items),
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // All 12 items survive — no style means no cap.
      expect(result.compiled.ops.filter((op) => 'define' in op).length).toBe(12);
      expect(result.compiled.warnings.some((w) => w.includes('Extraction style cap'))).toBe(false);
    });

    it('ties on confidence break by evidence count (more evidence wins)', async () => {
      // Two items at confidence 0.9: one with 3 evidence rows, one with
      // 1. The richer-evidence item must be kept; the leaner one dropped.
      const items = [buildItem('keep_a', 'a', 0.9, 3), buildItem('drop_b', 'b', 0.9, 1)];
      const result = await runExtractionV2Pipeline({
        turns: [{ turn_hash: 'sha256:turn-1', role: 'user', content: 'a' }],
        mode: 'bootstrap',
        providerId: 'anthropic',
        model: 'claude-sonnet-4-6',
        provider: providerWithItems(items),
        style: {
          granularity: 'concise',
          quote_length: 'representative',
          update_stance: 'conservative',
          tier3: 'extract',
          max_items: 1,
        },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const definePaths = result.compiled.ops
        .filter((op) => 'define' in op)
        .map((op) => (op as { define: { path: string } }).define.path);
      expect(definePaths).toEqual(['a']);
      const capWarning = result.compiled.warnings.find((w) => w.includes('Extraction style cap'));
      expect(capWarning).toContain('drop_b');
    });

    it('ties on confidence + evidence break by original input order (stable)', async () => {
      // Both items at confidence 0.9 with 1 evidence row. The first one
      // wins; the second drops. Stable tie-break is essential for
      // deterministic test output and reproducible user experience.
      const items = [
        buildItem('first', 'first_path', 0.9, 1),
        buildItem('second', 'second_path', 0.9, 1),
      ];
      const result = await runExtractionV2Pipeline({
        turns: [{ turn_hash: 'sha256:turn-1', role: 'user', content: 'a' }],
        mode: 'bootstrap',
        providerId: 'anthropic',
        model: 'claude-sonnet-4-6',
        provider: providerWithItems(items),
        style: {
          granularity: 'concise',
          quote_length: 'representative',
          update_stance: 'conservative',
          tier3: 'extract',
          max_items: 1,
        },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const definePaths = result.compiled.ops
        .filter((op) => 'define' in op)
        .map((op) => (op as { define: { path: string } }).define.path);
      expect(definePaths).toEqual(['first_path']);
    });

    it('warning names the dropped item ids so consumers can audit cuts', async () => {
      const items = [
        buildItem('keep_1', 'a', 0.95, 1),
        buildItem('drop_x', 'b', 0.5, 1),
        buildItem('drop_y', 'c', 0.4, 1),
      ];
      const result = await runExtractionV2Pipeline({
        turns: [{ turn_hash: 'sha256:turn-1', role: 'user', content: 'a' }],
        mode: 'bootstrap',
        providerId: 'anthropic',
        model: 'claude-sonnet-4-6',
        provider: providerWithItems(items),
        style: {
          granularity: 'concise',
          quote_length: 'representative',
          update_stance: 'conservative',
          tier3: 'extract',
          max_items: 1,
        },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const capWarning = result.compiled.warnings.find((w) => w.includes('Extraction style cap'));
      expect(capWarning).toBeDefined();
      // Both dropped ids must appear so the user sees what was cut.
      expect(capWarning).toContain('drop_x');
      expect(capWarning).toContain('drop_y');
      // The kept id should NOT appear in the dropped list.
      expect(capWarning).not.toMatch(/Dropped:[^.]*keep_1/);
    });
  });

  describe('server-side source quote validation', () => {
    // The architecture move: source provenance is a core invariant,
    // enforced inside runExtractionV2Pipeline AFTER compileExtractionDraft.
    // Web no longer re-validates; if the model emits unverifiable
    // quotes, the pipeline reasks (with targeted feedback naming the
    // failing items) and ultimately fails with a typed
    // 'unverifiable_quote' code that the API surfaces back to clients.

    it("succeeds when every item's quote is an exact substring of its turn", async () => {
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
                  target_ref: { node_key: null, path: null, existing_node_id: null },
                  candidate: {
                    key: 'topic',
                    path_hint: null,
                    slot: null,
                    value_json: null,
                    values_json: '{"summary":"hello world"}',
                    children_json: null,
                  },
                  evidence: [{ turn_tag: 'T1', quote: 'hello world', role: 'primary' }],
                },
              ],
              warnings: [],
            },
            usage: { inputTokens: 1, outputTokens: 1 },
          };
        },
      };
      const result = await runExtractionV2Pipeline({
        turns: [{ turn_hash: 'sha256:t1', role: 'user', content: 'hello world from earlier' }],
        mode: 'bootstrap',
        providerId: 'anthropic',
        model: 'claude-sonnet-4-6',
        provider,
      });
      expect(result.ok).toBe(true);
    });

    it("returns 'unverifiable_quote' failure after retries when the model can't recover", async () => {
      // Provider always returns the same un-substring quote — repair
      // can't recover, reask doesn't help (mock provider isn't
      // adaptive), so the pipeline exhausts its budget and surfaces
      // a typed unverifiable_quote failure instead of returning ops
      // that would fail validation downstream.
      const provider: Pick<LLMProvider, 'generateStructured'> = {
        async generateStructured() {
          return {
            data: {
              schema: 't3x/provider-extraction-draft',
              version: 1,
              mode: 'bootstrap',
              items: [
                {
                  id: 'bad_quote_item',
                  intent: 'add',
                  confidence: 0.9,
                  reasoning_type: 'direct',
                  target_ref: { node_key: null, path: null, existing_node_id: null },
                  candidate: {
                    key: 'topic',
                    path_hint: null,
                    slot: null,
                    value_json: null,
                    values_json: '{"summary":"value"}',
                    children_json: null,
                  },
                  evidence: [
                    { turn_tag: 'T1', quote: 'completely fabricated phrase', role: 'primary' },
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
        turns: [{ turn_hash: 'sha256:t1', role: 'user', content: 'unrelated content' }],
        mode: 'bootstrap',
        providerId: 'anthropic',
        model: 'claude-sonnet-4-6',
        provider,
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.code).toBe('unverifiable_quote');
      // Structured details carry the failing op back to clients so the
      // API → web error path can display per-op information instead of
      // just an opaque count.
      const failingOps = (result.failure.details?.failingOps as Array<unknown>) ?? [];
      expect(failingOps.length).toBeGreaterThan(0);
    });

    it('targeted-reask prompt names failing items + turn tags + bad quotes', async () => {
      // Verify the prompt builder renders the user-locked v1 wording:
      // 'exact substring' (not 'byte-for-byte'), drop-item escape
      // hatch, and per-item identifiers (op index, path, turn tag,
      // bad quote in JSON). Capture the second call's prompt.
      const captured: string[] = [];
      let callIndex = 0;
      const provider: Pick<LLMProvider, 'generateStructured'> = {
        async generateStructured(prompt) {
          captured.push((prompt.messages.at(-1)?.content as string) ?? '');
          callIndex += 1;
          return {
            data: {
              schema: 't3x/provider-extraction-draft',
              version: 1,
              mode: 'bootstrap',
              items: [
                {
                  id: 'item_99',
                  intent: 'add',
                  confidence: 0.9,
                  reasoning_type: 'direct',
                  target_ref: { node_key: null, path: null, existing_node_id: null },
                  candidate: {
                    key: 'topic_root',
                    path_hint: null,
                    slot: null,
                    value_json: null,
                    values_json: '{"k":"v"}',
                    children_json: null,
                  },
                  evidence: [
                    {
                      turn_tag: 'T1',
                      quote: 'fabricated quote ' + callIndex,
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

      await runExtractionV2Pipeline({
        turns: [{ turn_hash: 'sha256:t1', role: 'user', content: 'real content here' }],
        mode: 'bootstrap',
        providerId: 'anthropic',
        model: 'claude-sonnet-4-6',
        provider,
      });
      // Second call must include the unverifiable_quote reask body.
      expect(captured.length).toBeGreaterThan(1);
      const reask = captured[1];
      // v1 prompt invariants (per review):
      expect(reask).toMatch(/exact substring/i);
      expect(reask).not.toMatch(/byte-for-byte/i);
      expect(reask).toMatch(/drop that item/i);
      expect(reask).toMatch(/Failing items:/);
      expect(reask).toMatch(/turn T1/);
      // Failing op identifier surfaces as path + bad quote (JSON-quoted).
      expect(reask).toMatch(/path "topic_root"/);
      expect(reask).toMatch(/"fabricated quote 1"/);
    });

    it('partial-compile salvage path also enforces source validation (no bypass)', async () => {
      // Review P1: the strict success path runs validateSource, but
      // the allowPartial salvage branch was returning ok:true with
      // partial.ops without going through the same gate. A draft with
      // one reaskable compile error plus one structurally valid item
      // carrying a fabricated quote could return API 200 with an
      // unverifiable quote the caller then trusts.
      //
      // Repro: provider always returns one item with an invalid path
      // (forces reaskable compile failure → reask exhaustion → salvage)
      // alongside an item with a fabricated quote that compiles fine.
      // After the fix, salvage routes through validateSource and the
      // unverifiable quote turns this into a typed failure instead of
      // a silent 200.
      const provider: Pick<LLMProvider, 'generateStructured'> = {
        async generateStructured() {
          return {
            data: {
              schema: 't3x/provider-extraction-draft',
              version: 1,
              mode: 'bootstrap',
              items: [
                {
                  // Item 1: structurally invalid path → reaskable compile
                  // failure that, after exhaustion, gets dropped by
                  // allowPartial.
                  id: 'item_bad_path',
                  intent: 'add',
                  confidence: 0.9,
                  reasoning_type: 'direct',
                  target_ref: { node_key: null, path: null, existing_node_id: null },
                  candidate: {
                    key: 'BadCamelCaseKey', // SNAKE_CASE_KEY violation → compile fail
                    path_hint: null,
                    slot: null,
                    value_json: null,
                    values_json: '{"k":"v"}',
                    children_json: null,
                  },
                  evidence: [{ turn_tag: 'T1', quote: 'real content', role: 'primary' }],
                },
                {
                  // Item 2: compiles fine, but quote is fabricated.
                  // Pre-fix this would survive salvage and ride out as
                  // 200 with a bogus quote. Post-fix the salvage
                  // validation gate catches it.
                  id: 'item_bad_quote',
                  intent: 'add',
                  confidence: 0.9,
                  reasoning_type: 'direct',
                  target_ref: { node_key: null, path: null, existing_node_id: null },
                  candidate: {
                    key: 'good_path',
                    path_hint: null,
                    slot: null,
                    value_json: null,
                    values_json: '{"k":"v"}',
                    children_json: null,
                  },
                  evidence: [{ turn_tag: 'T1', quote: 'totally not in the turn', role: 'primary' }],
                },
              ],
              warnings: [],
            },
            usage: { inputTokens: 1, outputTokens: 1 },
          };
        },
      };
      const result = await runExtractionV2Pipeline({
        turns: [{ turn_hash: 'sha256:t1', role: 'user', content: 'real content' }],
        mode: 'bootstrap',
        providerId: 'anthropic',
        model: 'claude-sonnet-4-6',
        provider,
      });
      // Without the fix: result.ok would be true and result.compiled.ops
      // would contain the bad-quote item. With the fix: salvage's
      // validation gate fires.
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.code).toBe('unverifiable_quote');
    });
  });
});
