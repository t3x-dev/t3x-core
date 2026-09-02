import { describe, expect, it } from 'vitest';
import {
  createGenerationModelCatalogSnapshot,
  GENERATION_MODEL_CATALOG_SCHEMA,
  GENERATION_MODEL_SPECIFICATION_VERSION,
  type GenerationModel,
  GenerationModelError,
} from '../lib/model-runtime-contract';

describe('provider-neutral model contract', () => {
  it('publishes an immutable catalog projection without private binding fields', () => {
    const snapshot = createGenerationModelCatalogSnapshot({
      revision: 'test-1',
      defaultModelId: 'balanced',
      models: [
        {
          id: 'balanced',
          label: 'Balanced',
          capabilities: ['text', 'tool_use', 'tool_use'],
          availability: 'available',
          limits: { maxOutputTokens: 8192 },
          providerModelId: 'private/provider-model',
          pricing: { snapshotId: 'private-price' },
        },
      ],
    });

    expect(snapshot).toEqual({
      schema: GENERATION_MODEL_CATALOG_SCHEMA,
      revision: 'test-1',
      defaultModelId: 'balanced',
      models: [
        {
          id: 'balanced',
          label: 'Balanced',
          capabilities: ['text', 'tool_use'],
          availability: 'available',
          limits: { maxOutputTokens: 8192 },
        },
      ],
    });
    expect(JSON.stringify(snapshot)).not.toContain('providerModelId');
    expect(JSON.stringify(snapshot)).not.toContain('pricing');
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.models[0]?.capabilities)).toBe(true);
  });

  it('rejects duplicate IDs and unavailable defaults', () => {
    const model = {
      id: 'fast',
      label: 'Fast',
      capabilities: ['text'] as const,
      availability: 'unavailable' as const,
    };
    expect(() =>
      createGenerationModelCatalogSnapshot({
        revision: 'test-1',
        models: [model, model],
      })
    ).toThrow('Duplicate model ID');
    expect(() =>
      createGenerationModelCatalogSnapshot({
        revision: 'test-1',
        defaultModelId: 'fast',
        models: [model],
      })
    ).toThrow('defaultModelId must reference an available model');
  });

  it('keeps stream chunks separate from an exactly-once terminal outcome', async () => {
    const evidence = {
      provider: 'test-gateway',
      model: 'test-model',
      usage: { inputTokens: 4, outputTokens: 2 },
      finishReason: 'stop' as const,
    };
    const model: GenerationModel = {
      specificationVersion: GENERATION_MODEL_SPECIFICATION_VERSION,
      provider: 'test-gateway',
      modelId: 'logical-model',
      capabilities: ['text', 'streaming'],
      async generate() {
        return { output: [{ type: 'text', text: 'hello' }], evidence };
      },
      async stream() {
        return {
          chunks: (async function* () {
            yield { type: 'text_delta' as const, delta: 'hello' };
          })(),
          terminal: Promise.resolve({ kind: 'completed' as const, evidence }),
        };
      },
    };

    const stream = await model.stream?.(
      {
        generationId: 'generation-1',
        runId: 'run-1',
        feature: 'test.model-stream',
        request: { messages: [{ role: 'user', content: 'Hello' }] },
      },
      new AbortController().signal
    );
    expect(stream).toBeDefined();
    if (!stream) return;
    const chunks = [];
    for await (const chunk of stream.chunks) chunks.push(chunk);
    expect(chunks).toEqual([{ type: 'text_delta', delta: 'hello' }]);
    await expect(stream.terminal).resolves.toEqual({ kind: 'completed', evidence });
  });

  it('carries provider execution uncertainty without raw response fields', () => {
    const error = new GenerationModelError('provider_transport_failure', 'unknown', 'req-1');
    expect(error).toMatchObject({
      name: 'GenerationModelError',
      message: 'provider_transport_failure',
      code: 'provider_transport_failure',
      outcome: 'unknown',
      providerRequestId: 'req-1',
    });
    expect(Object.keys(error)).not.toContain('responseBody');
    expect(Object.keys(error)).not.toContain('cause');
  });
});
