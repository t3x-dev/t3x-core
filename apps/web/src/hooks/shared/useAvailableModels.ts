/**
 * useAvailableModels — runtime-usable LLM provider list for chat-facing model pickers.
 *
 * Filters the backend model registry to providers that are actually usable
 * at runtime. The server owns availability, including managed inference.
 * Credential administration permissions are not required for model discovery.
 * Loading and discovery failures remain distinct from an empty catalog.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LLMModelsResponse, LLMProviderInfo } from '@/infrastructure/types';
import { fetchAvailableModels } from '@/queries/llm';

export type GenerationProviderAvailabilityError = 'api_unavailable';

export interface UseAvailableModelsResult {
  providers: LLMProviderInfo[];
  loading: boolean;
  loadModels: () => Promise<{ providers: LLMProviderInfo[] }>;
  hasConfiguredGenerationProvider: boolean;
  defaultProvider: string | null;
  defaultModel: string | null;
  availabilityError: GenerationProviderAvailabilityError | null;
  refresh: () => void;
}

export interface AvailableModelSelection {
  provider: string | null;
  model: string | null;
}

function filterUsableProviders(providers: LLMProviderInfo[]): LLMProviderInfo[] {
  return providers.filter((provider) => provider.available && provider.models.length > 0);
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

function getUsableProviders(data: LLMModelsResponse): LLMProviderInfo[] {
  return orderProviders(filterUsableProviders(data.providers), data.generation_provider_order);
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
  availabilityError: GenerationProviderAvailabilityError | null;
  refresh: () => void;
} {
  const [providers, setProviders] = useState<LLMProviderInfo[]>([]);
  const [backendDefaultProvider, setBackendDefaultProvider] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [availabilityError, setAvailabilityError] =
    useState<GenerationProviderAvailabilityError | null>(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const loadModels = useCallback(async () => {
    const data = await fetchAvailableModels();
    return { providers: getUsableProviders(data) };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setAvailabilityError(null);
    void fetchAvailableModels()
      .then((data) => {
        if (cancelled) return;
        setProviders(getUsableProviders(data));
        setBackendDefaultProvider(data.default_provider);
      })
      .catch(() => {
        if (cancelled) return;
        setProviders([]);
        setBackendDefaultProvider(null);
        setAvailabilityError('api_unavailable');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [revision]);

  useEffect(() => {
    window.addEventListener('focus', refresh);
    window.addEventListener('t3x:provider-configuration-changed', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('t3x:provider-configuration-changed', refresh);
    };
  }, [refresh]);

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

    const preferredModel = provider.default_model ?? null;

    return provider.models.some((model) => model.id === preferredModel)
      ? preferredModel
      : (provider.models[0]?.id ?? null);
  }, [defaultUsableProvider, providers]);

  return {
    providers,
    loading,
    loadModels,
    hasConfiguredGenerationProvider: providers.length > 0,
    defaultProvider: defaultUsableProvider,
    defaultModel: defaultUsableModel,
    availabilityError,
    refresh,
  };
}
