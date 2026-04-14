/**
 * useAvailableModels — LLM provider list for the chat model picker.
 *
 * Fetches once on mount; returns only providers whose backend reports
 * `available: true`. Failures are swallowed to match existing UX (the
 * picker just shows no options).
 */

import { useCallback, useEffect, useState } from 'react';
import { getAvailableModels } from '@/infrastructure/llm';
import type { LLMProviderInfo } from '@/infrastructure/types';

export function useAvailableModels(): {
  providers: LLMProviderInfo[];
  loadModels: () => Promise<{ providers: LLMProviderInfo[] }>;
} {
  const [providers, setProviders] = useState<LLMProviderInfo[]>([]);

  const loadModels = useCallback(async () => getAvailableModels(), []);

  useEffect(() => {
    let cancelled = false;
    loadModels()
      .then((data) => {
        if (!cancelled) setProviders(data.providers.filter((p) => p.available));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [loadModels]);

  return { providers, loadModels };
}
