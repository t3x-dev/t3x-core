/**
 * useAvailableModels — runtime-usable LLM provider list for chat-facing model pickers.
 *
 * Filters the backend model registry to providers that are actually usable
 * at runtime. Local provider status is used only to prefer a saved default
 * provider/model when that provider is still available.
 * Failures are swallowed to match the current empty-state UX.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useProviderStatus } from '@/hooks/providers/useProviderStatus';
import { getAvailableModels } from '@/infrastructure/llm';
import { toLocalProviderId } from '@/infrastructure/misc';
import type { LLMProviderInfo } from '@/infrastructure/types';

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

function filterUsableProviders(providers: LLMProviderInfo[]): LLMProviderInfo[] {
  return providers.filter((provider) => {
    const localProviderId = toLocalProviderId(provider.name);
    return provider.available && provider.models.length > 0 && localProviderId !== null;
  });
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

function resolvePreferredAvailableSelection(
  providers: LLMProviderInfo[],
  preferredProvider: string | null,
  preferredModel: string | null
): AvailableModelSelection {
  if (providers.length === 0) {
    return { provider: null, model: null };
  }

  if (preferredProvider) {
    const provider = providers.find((entry) => entry.name === preferredProvider);
    if (provider) {
      return {
        provider: provider.name,
        model:
          (preferredModel && provider.models.some((model) => model.id === preferredModel)
            ? preferredModel
            : provider.models[0]?.id) ?? null,
      };
    }
  }

  const fallback = providers[0];
  return {
    provider: fallback.name,
    model: fallback.models[0]?.id ?? null,
  };
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
  const [loading, setLoading] = useState(true);
  const { loading: providerStatusLoading, defaultProvider, defaultModel } = useProviderStatus();

  const loadModels = useCallback(async () => {
    const data = await getAvailableModels();
    return { providers: filterUsableProviders(data.providers) };
  }, []);

  useEffect(() => {
    if (providerStatusLoading) {
      setLoading(true);
      return;
    }

    let cancelled = false;

    setLoading(true);
    getAvailableModels()
      .then((data) => {
        if (!cancelled) setProviders(filterUsableProviders(data.providers));
      })
      .catch(() => {
        if (!cancelled) setProviders([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [providerStatusLoading]);

  const { provider: defaultUsableProvider, model: defaultUsableModel } = useMemo(
    () => resolvePreferredAvailableSelection(providers, defaultProvider, defaultModel),
    [providers, defaultProvider, defaultModel]
  );

  return {
    providers,
    loading: providerStatusLoading || loading,
    loadModels,
    hasConfiguredGenerationProvider: providers.length > 0,
    defaultProvider: defaultUsableProvider,
    defaultModel: defaultUsableModel,
  };
}
