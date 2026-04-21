import { type ExtractionFailure, type ExtractionMode, extractAndApply } from '@t3x-dev/core';
import {
  type AnyDB,
  deleteYOpsLogEntry,
  findConversationById,
  findTurnsByConversation,
  listYOpsLogByConversation,
  listYOpsLogByTopic,
} from '@t3x-dev/storage';
import { resolveProviderAndModel } from './provider-resolver';
import { replayYOpsLog, toYOpsLogEntries } from './yops-log-utils';

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
