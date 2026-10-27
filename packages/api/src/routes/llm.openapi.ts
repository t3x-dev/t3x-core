import {
  GENERATION_RUNTIME_PROVIDER_ID_BY_PUBLIC_PROVIDER,
  getModelsByProvider,
  PUBLIC_PROVIDER_LABELS,
} from '@t3x-dev/core';
import { getProviderCredentialBundle } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { getDB } from '../lib/db';
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
  // Use the same runtime boundary as Workspace chat, including v1 compatibility catalogs.
  if (runtime !== defaultGenerationProviderRuntime) {
    const models = catalog.models.filter((model) => model.availability === 'available');
    return c.json({
      success: true,
      data: {
        catalog,
        generation_provider_order: ['managed'],
        default_provider: models.length ? 'managed' : null,
        providers: [
          {
            name: 'managed',
            label: 'Managed inference',
            available: models.length > 0,
            default_model: catalog.defaultModelId,
            models: models.map((model) => ({
              id: model.id,
              label: model.label,
              capabilities: model.capabilities,
              max_output_tokens: model.limits?.maxOutputTokens ?? 0,
            })),
          },
        ],
      },
    });
  }
  const bundle = await getProviderCredentialBundle(await getDB());
  const registry = await getProviderRegistry();
  const generationProviderOrder = getGenerationProviderOrder(registry);

  const providers = generationProviderOrder.map((name) => {
    const runtimeProviderId = GENERATION_RUNTIME_PROVIDER_ID_BY_PUBLIC_PROVIDER[name];

    return {
      name,
      label: PUBLIC_PROVIDER_LABELS[name],
      available: registry.isConfigured(runtimeProviderId),
      default_model: bundle.safe[name].defaultModel,
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
