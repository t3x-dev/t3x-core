import {
  extractAndApply,
  getCanonicalModelId,
  getModelInfo,
  type ExtractionFailure,
  type ExtractionMode,
} from '@t3x-dev/core';
import {
  deleteYOpsLogEntry,
  findConversationById,
  findTurnsByConversation,
  listYOpsLogByConversation,
  listYOpsLogByTopic,
  type AnyDB,
} from '@t3x-dev/storage';
import { getProviderRegistry } from './provider-registry';
import { replayYOpsLog, toYOpsLogEntries } from './yops-log-utils';

type RuntimeProviderId = 'anthropic' | 'openai' | 'google-ai';

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

function normalizeProvider(provider: string | undefined): RuntimeProviderId | null {
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

async function resolveProviderAndModel(
  requestedProvider?: string,
  requestedModel?: string
): Promise<
  | { ok: true; providerId: RuntimeProviderId; provider: any; model: string }
  | { ok: false; code: 'provider' | 'model' | 'mismatch' | 'unavailable'; message: string }
> {
  const reg = await getProviderRegistry();
  const explicitProvider = normalizeProvider(requestedProvider);
  if (requestedProvider && !explicitProvider) {
    return { ok: false, code: 'provider', message: `Unknown provider: ${requestedProvider}` };
  }

  let modelProvider: RuntimeProviderId | null = null;
  if (requestedModel) {
    for (const provider of reg.listProviders()) {
      if (!(PROVIDER_RUNTIME_IDS as readonly string[]).includes(provider.id)) continue;
      if (provider.defaultModel === requestedModel || provider.availableModels?.includes(requestedModel)) {
        modelProvider = provider.id as RuntimeProviderId;
        break;
      }
    }
    if (!modelProvider) {
      const catalogProvider = getModelInfo(requestedModel)?.provider;
      if (catalogProvider) {
        modelProvider =
          (Object.entries(PROVIDER_RUNTIME_TO_PUBLIC).find(([, publicId]) => publicId === catalogProvider)?.[0] as RuntimeProviderId | undefined) ??
          null;
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
    .find((id) => (PROVIDER_RUNTIME_IDS as readonly string[]).includes(id) && reg.isConfigured(id)) as
    | RuntimeProviderId
    | undefined;

  const providerId = explicitProvider ?? modelProvider ?? defaultProvider ?? null;
  if (!providerId) {
    return {
      ok: false,
      code: 'unavailable',
      message: 'No configured extraction provider is available',
    };
  }

  const provider = reg.getById<any>(providerId);
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

export interface ApiExtractionV2Input {
  db: AnyDB;
  conversationId: string;
  turnHashes?: string[];
  provider?: string;
  model?: string;
  topicId?: string;
  forceExtract?: boolean;
}

export type ApiExtractionV2Result =
  | {
      ok: true;
      mode: ExtractionMode;
      snapshot: { trees: import('@t3x-dev/core').TreeNode[]; relations: import('@t3x-dev/core').Relation[] };
      ops: import('@t3x-dev/core').SourcedYOp[];
      lastTurnHash: string;
    }
  | {
      ok: false;
      kind: 'conversation_not_found' | 'invalid_request' | 'provider_unavailable' | 'failure';
      message: string;
      failure?: ExtractionFailure;
    };

export async function runApiExtractionV2(input: ApiExtractionV2Input): Promise<ApiExtractionV2Result> {
  const conversation = await findConversationById(input.db, input.conversationId);
  if (!conversation) {
    return {
      ok: false,
      kind: 'conversation_not_found',
      message: `Conversation not found: ${input.conversationId}`,
    };
  }

  const allTurns = await findTurnsByConversation(input.db, {
    conversationId: input.conversationId,
    limit: 500,
  });

  if (allTurns.length === 0) {
    return {
      ok: false,
      kind: 'conversation_not_found',
      message: 'No turns found for this conversation',
    };
  }

  const selectedTurns = input.turnHashes
    ? allTurns.filter((turn) => input.turnHashes?.includes(turn.turnHash))
    : allTurns;

  if (selectedTurns.length === 0) {
    return {
      ok: false,
      kind: 'invalid_request',
      message: 'None of the specified turn_hashes were found',
    };
  }

  const providerResolution = await resolveProviderAndModel(input.provider, input.model);
  if (!providerResolution.ok) {
    return {
      ok: false,
      kind: 'provider_unavailable',
      message: providerResolution.message,
    };
  }

  let yopsRecords = input.topicId
    ? await listYOpsLogByTopic(input.db, input.conversationId, input.topicId)
    : await listYOpsLogByConversation(input.db, input.conversationId);

  if (input.forceExtract && yopsRecords.length > 0) {
    for (const record of yopsRecords) {
      await deleteYOpsLogEntry(input.db, record.id);
    }
    yopsRecords = [];
  }

  const replayedSnapshot = replayYOpsLog(toYOpsLogEntries(yopsRecords));
  const mode: ExtractionMode = replayedSnapshot.trees.length > 0 ? 'incremental' : 'bootstrap';

  const result = await extractAndApply({
    turns: selectedTurns.map((turn) => ({
      turn_hash: turn.turnHash,
      role: turn.role,
      content: turn.content,
    })),
    mode,
    providerId: providerResolution.providerId,
    provider: providerResolution.provider,
    model: providerResolution.model,
    snapshot: replayedSnapshot.trees.length > 0 ? replayedSnapshot : undefined,
  });

  if (!result.ok) {
    return { ok: false, kind: 'failure', message: result.failure.message, failure: result.failure };
  }

  const lastTurnHash = selectedTurns[selectedTurns.length - 1]?.turnHash ?? '';
  return {
    ok: true,
    mode,
    snapshot: result.snapshot,
    ops: result.compiled.ops,
    lastTurnHash,
  };
}
