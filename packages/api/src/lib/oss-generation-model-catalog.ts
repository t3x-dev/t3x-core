import {
  getModelsByProvider,
  isGenerationRuntimeProviderId,
  MODEL_CATALOG,
  type ProviderName,
  type ProviderRegistry,
  PUBLIC_PROVIDER_ID_BY_RUNTIME_PROVIDER,
} from '@t3x-dev/core';
import {
  createGenerationModelCatalogSnapshot,
  type GenerationModelCatalogSnapshot,
} from './model-runtime-contract';
import { getProviderRegistry, refreshProviderRegistryConfig } from './provider-registry';

const OSS_MODEL_CATALOG_REVISION = 1;

export function getGenerationProviderOrder(registry: ProviderRegistry): ProviderName[] {
  const orderedProviders = registry
    .getProviderIdsForRole('generation')
    .filter(isGenerationRuntimeProviderId)
    .map((providerId) => PUBLIC_PROVIDER_ID_BY_RUNTIME_PROVIDER[providerId]);

  const remainingProviders = (Object.keys(MODEL_CATALOG) as ProviderName[]).filter(
    (providerId) => !orderedProviders.includes(providerId)
  );
  return [...orderedProviders, ...remainingProviders];
}

/** Project direct-provider configuration without making provider topology part of the contract. */
export async function getOssGenerationModelCatalogSnapshot(): Promise<GenerationModelCatalogSnapshot> {
  await refreshProviderRegistryConfig();
  const registry = await getProviderRegistry();
  const providerOrder = getGenerationProviderOrder(registry);
  const providerAvailability = providerOrder.map((provider) => {
    const runtimeProvider = provider === 'google' ? 'google-ai' : provider;
    return [provider, registry.isConfigured(runtimeProvider)] as const;
  });
  const availabilityByProvider = new Map(providerAvailability);
  const firstAvailableProvider = providerAvailability.find(([, available]) => available)?.[0];
  const defaultRuntimeProvider =
    firstAvailableProvider === 'google' ? 'google-ai' : firstAvailableProvider;
  const preferredDefaultModel = defaultRuntimeProvider
    ? registry.getEntry(defaultRuntimeProvider)?.defaultModel
    : undefined;
  const availableDefaultModels = firstAvailableProvider
    ? getModelsByProvider(firstAvailableProvider)
    : [];
  const defaultModelId =
    availableDefaultModels.find((model) => model.id === preferredDefaultModel)?.id ??
    availableDefaultModels[0]?.id ??
    null;

  return createGenerationModelCatalogSnapshot({
    revision: `oss-direct-${OSS_MODEL_CATALOG_REVISION}:${providerAvailability
      .map(([provider, available]) => `${provider}-${available ? 1 : 0}`)
      .join('.')}`,
    defaultModelId,
    models: providerOrder.flatMap((provider) =>
      getModelsByProvider(provider).map((model) => ({
        id: model.id,
        label: model.label,
        // Advertise the adapter's executable surface, not merely native provider support.
        capabilities: ['text'],
        availability: availabilityByProvider.get(provider) ? 'available' : 'unavailable',
        limits: { maxOutputTokens: model.maxOutputTokens },
      }))
    ),
  });
}
