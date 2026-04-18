import type { ProviderName } from '@t3x-dev/core';
import { getModelsByProvider, MODEL_CATALOG } from '@t3x-dev/core';
import { Hono } from 'hono';
import { getProviderRegistry, refreshProviderRegistryConfig } from '../lib/provider-registry';

const PROVIDER_LABELS: Record<ProviderName, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
};

const RUNTIME_PROVIDER_IDS: Record<ProviderName, 'anthropic' | 'openai' | 'google-ai'> = {
  anthropic: 'anthropic',
  openai: 'openai',
  google: 'google-ai',
};

const PUBLIC_PROVIDER_IDS_BY_RUNTIME: Record<string, ProviderName> = {
  anthropic: 'anthropic',
  openai: 'openai',
  'google-ai': 'google',
};

function getGenerationProviderOrder(
  registry: Awaited<ReturnType<typeof getProviderRegistry>>
): ProviderName[] {
  const orderedProviders = registry
    .getProviderIdsForRole('generation')
    .map((providerId) => PUBLIC_PROVIDER_IDS_BY_RUNTIME[providerId])
    .filter((providerId): providerId is ProviderName => providerId !== undefined);

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
    const runtimeProviderId = RUNTIME_PROVIDER_IDS[name];

    return {
      name,
      label: PROVIDER_LABELS[name],
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
