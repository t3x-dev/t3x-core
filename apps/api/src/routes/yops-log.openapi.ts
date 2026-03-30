/**
 * YOps Log Routes with OpenAPI
 *
 * REST API endpoints for semantic yops log CRUD and draft computation.
 * YOps track incremental changes to semantic trees within a conversation.
 *
 * Endpoints:
 * - POST   /v1/conversations/:conversationId/yops        - Append yops
 * - GET    /v1/conversations/:conversationId/yops        - List yops
 * - GET    /v1/conversations/:conversationId/draft        - Compute current draft
 * - DELETE /v1/conversations/:conversationId/yops/:yopsId - Delete a yops entry (undo)
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { YOpsSource } from '@t3x-dev/core';
import { flattenTrees } from '@t3x-dev/core';
import {
  deleteYOpsLogEntry,
  findConversationById,
  getYOpsLogEntry,
  insertYOpsLogEntry,
  listYOpsLogByConversation,
  listYOpsLogByTopic,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { replayYOpsLog, toYOpsLogEntries } from '../lib/yops-log-utils';
import { errorResponse, zodErrorHook } from '../lib/errors';
import {
  readDraftFromTrees,
  rebuildTreesFromSnapshot,
  syncYOpsToTrees,
} from '../lib/tree-state-sync';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

export const yopsLogRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// Shared Schemas
// ============================================================

const ConversationIdParam = z.object({
  conversationId: z.string().min(1),
});

const YOpsIdParam = z.object({
  conversationId: z.string().min(1),
  yopsId: z.string().min(1),
});

const YOpsSourceSchema = z.enum([
  'pipeline',
  'manual',
  'answer',
  'collapse',
  'commit_marker',
  'compress',
]);

const FrameChangeSchema = z
  .object({
    action: z.enum(['add', 'update', 'remove']),
  })
  .passthrough();

const RelationInputSchema = z
  .object({
    from: z.string().min(1),
    to: z.string().min(1),
    type: z.enum(['causes', 'conditions', 'contrasts', 'follows', 'depends']),
  })
  .passthrough();

const TreeChangeBatchSchema = z.object({
  changes: z.array(FrameChangeSchema).min(1),
  new_relations: z.array(RelationInputSchema).optional(),
  remove_relations: z.array(RelationInputSchema).optional(),
});

const CreateYOpsRequest = z.object({
  source: YOpsSourceSchema,
  turn_hash: z.string().optional(),
  yops: TreeChangeBatchSchema,
});

const YOpsLogEntryResponse = z.object({
  id: z.string(),
  conversation_id: z.string(),
  project_id: z.string(),
  source: z.string(),
  turn_hash: z.string().nullable(),
  yops: z.any(),
  created_at: z.string(),
});

const DraftResponse = z.object({
  trees: z.array(z.any()),
  relations: z.array(z.any()),
});

// ============================================================
// Response Helpers
// ============================================================

function toApiYOpsEntry(record: {
  id: string;
  conversationId: string;
  projectId: string;
  source: string;
  turnHash: string | null;
  yops: unknown;
  createdAt: Date;
}) {
  return {
    id: record.id,
    conversation_id: record.conversationId,
    project_id: record.projectId,
    source: record.source,
    turn_hash: record.turnHash ?? null,
    yops: record.yops,
    created_at: record.createdAt.toISOString(),
  };
}

// ============================================================
// Route Definitions
// ============================================================

// POST /v1/conversations/:conversationId/yops
const createYOpsRoute = createRoute({
  method: 'post',
  path: '/v1/conversations/{conversationId}/yops',
  tags: ['YOps Log'],
  summary: 'Append yops to the log',
  description: 'Appends a new yops entry to the conversation yops log.',
  request: {
    params: ConversationIdParam,
    body: {
      content: {
        'application/json': {
          schema: CreateYOpsRequest,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'YOps created successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(YOpsLogEntryResponse),
        },
      },
    },
    404: {
      description: 'Conversation not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const TopicIdQuery = z.object({
  topic_id: z.string().optional(),
});

// GET /v1/conversations/:conversationId/yops
const listYOpsRoute = createRoute({
  method: 'get',
  path: '/v1/conversations/{conversationId}/yops',
  tags: ['YOps Log'],
  summary: 'List yops for a conversation',
  description:
    'Returns all yops log entries for a conversation, ordered by created_at ASC. Optionally filter by topic_id.',
  request: {
    params: ConversationIdParam,
    query: TopicIdQuery,
  },
  responses: {
    200: {
      description: 'List of yops log entries',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.array(YOpsLogEntryResponse)),
        },
      },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// GET /v1/conversations/:conversationId/draft
const getDraftRoute = createRoute({
  method: 'get',
  path: '/v1/conversations/{conversationId}/draft',
  tags: ['YOps Log'],
  summary: 'Compute current draft from yops log',
  description:
    'Computes the current semantic draft by replaying all yops. Not stored — computed on the fly. Optionally filter by topic_id.',
  request: {
    params: ConversationIdParam,
    query: TopicIdQuery,
  },
  responses: {
    200: {
      description: 'Computed draft',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(DraftResponse),
        },
      },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// DELETE /v1/conversations/:conversationId/yops/:yopsId
const deleteYOpsRoute = createRoute({
  method: 'delete',
  path: '/v1/conversations/{conversationId}/yops/{yopsId}',
  tags: ['YOps Log'],
  summary: 'Delete a yops entry (undo)',
  description: 'Deletes a yops log entry by ID. Used for undo operations.',
  request: {
    params: YOpsIdParam,
  },
  responses: {
    200: {
      description: 'YOps entry deleted successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.null()),
        },
      },
    },
    404: {
      description: 'YOps entry not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// ============================================================
// Route Handlers
// ============================================================

// POST /v1/conversations/:conversationId/yops
yopsLogRoutes.openapi(createYOpsRoute, async (c) => {
  const { conversationId } = c.req.valid('param');
  const body = c.req.valid('json');

  try {
    const db = await getDB();

    // Look up conversation to get projectId
    const conversation = await findConversationById(db, conversationId);
    if (!conversation) {
      return errorResponse(
        c,
        'CONVERSATION_NOT_FOUND',
        `Conversation not found: ${conversationId}`
      );
    }

    // Write yops_log + sync trees atomically
    const record = await (db as any).transaction(async (tx: any) => {
      const rec = await insertYOpsLogEntry(tx, {
        conversationId,
        projectId: conversation.projectId,
        source: body.source,
        turnHash: body.turn_hash,
        yops: body.yops,
      });
      await syncYOpsToTrees(
        tx,
        conversationId,
        conversation.projectId,
      );
      return rec;
    });

    return c.json({ success: true as const, data: toApiYOpsEntry(record) }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'CREATE_FAILED', message);
  }
});

// GET /v1/conversations/:conversationId/yops
yopsLogRoutes.openapi(listYOpsRoute, async (c) => {
  const { conversationId } = c.req.valid('param');
  const { topic_id } = c.req.valid('query');

  try {
    const db = await getDB();

    const conversation = await findConversationById(db, conversationId);
    if (!conversation) {
      return errorResponse(
        c,
        'CONVERSATION_NOT_FOUND',
        `Conversation not found: ${conversationId}`
      );
    }

    const records = topic_id
      ? await listYOpsLogByTopic(db, conversationId, topic_id)
      : await listYOpsLogByConversation(db, conversationId);

    return c.json({ success: true as const, data: records.map(toApiYOpsEntry) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'LIST_FAILED', message);
  }
});

// GET /v1/conversations/:conversationId/draft
yopsLogRoutes.openapi(getDraftRoute, async (c) => {
  const { conversationId } = c.req.valid('param');
  const { topic_id } = c.req.valid('query');

  try {
    const db = await getDB();

    const conversation = await findConversationById(db, conversationId);
    if (!conversation) {
      return errorResponse(
        c,
        'CONVERSATION_NOT_FOUND',
        `Conversation not found: ${conversationId}`
      );
    }

    // Read from trees table (source-of-truth with full metadata)
    let draft = await readDraftFromTrees(db, conversationId, topic_id);
    if (draft.trees.length === 0) {
      // Fallback: replay yops log for legacy conversations without trees
      const records = topic_id
        ? await listYOpsLogByTopic(db, conversationId, topic_id)
        : await listYOpsLogByConversation(db, conversationId);
      draft = replayYOpsLog(toYOpsLogEntries(records));
    }

    return c.json({ success: true as const, data: draft }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'GET_FAILED', message);
  }
});

// DELETE /v1/conversations/:conversationId/yops/:yopsId
yopsLogRoutes.openapi(deleteYOpsRoute, async (c) => {
  const { conversationId, yopsId } = c.req.valid('param');

  try {
    const db = await getDB();

    // Verify the entry exists and belongs to this conversation
    const existing = await getYOpsLogEntry(db, yopsId);
    if (!existing || existing.conversationId !== conversationId) {
      return errorResponse(c, 'NOT_FOUND', `YOps log entry not found: ${yopsId}`);
    }

    // Undo: delete yops entry + rebuild trees atomically
    await (db as any).transaction(async (tx: any) => {
      await deleteYOpsLogEntry(tx, yopsId);
      const remainingRecords = await listYOpsLogByConversation(tx, conversationId);
      const remainingEntries = toYOpsLogEntries(remainingRecords);
      const rebuilt = replayYOpsLog(remainingEntries);
      await rebuildTreesFromSnapshot(tx, conversationId, existing.projectId, rebuilt);
    });

    return c.json({ success: true as const, data: null }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'DELETE_FAILED', message);
  }
});

export default yopsLogRoutes;
