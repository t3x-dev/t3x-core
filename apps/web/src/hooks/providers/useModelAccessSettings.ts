'use client';

import { useCallback, useEffect, useState } from 'react';
import { saveModelAccessConfig } from '@/commands/providers';
import { fetchModelAccessConfig, fetchProviders } from '@/queries/providers';
import type { ModelAccessConfig, ProviderInfo } from '@/types/providers';

export function useModelAccessSettings() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [config, setConfig] = useState<ModelAccessConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextProviders, nextConfig] = await Promise.all([
        fetchProviders(),
        fetchModelAccessConfig(),
      ]);
      setProviders(nextProviders.filter((provider) => provider.role === 'generation'));
      setConfig(nextConfig);
    } catch (cause) {
      setError(cause);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async (next: ModelAccessConfig) => {
    setSaving(true);
    setError(null);
    try {
      const saved = await saveModelAccessConfig(next);
      setConfig(saved);
      return saved;
    } catch (cause) {
      setError(cause);
      throw cause;
    } finally {
      setSaving(false);
    }
  }, []);

  return { providers, config, loading, saving, error, retry: load, save };
}
