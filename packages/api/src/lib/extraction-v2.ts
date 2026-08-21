import {
  type ExtractionFailure,
  type ExtractionMode,
  extractAndApply,
  type LLMProvider,
  type PromptTurnInput,
} from '@t3x-dev/core';
import {
  type AnyDB,
  deleteYOpsLogEntry,
  findConversationById,
  findTurnsByConversation,
  findTurnsByHashes,
  listActiveYOpsLogByConversation,
} from '@t3x-dev/storage';
import { resolveProviderAndModel } from './provider-resolver';
import {
  getConversationInheritedBaseline,
  replayEntriesOnBaselineFailFast,
} from './yops-log-utils';

export interface ApiExtractionV2Input {
  db: AnyDB;
  conversationId: string;
  turnHashes?: string[];
  /** Server-resolved repository baseline. When present, conversation YOps logs are ignored. */
  baselineSnapshot?: {
    trees: import('@t3x-dev/core').TreeNode[];
    relations: import('@t3x-dev/core').Relation[];
  };
  provider?: string;
  model?: string;
  userId?: string;
  topicId?: string;
  forceExtract?: boolean;
}

export type ApiExtractionV2Result =
  | {
      ok: true;
      mode: ExtractionMode;
      snapshot: {
        trees: import('@t3x-dev/core').TreeNode[];
        relations: import('@t3x-dev/core').Relation[];
      };
      ops: import('@t3x-dev/core').SourcedYOp[];
      lastTurnHash: string;
    }
  | {
      ok: false;
      kind: 'conversation_not_found' | 'invalid_request' | 'provider_unavailable' | 'failure';
      message: string;
      failure?: ExtractionFailure;
    };

function isPromptTurnRole(role: string): role is PromptTurnInput['role'] {
  return role === 'user' || role === 'assistant' || role === 'system' || role === 'tool';
}

function isExtractionProvider(
  provider: unknown
): provider is Pick<LLMProvider, 'generate' | 'generateFromPrompt' | 'generateStructured'> {
  return (
    provider !== null &&
    typeof provider === 'object' &&
    'generate' in provider &&
    typeof provider.generate === 'function'
  );
}

export async function runApiExtractionV2(
  input: ApiExtractionV2Input
): Promise<ApiExtractionV2Result> {
  const conversation = await findConversationById(input.db, input.conversationId);
  if (!conversation) {
    return {
      ok: false,
      kind: 'conversation_not_found',
      message: `Conversation not found: ${input.conversationId}`,
    };
  }

  const selectedTurns = input.turnHashes
    ? await findTurnsByHashes(input.db, {
        conversationId: input.conversationId,
        turnHashes: input.turnHashes,
      })
    : await findTurnsByConversation(input.db, {
        conversationId: input.conversationId,
        limit: 500,
      });

  if (selectedTurns.length === 0 && input.turnHashes !== undefined) {
    return {
      ok: false,
      kind: 'invalid_request',
      message: 'None of the specified turn_hashes were found',
    };
  }

  if (selectedTurns.length === 0) {
    return {
      ok: false,
      kind: 'conversation_not_found',
      message: 'No turns found for this conversation',
    };
  }

  const providerResolution = await resolveProviderAndModel({
    db: input.db,
    requestedProvider: input.provider,
    requestedModel: input.model,
    conversationId: input.conversationId,
    userId: input.userId,
    unavailableMessage: 'No configured extraction provider is available',
  });
  if (!providerResolution.ok) {
    return {
      ok: false,
      kind: 'provider_unavailable',
      message: providerResolution.message,
    };
  }
  if (!isExtractionProvider(providerResolution.provider)) {
    return {
      ok: false,
      kind: 'provider_unavailable',
      message: `Provider ${providerResolution.providerId} does not support extraction generation`,
    };
  }

  let replayedSnapshot = input.baselineSnapshot;
  if (replayedSnapshot === undefined) {
    let yopsRecords = input.topicId
      ? (await listActiveYOpsLogByConversation(input.db, input.conversationId)).filter(
          (record) => record.topicId === input.topicId
        )
      : await listActiveYOpsLogByConversation(input.db, input.conversationId);

    if (input.forceExtract && yopsRecords.length > 0) {
      for (const record of yopsRecords) {
        await deleteYOpsLogEntry(input.db, record.id);
      }
      yopsRecords = [];
    }

    replayedSnapshot = replayEntriesOnBaselineFailFast(
      await getConversationInheritedBaseline(input.db, input.conversationId),
      yopsRecords
    );
  }
  const mode: ExtractionMode = replayedSnapshot.trees.length > 0 ? 'incremental' : 'bootstrap';
  const promptTurns: PromptTurnInput[] = [];
  for (const turn of selectedTurns) {
    if (!isPromptTurnRole(turn.role)) {
      return {
        ok: false,
        kind: 'invalid_request',
        message: `Unsupported turn role for extraction: ${turn.role}`,
      };
    }
    promptTurns.push({
      turn_hash: turn.turnHash,
      role: turn.role,
      content: turn.content,
    });
  }

  const result = await extractAndApply({
    turns: promptTurns,
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
