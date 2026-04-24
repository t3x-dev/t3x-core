/**
 * Shared extraction event adapter.
 *
 * This generator preserves the tree-extract JSON/SSE event surface while
 * delegating extraction semantics to the canonical v2 pipeline.
 */

import { createHash } from 'node:crypto';
import {
  type AnyDB,
  createTopic,
  findConversationById,
  insertYOpsLogEntry,
  listTopicsByConversation,
  recordEvent,
  setAliasIfNull,
} from '@t3x-dev/storage';
import { pinoLogger } from '../middleware/logger';
import { runApiExtractionV2 } from './extraction-v2';
import { rebuildTreesFromSnapshot } from './tree-state-sync';

const ALIAS_FORMAT = /^[a-z][a-z0-9_]{0,63}$/;

export function deriveAliasCandidate(rootKey: string, conversationId = 'conv_unknown'): string {
  const sanitized = rootKey
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 64);

  if (ALIAS_FORMAT.test(sanitized)) return sanitized;

  const hash = createHash('sha256').update(conversationId).digest('hex').slice(0, 8);
  return `topic_${hash}`;
}

interface MaybeAssignAliasArgs {
  db: AnyDB;
  conversation: { conversationId: string; projectId: string; alias: string | null };
  rootKey: string;
  setAliasIfNull: typeof import('@t3x-dev/storage').setAliasIfNull;
}

export async function maybeAssignAlias(args: MaybeAssignAliasArgs): Promise<void> {
  const { db, conversation, rootKey, setAliasIfNull } = args;
  if (conversation.alias) return;

  try {
    const candidate = deriveAliasCandidate(rootKey, conversation.conversationId);
    await setAliasIfNull(db, conversation.conversationId, candidate);
  } catch (err) {
    pinoLogger.warn(
      { err, conversationId: conversation.conversationId },
      'Alias derivation failed (extraction continues)'
    );
  }
}

export interface PipelineEvent {
  type:
    | 'status'
    | 'yop'
    | 'reorganized'
    | 'gate'
    | 'advisory'
    | 'drift'
    | 'skipped'
    | 'done'
    | 'error';
  data: Record<string, unknown>;
}

export interface ExtractionPipelineParams {
  conversationId: string;
  projectId: string;
  turnHashes?: string[];
  topicId?: string;
  forceExtract?: boolean;
  userId?: string;
}

function mapFailureToEvent(
  result: Extract<Awaited<ReturnType<typeof runApiExtractionV2>>, { ok: false }>
): PipelineEvent {
  if (result.kind === 'conversation_not_found') {
    return {
      type: 'error',
      data: { code: 'CONVERSATION_NOT_FOUND', message: result.message },
    };
  }

  if (result.kind === 'invalid_request') {
    return {
      type: 'error',
      data: { code: 'INVALID_REQUEST', message: result.message },
    };
  }

  if (result.kind === 'provider_unavailable') {
    return {
      type: 'error',
      data: { code: 'LLM_NOT_CONFIGURED', message: result.message },
    };
  }

  return {
    type: 'error',
    data: {
      code: 'EXTRACTION_FAILED',
      message: result.message,
      failure_code: result.failure?.code,
    },
  };
}

/**
 * IMPORTANT: This function does NOT perform authorization checks.
 * Callers MUST verify project access before invoking this generator.
 */
export async function* runExtractionPipeline(
  params: ExtractionPipelineParams
): AsyncGenerator<PipelineEvent> {
  try {
    const { getDB } = await import('./db');
    const db = await getDB();

    const conversation = await findConversationById(db, params.conversationId);
    if (!conversation) {
      yield {
        type: 'error',
        data: {
          code: 'CONVERSATION_NOT_FOUND',
          message: `Conversation not found: ${params.conversationId}`,
        },
      };
      return;
    }

    yield { type: 'status', data: { step: 'extracting' } };

    const extraction = await runApiExtractionV2({
      db,
      conversationId: conversation.conversationId,
      turnHashes: params.turnHashes,
      topicId: params.topicId,
      forceExtract: params.forceExtract,
      userId: params.userId,
    });

    if (!extraction.ok) {
      yield mapFailureToEvent(extraction);
      return;
    }

    if (extraction.ops.length === 0) {
      yield {
        type: 'skipped',
        data: {
          reason:
            extraction.snapshot.trees.length === 0
              ? 'No extractable content found in the conversation.'
              : 'No semantic changes detected from the selected turns.',
          snapshot: extraction.snapshot,
          delta: [],
        },
      };
      return;
    }

    await recordEvent(db, {
      type: 'extraction.started',
      projectId: conversation.projectId,
      conversationId: conversation.conversationId,
    });

    for (let index = 0; index < extraction.ops.length; index++) {
      yield {
        type: 'yop',
        data: { ...extraction.ops[index], index, total: extraction.ops.length },
      };
    }

    yield { type: 'status', data: { step: 'reorganizing' } };
    yield {
      type: 'reorganized',
      data: { snapshot: extraction.snapshot },
    };

    let resolvedTopicId = params.topicId;
    if (!resolvedTopicId && extraction.snapshot.trees.length > 0) {
      const existingTopics = await listTopicsByConversation(db, conversation.conversationId);
      if (existingTopics.length === 0) {
        const rootNode = extraction.snapshot.trees[0];
        const topic = await createTopic(db, {
          conversationId: conversation.conversationId,
          projectId: conversation.projectId,
          name: rootNode.key,
        });
        resolvedTopicId = topic.id;
      } else if (existingTopics.length === 1) {
        resolvedTopicId = existingTopics[0].id;
      }
    }

    yield { type: 'status', data: { step: 'persisting' } };

    // biome-ignore lint/suspicious/noExplicitAny: tx type depends on adapter
    const record = await (db as any).transaction(async (tx: any) => {
      const rec = await insertYOpsLogEntry(tx, {
        conversationId: conversation.conversationId,
        projectId: conversation.projectId,
        source: 'pipeline',
        yops: extraction.ops,
        pipelineState: 'completed',
        gateResultJson: null,
        topicId: resolvedTopicId,
      });
      await rebuildTreesFromSnapshot(
        tx,
        conversation.conversationId,
        conversation.projectId,
        extraction.snapshot,
        resolvedTopicId
      );
      return rec;
    });

    const rootKey = extraction.snapshot.trees[0]?.key;
    if (rootKey) {
      const refreshedConversation = await findConversationById(db, conversation.conversationId);
      if (refreshedConversation) {
        await maybeAssignAlias({
          db,
          conversation: {
            conversationId: refreshedConversation.conversationId,
            projectId: refreshedConversation.projectId,
            alias: refreshedConversation.alias,
          },
          rootKey,
          setAliasIfNull,
        });
      }
    }

    await recordEvent(db, {
      type: 'extraction.done',
      projectId: conversation.projectId,
      conversationId: conversation.conversationId,
      payload: { yops_log_id: record.id, source: 'api' },
    });

    yield {
      type: 'done',
      data: {
        status: 'completed',
        yops_log_id: record.id,
        snapshot: extraction.snapshot,
        delta: extraction.ops,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    yield {
      type: 'error',
      data: { code: 'EXTRACTION_FAILED', message },
    };
  }
}
