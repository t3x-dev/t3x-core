import {
  createDefaultProviderRegistry,
  getCanonicalModelId,
  getModelInfo,
  type GenerationRuntimeProviderId,
  isGenerationRuntimeProviderId,
  type LLMProvider,
  normalizeRuntimeProviderId,
  type ProviderRegistry,
  type RegistryConfig,
  type ResolvedConfig,
  runtimeProviderIdForPublic,
} from '@t3x-dev/core';
import {
  type AnyDB,
  type Conversation,
  findConversationById,
  findProjectById,
  findUserById,
  getGlobalSetting,
  getProviderCredentialBundle,
  type Project,
} from '@t3x-dev/storage';
import { getDB } from './db.js';

const PROVIDER_CONFIG_KEY = 'provider_registry';

export type RuntimeProviderId = GenerationRuntimeProviderId;

let registry: ProviderRegistry | null = null;
let registryInit: Promise<ProviderRegistry> | null = null;

export function resetProviderRegistry(): void {
  registry = null;
  registryInit = null;
}

async function loadResolvedProviderConfig(db?: AnyDB): Promise<ResolvedConfig> {
  try {
    const resolvedDb = db ?? (await getDB());
    const bundle = await getProviderCredentialBundle(resolvedDb);
    return bundle.secrets;
  } catch {
    return {};
  }
}

export async function getProviderRegistry(db?: AnyDB): Promise<ProviderRegistry> {
  if (registry) return registry;

  if (!registryInit) {
    registryInit = initProviderRegistry(db).then((value) => {
      registry = value;
      return value;
    });
  }

  return registryInit;
}

async function initProviderRegistry(db?: AnyDB): Promise<ProviderRegistry> {
  const resolvedDb = db ?? (await getDB());
  const reg = createDefaultProviderRegistry({
    configOverrides: await loadResolvedProviderConfig(resolvedDb),
  });

  try {
    const savedConfig = await getGlobalSetting<RegistryConfig>(resolvedDb, PROVIDER_CONFIG_KEY);
    if (savedConfig) {
      reg.importConfig(savedConfig);
    }
  } catch {
    // Fall back to env-based auto config.
  }

  return reg;
}

export function normalizeProvider(provider: string | null | undefined): RuntimeProviderId | null {
  return normalizeRuntimeProviderId(provider);
}

function stripProviderPrefixFromModel(model: string, providerId: RuntimeProviderId): string {
  const separatorIndex = model.indexOf(':');
  if (separatorIndex === -1) return model;

  const providerPrefix = model.slice(0, separatorIndex);
  if (normalizeProvider(providerPrefix) !== providerId) {
    return model;
  }

  return model.slice(separatorIndex + 1) || model;
}

function findProviderForModel(reg: ProviderRegistry, model: string): RuntimeProviderId | null {
  for (const provider of reg.listProviders()) {
    if (!isGenerationRuntimeProviderId(provider.id)) {
      continue;
    }

    if (provider.defaultModel === model || provider.availableModels?.includes(model)) {
      return provider.id;
    }
  }

  const catalogProvider = getModelInfo(model)?.provider;
  if (!catalogProvider) {
    return null;
  }

  return runtimeProviderIdForPublic(catalogProvider);
}

function getProjectGenerationProviderIds(reg: ProviderRegistry, project: Project | null): string[] {
  if (!project?.providerConfig) {
    return reg.getProviderIdsForRole('generation');
  }

  try {
    const config = JSON.parse(project.providerConfig) as RegistryConfig;
    const generationRole = config.roles.find((role) => role.role === 'generation');
    if (generationRole && generationRole.providerIds.length > 0) {
      return generationRole.providerIds;
    }
  } catch {
    // Ignore malformed JSON and fall back to the global registry chain.
  }

  return reg.getProviderIdsForRole('generation');
}

export type ResolveGenerationTargetResult =
  | {
      ok: true;
      providerId: RuntimeProviderId;
      provider: LLMProvider;
      model: string;
      conversation: Conversation | null;
      project: Project | null;
    }
  | {
      ok: false;
      code: 'provider' | 'model' | 'mismatch' | 'unavailable' | 'conversation' | 'project';
      message: string;
    };

export async function resolveGenerationTarget(options: {
  db: AnyDB;
  projectId?: string;
  conversationId?: string;
  userId?: string;
  requestedProvider?: string;
  requestedModel?: string;
}): Promise<ResolveGenerationTargetResult> {
  const reg = await getProviderRegistry(options.db);

  const conversation = options.conversationId
    ? await findConversationById(options.db, options.conversationId)
    : null;
  if (options.conversationId && !conversation) {
    return {
      ok: false,
      code: 'conversation',
      message: `Conversation not found: ${options.conversationId}`,
    };
  }

  const resolvedProjectId = options.projectId ?? conversation?.projectId ?? undefined;
  const project = resolvedProjectId ? await findProjectById(options.db, resolvedProjectId) : null;
  if (resolvedProjectId && !project) {
    return {
      ok: false,
      code: 'project',
      message: `Project not found: ${resolvedProjectId}`,
    };
  }

  const resolvedUserId = options.userId ?? project?.ownerId ?? undefined;
  const user = resolvedUserId ? await findUserById(options.db, resolvedUserId) : null;

  const inheritedProvider =
    conversation?.provider ?? project?.defaultProvider ?? user?.default_provider ?? undefined;
  const inheritedModel =
    conversation?.model ?? project?.defaultModel ?? user?.default_model ?? undefined;
  const requestedProvider =
    options.requestedProvider ?? (options.requestedModel ? undefined : inheritedProvider);
  const requestedModel =
    options.requestedModel ?? (options.requestedProvider ? undefined : inheritedModel);

  const explicitProvider = normalizeProvider(requestedProvider);
  if (requestedProvider && !explicitProvider) {
    return {
      ok: false,
      code: 'provider',
      message: `Unknown provider: ${requestedProvider}`,
    };
  }

  const modelProvider = requestedModel ? findProviderForModel(reg, requestedModel) : null;
  if (requestedModel && !modelProvider) {
    return {
      ok: false,
      code: 'model',
      message: `Unknown or unsupported model: ${requestedModel}`,
    };
  }

  if (explicitProvider && modelProvider && explicitProvider !== modelProvider) {
    return {
      ok: false,
      code: 'mismatch',
      message: `Model ${requestedModel} does not match provider: ${requestedProvider}`,
    };
  }

  const defaultProvider = getProjectGenerationProviderIds(reg, project).find(
    (providerId) => isGenerationRuntimeProviderId(providerId) && reg.isConfigured(providerId)
  ) as RuntimeProviderId | undefined;

  const scopedProviderId = explicitProvider ?? modelProvider ?? null;
  if (
    scopedProviderId &&
    !reg.isConfigured(scopedProviderId) &&
    (options.requestedProvider || options.requestedModel)
  ) {
    return {
      ok: false,
      code: 'unavailable',
      message: `API key not configured for provider: ${scopedProviderId}`,
    };
  }

  const providerId =
    scopedProviderId && reg.isConfigured(scopedProviderId)
      ? scopedProviderId
      : (defaultProvider ?? null);
  if (!providerId) {
    return {
      ok: false,
      code: 'unavailable',
      message: 'No configured generation provider is available',
    };
  }

  const provider = reg.getById<LLMProvider>(providerId);
  if (!provider) {
    return {
      ok: false,
      code: 'unavailable',
      message: `Provider ${providerId} is unavailable`,
    };
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

  return {
    ok: true,
    providerId,
    provider,
    model,
    conversation,
    project,
  };
}
