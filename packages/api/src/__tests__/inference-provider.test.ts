import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  createInferenceRuntime,
  InferenceAdmissionDeniedError,
  InferenceExecutionError,
} from '../lib/inference';
import { bindInferenceProvider } from '../lib/inference-provider';

const input = {
  runId: 'run:extraction',
  feature: 'extraction.pipeline',
  requestedModel: 'requested-model',
  scope: {
    actor: { kind: 'user' as const, id: 'user_1' },
    namespaceId: 'ns_1',
    projectId: 'proj_1',
    projectVisibility: 'private' as const,
  },
};

describe('bindInferenceProvider', () => {
  it('settles every nested provider call with its reported usage', async () => {
    const settle = vi.fn(async () => {});
    let sequence = 0;
    const runtime = createInferenceRuntime({
      admissionPolicy: {
        authorize: async (attempt) => ({
          outcome: 'admitted',
          admission: { id: `reservation:${attempt.generationId}` },
        }),
        settle,
        release: vi.fn(async () => {}),
      },
      createGenerationId: () => `gen_nested_${++sequence}`,
    });
    const generate = vi.fn(async () => ({
      text: 'plain',
      usage: { inputTokens: 3, outputTokens: 2 },
    }));
    const generateStructured = vi.fn(async () => ({
      data: { answer: 'structured' },
      usage: { inputTokens: 11, outputTokens: 7 },
    }));
    const provider = bindInferenceProvider(
      { generate, generateStructured },
      {
        runtime,
        input,
        resolvedProvider: 'openrouter',
        resolvedModel: 'resolved-model',
      }
    );

    await provider.generate('prompt');
    await provider.generateStructured?.(
      { messages: [{ role: 'user', content: 'prompt' }] },
      z.object({ answer: z.string() }),
      { model: 'resolved-model' }
    );

    expect(settle).toHaveBeenCalledTimes(2);
    expect(settle).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        terminal: {
          kind: 'receipt',
          receipt: expect.objectContaining({
            generationId: 'gen_nested_2',
            runId: 'run:extraction',
            resolvedProvider: 'openrouter',
            resolvedModel: 'resolved-model',
            usage: { inputTokens: 11, outputTokens: 7 },
          }),
        },
      })
    );
  });

  it('denies before invoking the provider', async () => {
    const generate = vi.fn(async () => ({
      text: 'never',
      usage: { inputTokens: 1, outputTokens: 1 },
    }));
    const provider = bindInferenceProvider(
      { generate },
      {
        runtime: createInferenceRuntime({
          admissionPolicy: {
            authorize: async () => ({
              outcome: 'denied',
              code: 'quota_exhausted',
              reason: 'Quota exhausted',
            }),
            settle: vi.fn(async () => {}),
            release: vi.fn(async () => {}),
          },
        }),
        input,
        resolvedProvider: 'openrouter',
        resolvedModel: 'resolved-model',
      }
    );

    await expect(provider.generate('prompt')).rejects.toBeInstanceOf(InferenceAdmissionDeniedError);
    expect(generate).not.toHaveBeenCalled();
  });

  it('records an uncertain terminal when the provider throws', async () => {
    const settle = vi.fn(async () => {});
    const provider = bindInferenceProvider(
      {
        generate: async () => {
          throw new Error('upstream disconnected');
        },
      },
      {
        runtime: createInferenceRuntime({
          admissionPolicy: {
            authorize: async () => ({ outcome: 'admitted', admission: { id: 'reservation:1' } }),
            settle,
            release: vi.fn(async () => {}),
          },
        }),
        input,
        resolvedProvider: 'openrouter',
        resolvedModel: 'resolved-model',
      }
    );

    await expect(provider.generate('prompt')).rejects.toBeInstanceOf(InferenceExecutionError);
    expect(settle).toHaveBeenCalledWith(
      expect.objectContaining({
        terminal: expect.objectContaining({ kind: 'uncertain', reason: 'provider_error' }),
      })
    );
  });
});
