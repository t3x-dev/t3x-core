import {
  type AnyProvider,
  createProviderForModel,
  GENERATION_RUNTIME_PROVIDER_IDS,
  getCanonicalModelId,
  getModelInfo,
  type GenerationRuntimeProviderId,
  type LLMProvider,
  normalizeRuntimeProviderId,
  runtimeProviderIdForPublic,
  type RegistryConfig,
} from '@t3x-dev/core';
import { type AnyDB, findConversationById, findProjectById, findUserById } from '@t3x-dev/storage';
import { loadResolvedProviderConfig } from './provider-config';
import { getProviderRegistry } from './provider-registry';

export type RuntimeProviderId = GenerationRuntimeProviderId;

interface SelectionLayer {
  name: 'request' | 'conversation' | 'project' | 'user';
  provider?: string | null;
  model?: string | null;
  strict: boolean;
}

export interface ResolveProviderInput {
  db?: AnyDB;
  requestedProvider?: string;
  requestedModel?: string;
  conversationId?: string;
  projectId?: string;
  userId?: string;
  supportedProviders?: readonly RuntimeProviderId[];
  unavailableMessage?: string;
}

function isSupportedProvider(
  providerId: string,
  supportedProviders: readonly RuntimeProviderId[]
): providerId is RuntimeProviderId {
  return supportedProviders.includes(providerId as RuntimeProviderId);
}

export function normalizeProvider(provider: string | undefined): RuntimeProviderId | null {
  return normalizeRuntimeProviderId(provider);
}

function stripProviderPrefixFromModel(model: string, providerId: RuntimeProviderId): string {
  const separatorIndex = model.indexOf(':');
  if (separatorIndex === -1) return model;
  const providerPrefix = model.slice(0, separatorIndex);
  if (normalizeProvider(providerPrefix) !== providerId) return model;
  return model.slice(separatorIndex + 1) || model;
}

function isBlank(value: string | null | undefined): boolean {
  return value == null || value.trim().length === 0;
}

function normalizeModelInput(model: string | null | undefined): string | null {
  if (isBlank(model)) return null;
  const trimmed = model!.trim();
  return getCanonicalModelId(trimmed) ?? trimmed;
}

function findProviderForModel(
  registry: Awaited<ReturnType<typeof getProviderRegistry>>,
  model: string,
  candidateProviders: readonly RuntimeProviderId[]
): RuntimeProviderId | null {
  const providerPrefix = model.split(':', 1)[0];
  if (providerPrefix && providerPrefix !== model) {
    const normalizedPrefixedProvider = normalizeProvider(providerPrefix);
    if (normalizedPrefixedProvider && candidateProviders.includes(normalizedPrefixedProvider)) {
      return normalizedPrefixedProvider;
    }
  }

  for (const provider of registry.listProviders()) {
    if (!candidateProviders.includes(provider.id as RuntimeProviderId)) continue;
    if (provider.defaultModel === model || provider.availableModels?.includes(model)) {
      return provider.id as RuntimeProviderId;
    }
  }

  const catalogProvider = getModelInfo(model)?.provider;
  if (!catalogProvider) return null;

  const runtimeProvider = runtimeProviderIdForPublic(catalogProvider);

  return runtimeProvider && candidateProviders.includes(runtimeProvider) ? runtimeProvider : null;
}

function getProjectGenerationProviderOrder(
  project: Awaited<ReturnType<typeof findProjectById>>,
  registry: Awaited<ReturnType<typeof getProviderRegistry>>,
  supportedProviders: readonly RuntimeProviderId[]
): RuntimeProviderId[] {
  const globalOrder = registry
    .getProviderIdsForRole('generation')
    .filter((id): id is RuntimeProviderId => isSupportedProvider(id, supportedProviders));

  if (!project?.providerConfig) return globalOrder;

  try {
    const config = JSON.parse(project.providerConfig) as RegistryConfig;
    const ids =
      config.roles
        ?.find((role) => role.role === 'generation')
        ?.providerIds.filter((id): id is RuntimeProviderId =>
          isSupportedProvider(id, supportedProviders)
        ) ?? [];
    return ids.length > 0 ? ids : globalOrder;
  } catch {
    return globalOrder;
  }
}

export type ResolveProviderResult =
  | {
      ok: true;
      registry: Awaited<ReturnType<typeof getProviderRegistry>>;
      providerId: RuntimeProviderId;
      provider: AnyProvider;
      model: string;
    }
  | { ok: false; code: 'provider' | 'model' | 'mismatch' | 'unavailable'; message: string };

function unavailable(
  message: string | undefined,
  fallback: string
): Extract<ResolveProviderResult, { ok: false }> {
  return { ok: false, code: 'unavailable', message: message ?? fallback };
}

