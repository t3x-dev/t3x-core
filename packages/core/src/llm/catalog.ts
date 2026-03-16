import type { ModelInfo, ProviderName } from './types';

export const MODEL_CATALOG: Record<ProviderName, Record<string, ModelInfo>> = {
  anthropic: {
    'claude-sonnet-4-20250514': {
      id: 'claude-sonnet-4-20250514',
      label: 'Claude Sonnet 4',
      provider: 'anthropic',
      capabilities: ['tool_use'],
      maxOutputTokens: 8192,
    },
    'claude-haiku-4-5-20251001': {
      id: 'claude-haiku-4-5-20251001',
      label: 'Claude Haiku 4.5',
      provider: 'anthropic',
      capabilities: ['tool_use'],
      maxOutputTokens: 8192,
    },
  },
  openai: {
    'gpt-4o': {
      id: 'gpt-4o',
      label: 'GPT-4o',
      provider: 'openai',
      capabilities: ['function_calling', 'structured_output'],
      maxOutputTokens: 16384,
    },
    'gpt-4o-mini': {
      id: 'gpt-4o-mini',
      label: 'GPT-4o Mini',
      provider: 'openai',
      capabilities: ['function_calling', 'structured_output'],
      maxOutputTokens: 16384,
    },
  },
  google: {
    'gemini-2.5-flash': {
      id: 'gemini-2.5-flash',
      label: 'Gemini 2.5 Flash',
      provider: 'google',
      capabilities: ['structured_output'],
      maxOutputTokens: 8192,
    },
  },
};

export function getAllModels(): ModelInfo[] {
  return Object.values(MODEL_CATALOG).flatMap((models) => Object.values(models));
}

export function getModelsByProvider(provider: ProviderName): ModelInfo[] {
  return Object.values(MODEL_CATALOG[provider] ?? {});
}

export function getModelInfo(modelId: string): ModelInfo | undefined {
  for (const models of Object.values(MODEL_CATALOG)) {
    if (modelId in models) return models[modelId];
  }
  return undefined;
}
