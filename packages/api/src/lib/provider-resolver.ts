import { type AnyProvider, getCanonicalModelId, getModelInfo } from '@t3x-dev/core';
import { getProviderRegistry } from './provider-registry';

export type RuntimeProviderId = 'anthropic' | 'openai' | 'google-ai';

const PROVIDER_ALIAS_TO_RUNTIME: Record<string, RuntimeProviderId> = {
  anthropic: 'anthropic',
  claude: 'anthropic',
  openai: 'openai',
  gpt: 'openai',
  gemini: 'google-ai',
  google: 'google-ai',
  'google-ai': 'google-ai',
};

const PROVIDER_RUNTIME_TO_PUBLIC: Record<RuntimeProviderId, 'anthropic' | 'openai' | 'google'> = {
  anthropic: 'anthropic',
  openai: 'openai',
  'google-ai': 'google',
};

const PROVIDER_RUNTIME_IDS = ['anthropic', 'openai', 'google-ai'] as const;

export function normalizeProvider(provider: string | undefined): RuntimeProviderId | null {
  if (!provider) return null;
  return PROVIDER_ALIAS_TO_RUNTIME[provider.toLowerCase()] ?? null;
}

function stripProviderPrefixFromModel(model: string, providerId: RuntimeProviderId): string {
  const separatorIndex = model.indexOf(':');
  if (separatorIndex === -1) return model;
  const providerPrefix = model.slice(0, separatorIndex);
  if (normalizeProvider(providerPrefix) !== providerId) return model;
  return model.slice(separatorIndex + 1) || model;
}

export type ResolveProviderResult =
  | { ok: true; providerId: RuntimeProviderId; provider: AnyProvider; model: string }
  | { ok: false; code: 'provider' | 'model' | 'mismatch' | 'unavailable'; message: string };

export async function resolveProviderAndModel(
  requestedProvider?: string,
  requestedModel?: string
): Promise<ResolveProviderResult> {
  const reg = await getProviderRegistry();
  const explicitProvider = normalizeProvider(requestedProvider);
  if (requestedProvider && !explicitProvider) {
    return { ok: false, code: 'provider', message: `Unknown provider: ${requestedProvider}` };
  }

  let modelProvider: RuntimeProviderId | null = null;
  if (requestedModel) {
    for (const provider of reg.listProviders()) {
      if (!(PROVIDER_RUNTIME_IDS as readonly string[]).includes(provider.id)) continue;
      if (
        provider.defaultModel === requestedModel ||
        provider.availableModels?.includes(requestedModel)
      ) {
        modelProvider = provider.id as RuntimeProviderId;
        break;
      }
    }
    if (!modelProvider) {
      const catalogProvider = getModelInfo(requestedModel)?.provider;
      if (catalogProvider) {
        modelProvider =
          (Object.entries(PROVIDER_RUNTIME_TO_PUBLIC).find(
            ([, publicId]) => publicId === catalogProvider
          )?.[0] as RuntimeProviderId | undefined) ?? null;
      }
    }
    if (!modelProvider) {
      return { ok: false, code: 'model', message: `Unknown or unsupported model: ${requestedModel}` };
    }
  }

  if (explicitProvider && modelProvider && explicitProvider !== modelProvider) {
    return {
      ok: false,
      code: 'mismatch',
      message: `Model ${requestedModel} does not match provider: ${requestedProvider}`,
    };
  }

  const defaultProvider = reg
    .getProviderIdsForRole('generation')
    .find(
      (id) => (PROVIDER_RUNTIME_IDS as readonly string[]).includes(id) && reg.isConfigured(id)
    ) as RuntimeProviderId | undefined;

  const providerId = explicitProvider ?? modelProvider ?? defaultProvider ?? null;
  if (!providerId) {
    return {
      ok: false,
      code: 'unavailable',
      message: 'No configured extraction provider is available',
    };
  }

  const provider = reg.getById<AnyProvider>(providerId);
  if (!provider) {
    return { ok: false, code: 'unavailable', message: `Provider ${providerId} is unavailable` };
  }

  const model = requestedModel
    ? (getCanonicalModelId(stripProviderPrefixFromModel(requestedModel, providerId)) ?? null)
    : (reg.getEntry(providerId)?.defaultModel ?? null);
  if (!model) {
    return {
      ok: false,
      code: 'unavailable',
      message: `No default model configured for provider: ${providerId}`,
    };
  }

  return { ok: true, providerId, provider, model };
}
