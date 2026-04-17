/**
 * useAvailableModels — LLM provider list for chat-facing model pickers.
 *
 * Filters the backend model registry against the configured local
 * generation providers so chat surfaces only expose usable options.
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

function filterConfiguredProviders(
  providers: LLMProviderInfo[],
  configuredProviderNames: Set<string>
): LLMProviderInfo[] {
  return providers.filter((provider) => {
    const localProviderId = toLocalProviderId(provider.name);
    return (
      provider.available &&
      provider.models.length > 0 &&
      localProviderId !== null &&
      configuredProviderNames.has(localProviderId)
    );
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
  const {
    loading: providerStatusLoading,
    statuses,
    hasConfiguredGenerationProvider,
    defaultProvider,
    defaultModel,
  } = useProviderStatus();

  const configuredProviderNames = useMemo(
    () => new Set(statuses.filter((status) => status.configured).map((status) => status.provider)),
    [statuses]
  );

  const loadModels = useCallback(async () => {
    const data = await getAvailableModels();
    return { providers: filterConfiguredProviders(data.providers, configuredProviderNames) };
  }, [configuredProviderNames]);

  useEffect(() => {
    if (providerStatusLoading) {
      setLoading(true);
      return;
    }

    let cancelled = false;

    setLoading(true);
    getAvailableModels()
      .then((data) => {
        if (!cancelled)
          setProviders(filterConfiguredProviders(data.providers, configuredProviderNames));
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
  }, [configuredProviderNames, providerStatusLoading]);

  return {
    providers,
    loading: providerStatusLoading || loading,
    loadModels,
    hasConfiguredGenerationProvider,
    defaultProvider,
    defaultModel,
  };
}
