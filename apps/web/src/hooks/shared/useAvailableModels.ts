/**
 * useAvailableModels — runtime-usable LLM provider list for chat-facing model pickers.
 *
 * Filters the backend model registry to providers that are actually usable
 * at runtime. Backend ordering/default drives provider selection; local
 * provider status is used only to prefer a saved default model when that
 * backend-selected provider is still available.
 * Failures are swallowed to match the current empty-state UX.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useProviderStatus } from '@/hooks/providers/useProviderStatus';
import { toLocalProviderId } from '@/infrastructure/misc';
import type {
  LLMModelsResponse,
  LLMProviderInfo,
  LocalProviderStatus,
} from '@/infrastructure/types';
import { fetchAvailableModels } from '@/queries/llm';

export interface UseAvailableModelsResult {
  providers: LLMProviderInfo[];
  loading: boolean;
  loadModels: () => Promise<{ providers: LLMProviderInfo[] }>;
  hasConfiguredGenerationProvider: boolean;
  defaultProvider: string | null;
  defaultModel: string | null;
}

export interface AvailableModelSelection {
  provider: string | null;
  model: string | null;
}

function filterUsableProviders(
  providers: LLMProviderInfo[],
  statuses: LocalProviderStatus[]
): LLMProviderInfo[] {
  return providers.filter((provider) => {
    const localProviderId = toLocalProviderId(provider.name);
    if (!provider.available || provider.models.length === 0 || localProviderId === null) {
      return false;
    }

    return statuses.some((status) => status.provider === localProviderId && status.configured);
  });
}

function orderProviders(
  providers: LLMProviderInfo[],
  generationProviderOrder: string[]
): LLMProviderInfo[] {
  if (generationProviderOrder.length === 0) {
    return providers;
  }

  const order = new Map(generationProviderOrder.map((provider, index) => [provider, index]));
  return [...providers].sort((left, right) => {
    const leftIndex = order.get(left.name) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = order.get(right.name) ?? Number.MAX_SAFE_INTEGER;

    if (leftIndex === rightIndex) {
      return left.name.localeCompare(right.name);
    }

    return leftIndex - rightIndex;
  });
}

function getUsableProviders(
  data: LLMModelsResponse,
  statuses: LocalProviderStatus[]
): LLMProviderInfo[] {
  return orderProviders(
    filterUsableProviders(data.providers, statuses),
    data.generation_provider_order
  );
}

export function resolveAvailableModelSelection(
  providers: LLMProviderInfo[],
  currentProvider: string | null | undefined,
  currentModel: string | null | undefined,
  defaultProvider: string | null,
  defaultModel: string | null
): AvailableModelSelection {
  if (providers.length === 0) {
    return { provider: null, model: null };
  }

  const providerExists = currentProvider
    ? providers.some((provider) => provider.name === currentProvider)
    : false;

  const provider = providerExists
    ? currentProvider
    : (defaultProvider ?? providers[0]?.name ?? null);
  if (!provider) {
    return { provider: null, model: null };
  }

  const providerEntry = providers.find((entry) => entry.name === provider);
  if (!providerEntry) {
    return { provider: null, model: null };
  }

  const modelExists = currentModel
    ? providerEntry.models.some((model) => model.id === currentModel)
    : false;

  const model =
    (modelExists ? currentModel : null) ??
    (defaultModel && providerEntry.models.some((model) => model.id === defaultModel)
      ? defaultModel
      : null) ??
    providerEntry.models[0]?.id ??
    null;

  return { provider, model };
}

export function useAvailableModels(): {
  providers: LLMProviderInfo[];
  loading: boolean;
  loadModels: () => Promise<{ providers: LLMProviderInfo[] }>;
  hasConfiguredGenerationProvider: boolean;
  defaultProvider: string | null;
  defaultModel: string | null;
} {
  const [providers, setProviders] = useState<LLMProviderInfo[]>([]);
  const [backendDefaultProvider, setBackendDefaultProvider] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { loading: providerStatusLoading, statuses } = useProviderStatus();

  const loadModels = useCallback(async () => {
    const data = await fetchAvailableModels();
    return { providers: getUsableProviders(data, statuses) };
  }, [statuses]);

  useEffect(() => {
    if (providerStatusLoading) {
      setLoading(true);
      return;
    }

    let cancelled = false;

    setLoading(true);
    fetchAvailableModels()
      .then((data) => {
        if (!cancelled) {
          setProviders(getUsableProviders(data, statuses));
          setBackendDefaultProvider(data.default_provider);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProviders([]);
          setBackendDefaultProvider(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [providerStatusLoading, statuses]);

  const defaultUsableProvider = useMemo(() => {
    if (providers.length === 0) {
      return null;
    }

    return providers.some((provider) => provider.name === backendDefaultProvider)
      ? backendDefaultProvider
      : (providers[0]?.name ?? null);
  }, [backendDefaultProvider, providers]);

  const defaultUsableModel = useMemo(() => {
    if (!defaultUsableProvider) {
      return null;
    }

    const provider = providers.find((entry) => entry.name === defaultUsableProvider);
    if (!provider) {
      return null;
    }

    const localProviderId = toLocalProviderId(defaultUsableProvider);
    const preferredModel =
      localProviderId == null
        ? null
        : (statuses.find((status) => status.provider === localProviderId)?.default_model ?? null);

    return provider.models.some((model) => model.id === preferredModel)
      ? preferredModel
      : (provider.models[0]?.id ?? null);
  }, [defaultUsableProvider, providers, statuses]);

  return {
    providers,
    loading: providerStatusLoading || loading,
    loadModels,
    hasConfiguredGenerationProvider: providers.length > 0,
    defaultProvider: defaultUsableProvider,
    defaultModel: defaultUsableModel,
  };
}
