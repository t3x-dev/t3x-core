import type { ProviderName } from '@t3x-dev/core';
import {
  GENERATION_RUNTIME_PROVIDER_ID_BY_PUBLIC_PROVIDER,
  getModelsByProvider,
  isGenerationRuntimeProviderId,
  MODEL_CATALOG,
  PUBLIC_PROVIDER_ID_BY_RUNTIME_PROVIDER,
  PUBLIC_PROVIDER_LABELS,
} from '@t3x-dev/core';
import { Hono } from 'hono';
import { getProviderRegistry, refreshProviderRegistryConfig } from '../lib/provider-registry';

function getGenerationProviderOrder(
  registry: Awaited<ReturnType<typeof getProviderRegistry>>
): ProviderName[] {
  const orderedProviders = registry
    .getProviderIdsForRole('generation')
    .filter(isGenerationRuntimeProviderId)
    .map((providerId) => PUBLIC_PROVIDER_ID_BY_RUNTIME_PROVIDER[providerId]);

  const remainingProviders = (Object.keys(MODEL_CATALOG) as ProviderName[]).filter(
    (providerId) => !orderedProviders.includes(providerId)
  );

  return [...orderedProviders, ...remainingProviders];
}

export const llmRoutes = new Hono();

llmRoutes.get('/v1/llm/models', async (c) => {
  await refreshProviderRegistryConfig();
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
      generation_provider_order: generationProviderOrder,
      default_provider: generationProviderOrder[0] ?? null,
      providers,
    },
  });
});
