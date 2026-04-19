import type { ModelInfo, ProviderName } from './types';

export const MODEL_CATALOG: Record<ProviderName, Record<string, ModelInfo>> = {
  anthropic: {
    'claude-haiku-4-5-20251001': {
      id: 'claude-haiku-4-5-20251001',
      label: 'Claude Haiku 4.5',
      provider: 'anthropic',
      capabilities: ['tool_use'],
      maxOutputTokens: 65536,
    },
    'claude-sonnet-4-6': {
      id: 'claude-sonnet-4-6',
      label: 'Claude Sonnet 4.6',
      provider: 'anthropic',
      capabilities: ['tool_use'],
      maxOutputTokens: 65536,
    },
    'claude-opus-4-6': {
      id: 'claude-opus-4-6',
      label: 'Claude Opus 4.6',
      provider: 'anthropic',
      capabilities: ['tool_use'],
      maxOutputTokens: 128000,
    },
  },
  openai: {
    'gpt-5.4-nano': {
      id: 'gpt-5.4-nano',
      label: 'GPT-5.4 Nano',
      provider: 'openai',
      capabilities: ['function_calling', 'structured_output'],
      maxOutputTokens: 128000,
    },
    'gpt-5.4-mini': {
      id: 'gpt-5.4-mini',
      label: 'GPT-5.4 Mini',
      provider: 'openai',
      capabilities: ['function_calling', 'structured_output'],
      maxOutputTokens: 128000,
    },
    'gpt-5.4': {
      id: 'gpt-5.4',
      label: 'GPT-5.4',
      provider: 'openai',
      capabilities: ['function_calling', 'structured_output'],
      maxOutputTokens: 128000,
    },
  },
  google: {
    'gemini-3.1-flash-lite-preview': {
      id: 'gemini-3.1-flash-lite-preview',
      label: 'Gemini 3.1 Flash-Lite Preview',
      provider: 'google',
      capabilities: ['structured_output'],
      maxOutputTokens: 65536,
    },
    'gemini-3-flash-preview': {
      id: 'gemini-3-flash-preview',
      label: 'Gemini 3 Flash Preview',
      provider: 'google',
      capabilities: ['structured_output'],
      maxOutputTokens: 65536,
    },
    'gemini-3-pro-preview': {
      id: 'gemini-3-pro-preview',
      label: 'Gemini 3 Pro Preview',
      provider: 'google',
      capabilities: ['structured_output'],
      maxOutputTokens: 65536,
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
