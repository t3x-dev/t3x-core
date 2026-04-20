import type { ModelInfo, ProviderName } from './types';

const MODEL_ALIASES: Record<string, string> = {
  'claude-sonnet-4-20250514': 'claude-sonnet-4-6',
  'claude-sonnet-4-5-20250929': 'claude-sonnet-4-6',
  'claude-opus-4-20250514': 'claude-opus-4-6',
  'claude-opus-4-1-20250805': 'claude-opus-4-6',
  'gpt-4o': 'gpt-5.4',
  'gpt-4o-mini': 'gpt-5.4-mini',
  'gpt-4-turbo': 'gpt-5.4',
  o1: 'gpt-5.4',
  'o1-mini': 'gpt-5.4-mini',
  'gemini-3.1-pro-preview': 'gemini-2.5-pro',
  'gemini-2.5-flash': 'gemini-3-flash-preview',
  'gemini-2.5-flash-lite': 'gemini-3.1-flash-lite-preview',
  'gemini-2.0-flash': 'gemini-3-flash-preview',
};

export const MODEL_CATALOG: Record<ProviderName, Record<string, ModelInfo>> = {
  anthropic: {
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
      maxOutputTokens: 131072,
    },
    'claude-haiku-4-5-20251001': {
      id: 'claude-haiku-4-5-20251001',
      label: 'Claude Haiku 4.5',
      provider: 'anthropic',
      capabilities: ['tool_use'],
      maxOutputTokens: 65536,
    },
  },
  openai: {
    'gpt-5.4': {
      id: 'gpt-5.4',
      label: 'GPT-5.4',
      provider: 'openai',
      capabilities: ['function_calling', 'structured_output'],
      maxOutputTokens: 131072,
    },
    'gpt-5.4-mini': {
      id: 'gpt-5.4-mini',
      label: 'GPT-5.4 Mini',
      provider: 'openai',
      capabilities: ['function_calling', 'structured_output'],
      maxOutputTokens: 131072,
    },
    'gpt-5.4-nano': {
      id: 'gpt-5.4-nano',
      label: 'GPT-5.4 Nano',
      provider: 'openai',
      capabilities: ['function_calling', 'structured_output'],
      maxOutputTokens: 131072,
    },
  },
  google: {
    'gemini-2.5-pro': {
      id: 'gemini-2.5-pro',
      label: 'Gemini 2.5 Pro',
      provider: 'google',
      capabilities: ['function_calling', 'structured_output'],
      maxOutputTokens: 65536,
    },
    'gemini-3-flash-preview': {
      id: 'gemini-3-flash-preview',
      label: 'Gemini 3 Flash Preview',
      provider: 'google',
      capabilities: ['function_calling', 'structured_output'],
      maxOutputTokens: 65536,
    },
    'gemini-3.1-flash-lite-preview': {
      id: 'gemini-3.1-flash-lite-preview',
      label: 'Gemini 3.1 Flash-Lite Preview',
      provider: 'google',
      capabilities: ['function_calling', 'structured_output'],
      maxOutputTokens: 65536,
    },
  },
};

export function normalizeModelId(modelId: string): string {
  const separatorIndex = modelId.indexOf(':');
  if (separatorIndex === -1) {
    return MODEL_ALIASES[modelId] ?? modelId;
  }

  const providerPrefix = modelId.slice(0, separatorIndex);
  const providerModel = modelId.slice(separatorIndex + 1);
  if (!providerModel) {
    return modelId;
  }

  const normalizedModel = MODEL_ALIASES[providerModel] ?? providerModel;
  return `${providerPrefix}:${normalizedModel}`;
}

function findModelInfo(modelId: string): ModelInfo | undefined {
  for (const models of Object.values(MODEL_CATALOG)) {
    if (modelId in models) {
      return models[modelId];
    }
  }

  return undefined;
}

export function getAllModels(): ModelInfo[] {
  return Object.values(MODEL_CATALOG).flatMap((models) => Object.values(models));
}

export function getModelsByProvider(provider: ProviderName): ModelInfo[] {
  return Object.values(MODEL_CATALOG[provider] ?? {});
}

export function getCanonicalModelId(modelId: string): string | undefined {
  const normalizedModelId = normalizeModelId(modelId);
  return findModelInfo(normalizedModelId)?.id;
}

export function getModelInfo(modelId: string): ModelInfo | undefined {
  return findModelInfo(normalizeModelId(modelId));
}
