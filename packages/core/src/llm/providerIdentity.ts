import type { ProviderName } from './types';

export type GenerationRuntimeProviderId = 'anthropic' | 'openai' | 'google-ai';
export type LocalGenerationProviderId = ProviderName;
export type GenerationProviderAlias =
  | ProviderName
  | GenerationRuntimeProviderId
  | 'claude'
  | 'gemini'
  | 'gpt';

export const PUBLIC_GENERATION_PROVIDER_IDS = ['anthropic', 'openai', 'google'] as const;
export const LOCAL_GENERATION_PROVIDER_IDS = PUBLIC_GENERATION_PROVIDER_IDS;
export const GENERATION_RUNTIME_PROVIDER_IDS = ['anthropic', 'openai', 'google-ai'] as const;

export const PUBLIC_PROVIDER_LABELS: Record<ProviderName, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
};

export const GENERATION_RUNTIME_PROVIDER_ID_BY_PUBLIC_PROVIDER: Record<
  ProviderName,
  GenerationRuntimeProviderId
> = {
  anthropic: 'anthropic',
  openai: 'openai',
  google: 'google-ai',
};

export const PUBLIC_PROVIDER_ID_BY_RUNTIME_PROVIDER: Record<
  GenerationRuntimeProviderId,
  ProviderName
> = {
  anthropic: 'anthropic',
  openai: 'openai',
  'google-ai': 'google',
};

const LOCAL_PROVIDER_ID_BY_ALIAS: Record<GenerationProviderAlias, LocalGenerationProviderId> = {
  anthropic: 'anthropic',
  claude: 'anthropic',
  openai: 'openai',
  gpt: 'openai',
  google: 'google',
  'google-ai': 'google',
  gemini: 'google',
};

const RUNTIME_PROVIDER_ID_BY_ALIAS: Record<GenerationProviderAlias, GenerationRuntimeProviderId> = {
  anthropic: 'anthropic',
  claude: 'anthropic',
  openai: 'openai',
  gpt: 'openai',
  google: 'google-ai',
  'google-ai': 'google-ai',
  gemini: 'google-ai',
};

export function isGenerationRuntimeProviderId(
  providerId: string
): providerId is GenerationRuntimeProviderId {
  return (GENERATION_RUNTIME_PROVIDER_IDS as readonly string[]).includes(providerId);
}

export function normalizeRuntimeProviderId(
  providerId: string | null | undefined
): GenerationRuntimeProviderId | null {
  if (!providerId) return null;
  return RUNTIME_PROVIDER_ID_BY_ALIAS[providerId.toLowerCase() as GenerationProviderAlias] ?? null;
}

export function normalizeLocalProviderId(
  providerId: string | null | undefined
): LocalGenerationProviderId | null {
  if (!providerId) return null;
  return LOCAL_PROVIDER_ID_BY_ALIAS[providerId.toLowerCase() as GenerationProviderAlias] ?? null;
}

export function runtimeProviderIdForPublic(
  providerId: ProviderName
): GenerationRuntimeProviderId {
  return GENERATION_RUNTIME_PROVIDER_ID_BY_PUBLIC_PROVIDER[providerId];
}

export function publicProviderIdForRuntime(
  providerId: string | null | undefined
): ProviderName | null {
  if (!providerId || !isGenerationRuntimeProviderId(providerId)) return null;
  return PUBLIC_PROVIDER_ID_BY_RUNTIME_PROVIDER[providerId];
}
