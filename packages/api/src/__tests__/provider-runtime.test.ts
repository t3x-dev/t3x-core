import type { LLMProvider } from '@t3x-dev/core';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import {
  createGenerationProviderRuntimeMiddleware,
  defaultGenerationProviderRuntime,
  GENERATION_MODEL_SPECIFICATION_VERSION,
  GENERATION_PROVIDER_RUNTIME_VERSION,
  type GenerationModel,
  type GenerationModelError,
  type GenerationProviderRuntime,
  getGenerationProviderRuntime,
} from '../lib/provider-runtime';

const resolver = vi.hoisted(() => ({ resolveProviderAndModel: vi.fn() }));
vi.mock('../lib/provider-resolver', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/provider-resolver')>()),
  resolveProviderAndModel: resolver.resolveProviderAndModel,
}));

function model(id: string): GenerationModel {
  return {
    specificationVersion: GENERATION_MODEL_SPECIFICATION_VERSION,
    provider: id,
    modelId: `${id}-model`,
    capabilities: ['text'],
    async generate() {
      return {
        output: [{ type: 'text', text: id }],
        evidence: {
          provider: id,
          model: `${id}-model`,
          usage: { inputTokens: 0, outputTokens: 0 },
          finishReason: 'stop',
        },
      };
    },
  };
}

function runtime(id: string): GenerationProviderRuntime {
  return {
    contractVersion: GENERATION_PROVIDER_RUNTIME_VERSION,
    async resolve() {
      return { ok: true, model: model(id) };
    },
  };
}

function application(runtime: GenerationProviderRuntime): Hono {
  const app = new Hono();
  app.use('*', createGenerationProviderRuntimeMiddleware(runtime));
  app.get('/provider', async (context) => {
    const result = await getGenerationProviderRuntime(context).resolve();
    return context.json(
      result.ok
        ? { providerId: result.model.provider, model: result.model.modelId }
        : { code: result.code, message: result.message }
    );
  });
  return app;
}

describe('application-scoped generation provider runtime', () => {
  it('isolates provider authority between application instances', async () => {
    const first = application(runtime('first'));
    const second = application(runtime('second'));

    await expect(first.request('/provider').then((response) => response.json())).resolves.toEqual({
      providerId: 'first',
      model: 'first-model',
    });
    await expect(second.request('/provider').then((response) => response.json())).resolves.toEqual({
      providerId: 'second',
      model: 'second-model',
    });
  });

  it('publishes the exact runtime composed by createApp', () => {
    const injected = runtime('hosted');
    expect(createApp({ providerRuntime: injected }).providerRuntime).toBe(injected);
    expect(createApp().providerRuntime).toBe(defaultGenerationProviderRuntime);
  });

  it('adapts the historical OSS provider behind the neutral model contract', async () => {
    const generateFromPrompt = vi.fn().mockResolvedValue({
      text: 'hello',
      usage: { inputTokens: 3, outputTokens: 1 },
    });
    resolver.resolveProviderAndModel.mockResolvedValueOnce({
      ok: true,
      providerId: 'direct-provider',
      model: 'provider-model',
      provider: {
        id: 'direct-provider',
        generate: vi.fn(),
        resolveConflict: vi.fn(),
        generateFromPrompt,
      } satisfies LLMProvider,
    });

    const resolved = await defaultGenerationProviderRuntime.resolve({
      requestedModel: 'writing',
      scope: { projectId: 'project-1' },
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect('generateFromPrompt' in resolved.model).toBe(false);
    await expect(
      resolved.model.generate({
        generationId: 'generation-1',
        runId: 'run-1',
        feature: 'test.provider-runtime',
        request: {
          messages: [
            { role: 'system', content: 'Be concise' },
            { role: 'user', content: 'Hello' },
          ],
        },
      })
    ).resolves.toMatchObject({
      output: [{ type: 'text', text: 'hello' }],
      evidence: {
        provider: 'direct-provider',
        model: 'provider-model',
        usage: { inputTokens: 3, outputTokens: 1 },
      },
    });
  });

  it('normalizes ambiguous legacy provider failures for safe settlement', async () => {
    resolver.resolveProviderAndModel.mockResolvedValueOnce({
      ok: true,
      providerId: 'direct-provider',
      model: 'provider-model',
      provider: {
        id: 'direct-provider',
        generate: vi.fn().mockRejectedValue(new Error('raw upstream body')),
        resolveConflict: vi.fn(),
      } satisfies LLMProvider,
    });

    const resolved = await defaultGenerationProviderRuntime.resolve();
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    await expect(
      resolved.model.generate({
        generationId: 'generation-2',
        runId: 'run-2',
        feature: 'test.provider-runtime.failure',
        request: { messages: [{ role: 'user', content: 'Hello' }] },
      })
    ).rejects.toMatchObject({
      name: 'GenerationModelError',
      code: 'legacy_provider_failure',
      outcome: 'unknown',
      providerRequestId: null,
    } satisfies Partial<GenerationModelError>);
  });

  it('fails closed when a resolved adapter lacks a required capability', async () => {
    resolver.resolveProviderAndModel.mockResolvedValueOnce({
      ok: true,
      providerId: 'direct-provider',
      model: 'provider-model',
      provider: {
        id: 'direct-provider',
        generate: vi.fn(),
        resolveConflict: vi.fn(),
      } satisfies LLMProvider,
    });
    await expect(
      defaultGenerationProviderRuntime.resolve({ requiredCapabilities: ['tool_use'] })
    ).resolves.toEqual({
      ok: false,
      code: 'unavailable',
      message: 'Resolved model does not support required capability: tool_use',
    });
  });

  it('rejects unsupported runtime contracts before serving requests', () => {
    expect(() =>
      createGenerationProviderRuntimeMiddleware({
        contractVersion: 2,
        resolve: async () => ({
          ok: false,
          code: 'unavailable',
          message: 'unsupported',
        }),
      } as unknown as GenerationProviderRuntime)
    ).toThrow('invalid or unsupported');
  });
});
