import type { ProviderName } from '@t3x-dev/core';
import { getModelsByProvider, MODEL_CATALOG } from '@t3x-dev/core';
import { Hono } from 'hono';
import { getProviderRegistry, refreshProviderRegistryConfig } from '../lib/provider-registry';

const PROVIDER_LABELS: Record<ProviderName, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
};

const RUNTIME_PROVIDER_IDS: Record<ProviderName, 'anthropic' | 'openai' | 'google-ai'> = {
  anthropic: 'anthropic',
  openai: 'openai',
  google: 'google-ai',
};

export const llmRoutes = new Hono();

llmRoutes.get('/v1/llm/models', async (c) => {
  await refreshProviderRegistryConfig();
  const registry = await getProviderRegistry();

  const providers = (Object.keys(MODEL_CATALOG) as ProviderName[]).map((name) => {
    const runtimeProviderId = RUNTIME_PROVIDER_IDS[name];

    return {
      name,
      label: PROVIDER_LABELS[name],
      available: registry.isConfigured(runtimeProviderId),
      models: getModelsByProvider(name).map((m) => ({
        id: m.id,
        label: m.label,
        capabilities: m.capabilities,
        max_output_tokens: m.maxOutputTokens,
      })),
    };
  });

  return c.json({ success: true, data: { providers } });
});
