import type { ProviderName } from '@t3x-dev/core';
import { getModelsByProvider, MODEL_CATALOG } from '@t3x-dev/core';
import { Hono } from 'hono';

const PROVIDER_LABELS: Record<ProviderName, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
};

const PROVIDER_ENV_KEYS: Record<ProviderName, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_AI_STUDIO_KEY',
};

export const llmRoutes = new Hono();

llmRoutes.get('/v1/llm/models', (c) => {
  const providers = (Object.keys(MODEL_CATALOG) as ProviderName[]).map((name) => ({
    name,
    label: PROVIDER_LABELS[name],
    available: true, // Always list all providers; actual availability checked at call time
    models: getModelsByProvider(name).map((m) => ({
      id: m.id,
      label: m.label,
      capabilities: m.capabilities,
      max_output_tokens: m.maxOutputTokens,
    })),
  }));

  return c.json({ success: true, data: { providers } });
});
