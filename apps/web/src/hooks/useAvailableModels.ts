/**
 * useAvailableModels — LLM provider list for the chat model picker.
 *
 * Fetches once on mount; returns only providers whose backend reports
 * `available: true`. Failures are swallowed to match existing UX (the
 * picker just shows no options).
 */

import { useEffect, useState } from 'react';
import { getAvailableModels } from '@/lib/api/llm';
import type { LLMProviderInfo } from '@/lib/api/types';

export function useAvailableModels(): { providers: LLMProviderInfo[] } {
  const [providers, setProviders] = useState<LLMProviderInfo[]>([]);

  useEffect(() => {
    let cancelled = false;
    getAvailableModels()
      .then((data) => {
        if (!cancelled) setProviders(data.providers.filter((p) => p.available));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return { providers };
}
