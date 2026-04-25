import { describe, expect, it } from 'vitest';
import type { LLMProvider } from '../../../llm/types';
import { extractAndApply } from '../extract-and-apply';

describe('extractAndApply', () => {
  it('returns applied snapshot and compiled ops on success', async () => {
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
                  key: 'trip_plan',
                  path_hint: 'trip_plan',
                  slot: null,
                  value_json: null,
                  values_json: '{"city":"Hangzhou"}',
                  children_json: null,
                },
                evidence: [
                  {
                    turn_tag: 'T1',
                    quote: 'Plan a Hangzhou trip',
                    role: 'primary',
                  },
                ],
              },
            ],
            warnings: [],
          },
          usage: { inputTokens: 4, outputTokens: 2 },
        };
      },
    };

    const result = await extractAndApply({
      turns: [{ turn_hash: 'sha256:turn-1', role: 'user', content: 'Plan a Hangzhou trip' }],
      mode: 'bootstrap',
      providerId: 'openai',
      provider,
      model: 'gpt-5.4',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.compiled.ops.length).toBeGreaterThan(0);
    expect(result.snapshot.trees).toEqual([
      {
        key: 'trip_plan',
        slots: { city: 'Hangzhou' },
        children: [],
      },
    ]);
  });

  it('applies bare scalar and array value_json payloads into the value slot', async () => {
    const provider: Pick<LLMProvider, 'generateStructured'> = {
      async generateStructured() {
        return {
          data: {
            schema: 't3x/provider-extraction-draft',
            version: 1,
            mode: 'bootstrap',
            items: [
              {
                id: 'item_scalar',
                intent: 'add',
                confidence: 0.99,
                reasoning_type: 'direct',
                target_ref: { node_key: null, path: null, existing_node_id: null },
                candidate: {
                  key: 'trip_duration_days',
                  path_hint: 'trip.duration_days',
                  slot: null,
                  value_json: '5',
                  values_json: null,
                  children_json: null,
                },
                evidence: [{ turn_tag: 'T1', quote: '5 days', role: 'primary' }],
              },
              {
                id: 'item_array',
                intent: 'add',
                confidence: 0.98,
                reasoning_type: 'direct',
                target_ref: { node_key: null, path: null, existing_node_id: null },
                candidate: {
                  key: 'must_visit_pois',
                  path_hint: 'trip.preferences.must_visit_pois',
                  slot: null,
                  value_json: '["West Lake","Lingyin Temple"]',
                  values_json: null,
                  children_json: null,
                },
                evidence: [
                  { turn_tag: 'T1', quote: 'West Lake and Lingyin Temple', role: 'primary' },
                ],
              },
            ],
            warnings: [],
          },
          usage: { inputTokens: 4, outputTokens: 2 },
        };
      },
    };

    const result = await extractAndApply({
      turns: [{ turn_hash: 'sha256:turn-1', role: 'user', content: '5 days in Hangzhou trip' }],
      mode: 'bootstrap',
      providerId: 'openai',
      provider,
      model: 'gpt-5.4',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Compiler normalises dotted LLM paths to slashes, so `trip.duration_days`
    // becomes a real nested `trip → duration_days` tree rather than a single
    // root key whose name happens to contain dots.
    expect(result.snapshot.trees).toEqual([
      {
        key: 'trip',
        slots: {},
        children: [
          {
            key: 'duration_days',
            slots: { value: 5 },
            children: [],
          },
          {
            key: 'preferences',
            slots: {},
            children: [
              {
                key: 'must_visit_pois',
                slots: { value: ['West Lake', 'Lingyin Temple'] },
                children: [],
              },
            ],
          },
        ],
      },
    ]);
  });

  it('applies cleanly when LLM emits two add items with the same path (compiler dedupes defines)', async () => {
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
                  key: 'game',
                  path_hint: 'game',
                  slot: null,
                  value_json: null,
                  values_json: '{"title":"Heroes of the Storm"}',
                  children_json: null,
                },
                evidence: [{ turn_tag: 'T1', quote: 'Heroes of the Storm', role: 'primary' }],
              },
              {
                id: 'item_2',
                intent: 'add',
                confidence: 0.85,
                reasoning_type: 'cross_turn',
                target_ref: { node_key: null, path: null, existing_node_id: null },
                candidate: {
                  key: 'game',
                  path_hint: 'game',
                  slot: null,
                  value_json: null,
                  values_json: '{"genre":"MOBA"}',
                  children_json: null,
                },
                evidence: [{ turn_tag: 'T1', quote: 'HotS is a MOBA', role: 'primary' }],
              },
            ],
            warnings: [],
          },
          usage: { inputTokens: 4, outputTokens: 2 },
        };
      },
    };

    const result = await extractAndApply({
      turns: [{ turn_hash: 'sha256:turn-1', role: 'user', content: 'HotS is a MOBA' }],
      mode: 'bootstrap',
      providerId: 'anthropic',
      provider,
      model: 'claude-sonnet-4-6',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.snapshot.trees).toEqual([
      {
        key: 'game',
        slots: { title: 'Heroes of the Storm', genre: 'MOBA' },
        children: [],
      },
    ]);
    expect(result.compiled.warnings).toContain('Dropped duplicate define op for path "game"');
  });

  it('returns an executable_structure failure when compiled ops cannot be applied', async () => {
    const provider: Pick<LLMProvider, 'generateStructured'> = {
      async generateStructured() {
        return {
          data: {
            schema: 't3x/provider-extraction-draft',
            version: 1,
            mode: 'incremental',
            items: [
              {
                id: 'item_1',
                intent: 'remove',
                confidence: 0.9,
                reasoning_type: 'direct',
                target_ref: {
                  node_key: 'missing_node',
                  path: 'missing_node',
                  existing_node_id: null,
                },
                candidate: {
                  key: 'missing_node',
                  path_hint: 'missing_node',
                  slot: null,
                  value_json: null,
                  values_json: null,
                  children_json: null,
                },
                evidence: [
                  {
                    turn_tag: 'T1',
                    quote: 'Update the missing node',
                    role: 'primary',
                  },
                ],
              },
            ],
            warnings: [],
          },
          usage: { inputTokens: 4, outputTokens: 2 },
        };
      },
    };

    const result = await extractAndApply({
      turns: [{ turn_hash: 'sha256:turn-1', role: 'user', content: 'Update the missing node' }],
      mode: 'incremental',
      providerId: 'openai',
      provider,
      model: 'gpt-5.4',
      snapshot: {
        trees: [],
        relations: [],
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.failure.code).toBe('executable_structure');
    expect(result.failure.retry.strategy).toBe('none');
  });
});
