import { describe, expect, it } from 'vitest';
import type { LLMProvider } from '../../../llm/types';
import { LLMProviderError } from '../../../llm/types';
import { extractAndApplyResilient } from '../extract-and-apply-resilient';

describe('extractAndApplyResilient (F10)', () => {
  it('returns real extraction when the pipeline succeeds', async () => {
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
          },
          usage: { inputTokens: 4, outputTokens: 2 },
        };
      },
    };

    const result = await extractAndApplyResilient({
      turns: [{ turn_hash: 'sha256:t1', role: 'user', content: 'Plan a Hangzhou trip' }],
      mode: 'bootstrap',
      providerId: 'openai',
      provider,
      model: 'gpt-5.4',
    });

    expect(result.ok).toBe(true);
    expect(result.degraded).toBeUndefined();
    expect(result.snapshot.trees).toEqual([
      { key: 'trip', slots: { city: 'Hangzhou' }, children: [] },
    ]);
    expect(result.compiled.ops.length).toBeGreaterThan(0);
  });

  it('degrades transport failures into an empty draft + diagnostic (never ok:false)', async () => {
    const provider: Pick<LLMProvider, 'generateStructured'> = {
      async generateStructured() {
        throw new LLMProviderError('claude', 429, 'rate limited');
      },
    };

    const result = await extractAndApplyResilient({
      turns: [{ turn_hash: 'sha256:t1', role: 'user', content: 'hi' }],
      mode: 'bootstrap',
      providerId: 'anthropic',
      provider,
      model: 'claude-sonnet-4-6',
    });

    // Contract: always ok:true.
    expect(result.ok).toBe(true);
    // Empty extraction — no destructive ops applied.
    expect(result.snapshot.trees).toEqual([]);
    expect(result.compiled.ops).toEqual([]);
    expect(result.draft.items).toEqual([]);
    // Diagnostic carries the failure info.
    expect(result.degraded).toBeDefined();
    expect(result.degraded?.stage).toBe('transport');
    expect(result.degraded?.code).toBe('transport');
    expect(result.degraded?.message).toContain('rate limited');
    // The warning is discoverable from the draft itself for UI surfaces.
    expect(result.draft.warnings?.[0]).toContain('Extraction degraded at transport');
  });

  it('degrades apply-stage failures (executable_structure) without modifying the snapshot', async () => {
    // Minimal repro: incremental mode with a remove intent targeting a path
    // that does not exist in the base snapshot. The pipeline will compile it
    // into a drop op that the engine rejects.
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
                evidence: [{ turn_tag: 'T1', quote: 'remove that', role: 'primary' }],
              },
            ],
            warnings: [],
          },
          usage: { inputTokens: 4, outputTokens: 2 },
        };
      },
    };

    const result = await extractAndApplyResilient({
      turns: [{ turn_hash: 'sha256:t1', role: 'user', content: 'remove missing_node' }],
      mode: 'incremental',
      providerId: 'openai',
      provider,
      model: 'gpt-5.4',
      snapshot: { trees: [], relations: [] },
    });

    expect(result.ok).toBe(true);
    expect(result.degraded?.stage).toBe('apply');
    expect(result.degraded?.code).toBe('executable_structure');
    // Snapshot unchanged (we returned the base).
    expect(result.snapshot.trees).toEqual([]);
    expect(result.compiled.ops).toEqual([]);
  });

  it('preserves the base snapshot when the pipeline degrades mid-run', async () => {
    const baseSnapshot = {
      trees: [{ key: 'existing', slots: { hello: 'world' }, children: [] }],
      relations: [],
    };
    const provider: Pick<LLMProvider, 'generateStructured'> = {
      async generateStructured() {
        throw new LLMProviderError('openai', 503, 'service unavailable');
      },
    };

    const result = await extractAndApplyResilient({
      turns: [{ turn_hash: 'sha256:t1', role: 'user', content: 'x' }],
      mode: 'incremental',
      providerId: 'openai',
      provider,
      model: 'gpt-5.4',
      snapshot: baseSnapshot,
    });

    expect(result.ok).toBe(true);
    // The caller's snapshot is handed back unchanged — critical invariant for
    // incremental mode so a transient failure doesn't blow away existing data.
    expect(result.snapshot).toEqual(baseSnapshot);
    expect(result.degraded?.stage).toBe('transport');
  });

  it('F14: surfaces OpenAI refusal with a dedicated degradation stage and refusal text', async () => {
    const provider: Pick<LLMProvider, 'generateStructured'> = {
      async generateStructured() {
        // Shape mirrors what OpenAI's adapter throws on a structured-output
        // refusal: a LLMProviderError with code 'REFUSAL' and details
        // carrying the refusal text.
        throw new LLMProviderError(
          'openai',
          undefined,
          'Model refused to produce structured output: I cannot assist with that request.',
          'REFUSAL',
          { refusalText: 'I cannot assist with that request.' }
        );
      },
    };

    const result = await extractAndApplyResilient({
      turns: [{ turn_hash: 'sha256:t1', role: 'user', content: 'something the model refuses' }],
      mode: 'bootstrap',
      providerId: 'openai',
      provider,
      model: 'gpt-5.4',
    });

    expect(result.ok).toBe(true);
    // Not 'transport' — refusal is first-class.
    expect(result.degraded?.stage).toBe('refusal');
    // UI surfaces this verbatim so the user sees why.
    expect(result.degraded?.refusalText).toBe('I cannot assist with that request.');
    // Nothing mutates when the model refuses.
    expect(result.snapshot.trees).toEqual([]);
    expect(result.compiled.ops).toEqual([]);
  });
});
