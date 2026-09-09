import {
  GENERATION_RUNTIME_PROVIDER_ID_BY_PUBLIC_PROVIDER,
  getModelsByProvider,
  PUBLIC_PROVIDER_LABELS,
} from '@t3x-dev/core';
import { Hono } from 'hono';
import { getGenerationProviderOrder } from '../lib/oss-generation-model-catalog';
import { getProviderRegistry } from '../lib/provider-registry';
import {
  defaultGenerationProviderRuntime,
  getGenerationProviderRuntime,
} from '../lib/provider-runtime';

export const llmRoutes = new Hono();

llmRoutes.get('/v1/llm/models', async (c) => {
  const runtime = getGenerationProviderRuntime(c);
  const catalogAuthority = runtime.catalog ?? defaultGenerationProviderRuntime.catalog;
  if (!catalogAuthority) throw new Error('Default generation model catalog is unavailable');
  const catalog = await catalogAuthority.snapshot();
  const registry = await getProviderRegistry();
  const generationProviderOrder = getGenerationProviderOrder(registry);

  const providers = generationProviderOrder.map((name) => {
    const runtimeProviderId = GENERATION_RUNTIME_PROVIDER_ID_BY_PUBLIC_PROVIDER[name];

    return {
      name,
      label: PUBLIC_PROVIDER_LABELS[name],
      available: registry.isConfigured(runtimeProviderId),
      models: getModelsByProvider(name).map((m) => ({
        id: m.id,
        label: m.label,
        capabilities: m.capabilities,
        max_output_tokens: m.maxOutputTokens,
      })),
    };
  });

  return c.json({
    success: true,
    data: {
      catalog,
      generation_provider_order: generationProviderOrder,
      default_provider: generationProviderOrder[0] ?? null,
      providers,
    },
  });
});
