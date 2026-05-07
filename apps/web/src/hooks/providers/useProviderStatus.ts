'use client';

import { useEffect, useMemo, useState } from 'react';
import type { LocalProviderId, LocalProviderStatus } from '@/infrastructure/types';
import { fetchLocalProviderStatus } from '@/queries/providerStatus';

const SUPPORTED_LOCAL_GENERATION_PROVIDERS: LocalProviderId[] = ['anthropic', 'openai', 'google'];

export type ProviderStatusError = 'api_unavailable';

function createFallbackStatus(provider: LocalProviderId): LocalProviderStatus {
  return {
    provider,
    configured: false,
    default_model: null,
    last_test_status: null,
    last_tested_at: null,
    last_test_error: null,
    api_key_source: 'none',
    api_key_preview: null,
    env_overrides_stored: false,
  };
}

export interface UseProviderStatusResult {
  loading: boolean;
  statuses: LocalProviderStatus[];
  configuredProviders: LocalProviderStatus[];
  hasConfiguredGenerationProvider: boolean;
  defaultProvider: LocalProviderId | null;
  defaultModel: string | null;
  statusError: ProviderStatusError | null;
}

/**
 * Resolves local credential status for the supported generation providers.
 * Failures are swallowed so consumers can degrade to an empty state.
 */
export function useProviderStatus(): UseProviderStatusResult {
  const [statuses, setStatuses] = useState<LocalProviderStatus[]>(
    SUPPORTED_LOCAL_GENERATION_PROVIDERS.map(createFallbackStatus)
  );
  const [loading, setLoading] = useState(true);
  const [statusError, setStatusError] = useState<ProviderStatusError | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadStatuses() {
      const settled = await Promise.allSettled(
        SUPPORTED_LOCAL_GENERATION_PROVIDERS.map((provider) => fetchLocalProviderStatus(provider))
      );

      if (cancelled) return;

      setStatuses(
        settled.map((result, index) =>
          result.status === 'fulfilled'
            ? result.value
            : createFallbackStatus(SUPPORTED_LOCAL_GENERATION_PROVIDERS[index])
        )
      );
      setStatusError(
        settled.every((result) => result.status === 'rejected') ? 'api_unavailable' : null
      );
      setLoading(false);
    }

    void loadStatuses();

    return () => {
      cancelled = true;
    };
  }, []);

  const configuredProviders = useMemo(
    () => statuses.filter((status) => status.configured),
    [statuses]
  );

  const defaultProvider = useMemo(() => {
    for (const provider of SUPPORTED_LOCAL_GENERATION_PROVIDERS) {
      const status = statuses.find((entry) => entry.provider === provider);
      if (status?.configured) return provider;
    }
    return null;
  }, [statuses]);

  const defaultModel = useMemo(() => {
    if (!defaultProvider) return null;
    return statuses.find((status) => status.provider === defaultProvider)?.default_model ?? null;
  }, [defaultProvider, statuses]);

  return {
    loading,
    statuses,
    configuredProviders,
    hasConfiguredGenerationProvider: configuredProviders.length > 0,
    defaultProvider,
    defaultModel,
    statusError,
  };
}
