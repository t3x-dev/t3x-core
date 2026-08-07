import type { z } from '@hono/zod-openapi';
import { collectResult, runOperation, serializeForPrompt } from '@t3x-dev/core';
import {
  type AnyDB,
  findConversationById,
  insertConversation,
  insertDraft,
  insertTurn,
  updateDraft,
} from '@t3x-dev/storage';
import type { ApiPipelineContext } from '../ops/context';
import { extractOp } from '../ops/extract';
import type { ExtractResponse } from '../schemas/integration-contracts';
import { webhookDispatcher } from './webhook-dispatcher';

export class LegacyExtractError extends Error {
  constructor(
    readonly kind: 'conversation_not_found' | 'invalid_request' | 'extraction_failed',
    message: string
  ) {
    super(message);
    this.name = 'LegacyExtractError';
  }
}

/** Compatibility application use case for raw-text callers awaiting Workspace migration. */
export async function extractLegacyTextToDraft(input: {
  db: AnyDB;
  context: ApiPipelineContext;
  projectId: string;
  text: string;
  conversationId?: string;
  source?: string;
  userId?: string;
}): Promise<z.infer<typeof ExtractResponse>> {
  let conversationId = input.conversationId;
  if (conversationId) {
    const conversation = await findConversationById(input.db, conversationId);
    if (!conversation || conversation.projectId !== input.projectId) {
      throw new LegacyExtractError(
        'conversation_not_found',
        `Conversation ${conversationId} not found`
      );
    }
  } else {
    const conversation = await insertConversation(input.db, {
      projectId: input.projectId,
      title: input.source ? `API extract: ${input.source}` : 'API extract',
    });
    conversationId = conversation.conversationId;
  }

  const turn = await insertTurn(input.db, {
    projectId: input.projectId,
    conversationId,
    role: 'user',
    content: input.text,
  });
  const extraction = await collectResult(
    runOperation(
      extractOp,
      {
        conversationId,
        turnHashes: [turn.turnHash],
        userId: input.userId,
      },
      input.context
    )
  );
  if (!extraction.ok) {
    throw new LegacyExtractError(
      extraction.kind === 'conversation_not_found' || extraction.kind === 'invalid_request'
        ? extraction.kind
        : 'extraction_failed',
      extraction.message
    );
  }

  const trees = extraction.snapshot.trees;
  const draft = await insertDraft(input.db, {
    project_id: input.projectId,
    title: input.source ? `Extract: ${input.source}` : 'API extraction',
  });
  await updateDraft(input.db, draft.id, { nodes: trees }, draft.revision);
  webhookDispatcher.dispatch(
    'draft.ready',
    {
      project_id: input.projectId,
      draft_id: draft.id,
      conversation_id: conversationId,
      tree_count: trees.length,
    },
    input.projectId
  );

  return {
    conversation_id: conversationId,
    draft_id: draft.id,
    trees,
    yaml: serializeForPrompt(extraction.snapshot),
    drift: undefined,
    extraction_mode: 'llm',
  };
}