async function buildSelectionLayers(input: ResolveProviderInput) {
  const projectIdFromInput = input.projectId ?? null;
  const conversation =
    input.db && input.conversationId
      ? await findConversationById(input.db, input.conversationId)
      : null;
  const projectId = conversation?.projectId ?? projectIdFromInput;
  const project = input.db && projectId ? await findProjectById(input.db, projectId) : null;
  const user = input.db && input.userId ? await findUserById(input.db, input.userId) : null;

  const layers: SelectionLayer[] = [];

  if (input.requestedProvider !== undefined || input.requestedModel !== undefined) {
    layers.push({
      name: 'request',
      provider: input.requestedProvider,
      model: input.requestedModel,
      strict: true,
    });
  }

  if (conversation?.provider != null || conversation?.model != null) {
    layers.push({
      name: 'conversation',
      provider: conversation.provider,
      model: conversation.model,
      strict: false,
    });
  }

  if (project?.defaultProvider != null || project?.defaultModel != null) {
    layers.push({
      name: 'project',
      provider: project.defaultProvider,
      model: project.defaultModel,
      strict: false,
    });
  }

  if (user?.default_provider != null || user?.default_model != null) {
    layers.push({
      name: 'user',
      provider: user.default_provider,
      model: user.default_model,
      strict: false,
    });
  }

  return { conversation, project, user, layers };
}

function getLayerError(
  layer: SelectionLayer,
  code: Extract<ResolveProviderResult, { ok: false }>['code'],
  message: string
): Extract<ResolveProviderResult, { ok: false }> | null {
  return layer.strict ? { ok: false, code, message } : null;
}

export async function resolveProviderAndModel(
  input: ResolveProviderInput = {}
): Promise<ResolveProviderResult> {
  const registry = await getProviderRegistry();
  const supportedProviders = input.supportedProviders ?? GENERATION_RUNTIME_PROVIDER_IDS;
  const { project, layers } = await buildSelectionLayers(input);

  for (const layer of layers) {
    const normalizedProvider = isBlank(layer.provider)
      ? null
      : normalizeProvider(layer.provider ?? undefined);
    if (layer.provider && !normalizedProvider) {
      return (
        getLayerError(layer, 'provider', `Unknown provider: ${layer.provider}`) ??
        unavailable(input.unavailableMessage, 'No configured generation provider is available')
      );
    }

    if (normalizedProvider && !supportedProviders.includes(normalizedProvider)) {
      return (
        getLayerError(layer, 'unavailable', `Provider ${normalizedProvider} not implemented`) ??
        unavailable(input.unavailableMessage, 'No configured generation provider is available')
      );
    }

    const normalizedModel = normalizeModelInput(layer.model);
    if (layer.model && !normalizedModel) {
      continue;
    }

    if (layer.model) {
      const bareProviderAlias = normalizeProvider(layer.model);
      if (bareProviderAlias) {
        const err = getLayerError(layer, 'model', `Unknown or unsupported model: ${layer.model}`);
        if (err) return err;
        continue;
      }

      const separatorIndex = layer.model.indexOf(':');
      if (separatorIndex !== -1 && layer.model.slice(separatorIndex + 1).trim().length === 0) {
        const err = getLayerError(layer, 'model', `Unknown or unsupported model: ${layer.model}`);
        if (err) return err;
        continue;
      }
    }

    const modelProvider =
      normalizedModel != null
        ? findProviderForModel(registry, normalizedModel, supportedProviders)
        : null;
    if (normalizedModel && !modelProvider) {
      const err = getLayerError(
        layer,
        'model',
        `Unknown or unsupported model: ${layer.model ?? normalizedModel}`
      );
      if (err) return err;
      continue;
    }

    if (normalizedProvider && modelProvider && normalizedProvider !== modelProvider) {
      const err = getLayerError(
        layer,
        'mismatch',
        `Model ${normalizedModel} does not match provider: ${layer.provider}`
      );
      if (err) return err;
      continue;
    }

    const providerId = normalizedProvider ?? modelProvider;
    if (!providerId) continue;
    if (!registry.isConfigured(providerId)) {
      const err = getLayerError(
        layer,
        'unavailable',
        `API key not configured for provider: ${providerId}`
      );
      if (err) return err;
      continue;
    }

    const provider = registry.getById<AnyProvider>(providerId);
    if (!provider) {
      const err = getLayerError(layer, 'unavailable', `Provider ${providerId} is unavailable`);
      if (err) return err;
      continue;
    }

    const model = normalizedModel
      ? (getCanonicalModelId(stripProviderPrefixFromModel(normalizedModel, providerId)) ??
        normalizedModel)
      : (registry.getEntry(providerId)?.defaultModel ?? null);
    if (!model) {
      const err = getLayerError(
        layer,
        'unavailable',
        `No default model configured for provider: ${providerId}`
      );
      if (err) return err;
      continue;
    }

    return { ok: true, registry, providerId, provider, model };
  }

  const providerId =
    getProjectGenerationProviderOrder(project, registry, supportedProviders).find((id) =>
      registry.isConfigured(id)
    ) ?? null;
  if (!providerId) {
    return unavailable(input.unavailableMessage, 'No configured generation provider is available');
  }

  const provider = registry.getById<AnyProvider>(providerId);
  if (!provider) {
    return unavailable(input.unavailableMessage, `Provider ${providerId} is unavailable`);
  }

  const model = registry.getEntry(providerId)?.defaultModel ?? null;
  if (!model) {
    return unavailable(
      input.unavailableMessage,
      `No default model configured for provider: ${providerId}`
    );
  }

  return { ok: true, registry, providerId, provider, model };
}

export async function createModelBoundProvider(model: string): Promise<LLMProvider | null> {
  const overrides = await loadResolvedProviderConfig();
  return createProviderForModel(model, {
    anthropic: overrides.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY,
    openai: overrides.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY,
    google: overrides.GOOGLE_AI_STUDIO_KEY ?? process.env.GOOGLE_AI_STUDIO_KEY,
  });
}
