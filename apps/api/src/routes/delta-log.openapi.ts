/**
 * Delta Log Routes with OpenAPI
 *
 * REST API endpoints for semantic delta log CRUD and draft computation.
 * Deltas track incremental changes to semantic frames within a conversation.
 *
 * Endpoints:
 * - POST   /v1/conversations/:conversationId/deltas        - Append a delta
 * - GET    /v1/conversations/:conversationId/deltas        - List deltas
 * - GET    /v1/conversations/:conversationId/draft         - Compute current draft
 * - DELETE /v1/conversations/:conversationId/deltas/:deltaId - Delete a delta (undo)
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { buildDraft } from '@t3x-dev/core';
import type { DeltaSource } from '@t3x-dev/core';
import {
  deleteDeltaLogEntry,
  findConversationById,
  getDeltaLogEntry,
  insertDeltaLogEntry,
  listDeltaLogByConversation,
  listDeltaLogByTopic,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { toDeltaLogEntries } from '../lib/delta-log-utils';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { readDraftFromFrames, rebuildFramesFromSnapshot, syncDeltaToFrames } from '../lib/frame-state-sync';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

export const deltaLogRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// Shared Schemas
// ============================================================

const ConversationIdParam = z.object({
  conversationId: z.string().min(1),
});

const DeltaIdParam = z.object({
  conversationId: z.string().min(1),
  deltaId: z.string().min(1),
});

const DeltaSourceSchema = z.enum(['pipeline', 'manual', 'answer', 'collapse', 'commit_marker', 'compress']);

const FrameChangeSchema = z
  .object({
    action: z.enum(['add', 'update', 'remove']),
  })
  .passthrough();

const RelationInputSchema = z
  .object({
    from: z.string().min(1),
    to: z.string().min(1),
    type: z.enum(['causes', 'conditions', 'contrasts', 'elaborates', 'follows', 'depends']),
  })
  .passthrough();

const DeltaSchema = z.object({
  changes: z.array(FrameChangeSchema).min(1),
  new_relations: z.array(RelationInputSchema).optional(),
  remove_relations: z.array(RelationInputSchema).optional(),
});

const CreateDeltaRequest = z.object({
  source: DeltaSourceSchema,
  turn_hash: z.string().optional(),
  delta: DeltaSchema,
});

const DeltaLogEntryResponse = z.object({
  id: z.string(),
  conversation_id: z.string(),
  project_id: z.string(),
  source: z.string(),
  turn_hash: z.string().nullable(),
  delta: z.any(),
  created_at: z.string(),
});

const DraftResponse = z.object({
  frames: z.array(z.any()),
  relations: z.array(z.any()),
});

// ============================================================
// Response Helpers
// ============================================================

function toApiDeltaEntry(record: {
  id: string;
  conversationId: string;
  projectId: string;
  source: string;
  turnHash: string | null;
  delta: unknown;
  createdAt: Date;
}) {
  return {
    id: record.id,
    conversation_id: record.conversationId,
    project_id: record.projectId,
    source: record.source,
    turn_hash: record.turnHash ?? null,
    delta: record.delta,
    created_at: record.createdAt.toISOString(),
  };
}

// ============================================================
// Route Definitions
// ============================================================

// POST /v1/conversations/:conversationId/deltas
const createDeltaRoute = createRoute({
  method: 'post',
  path: '/v1/conversations/{conversationId}/deltas',
  tags: ['Delta Log'],
  summary: 'Append a delta to the log',
  description: 'Appends a new delta entry to the conversation delta log.',
  request: {
    params: ConversationIdParam,
    body: {
      content: {
        'application/json': {
          schema: CreateDeltaRequest,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Delta created successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(DeltaLogEntryResponse),
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

// GET /v1/conversations/:conversationId/deltas
const listDeltasRoute = createRoute({
  method: 'get',
  path: '/v1/conversations/{conversationId}/deltas',
  tags: ['Delta Log'],
  summary: 'List deltas for a conversation',
  description:
    'Returns all delta log entries for a conversation, ordered by created_at ASC. Optionally filter by topic_id.',
  request: {
    params: ConversationIdParam,
    query: TopicIdQuery,
  },
  responses: {
    200: {
      description: 'List of delta log entries',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.array(DeltaLogEntryResponse)),
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
  tags: ['Delta Log'],
  summary: 'Compute current draft from delta log',
  description:
    'Computes the current semantic draft by replaying all deltas. Not stored — computed on the fly. Optionally filter by topic_id.',
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

// DELETE /v1/conversations/:conversationId/deltas/:deltaId
const deleteDeltaRoute = createRoute({
  method: 'delete',
  path: '/v1/conversations/{conversationId}/deltas/{deltaId}',
  tags: ['Delta Log'],
  summary: 'Delete a delta entry (undo)',
  description: 'Deletes a delta log entry by ID. Used for undo operations.',
  request: {
    params: DeltaIdParam,
  },
  responses: {
    200: {
      description: 'Delta deleted successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.null()),
        },
      },
    },
    404: {
      description: 'Delta not found',
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

// POST /v1/conversations/:conversationId/deltas
deltaLogRoutes.openapi(createDeltaRoute, async (c) => {
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

    // Write delta_log + sync frames atomically
    const record = await (db as any).transaction(async (tx: any) => {
      const rec = await insertDeltaLogEntry(tx, {
        conversationId,
        projectId: conversation.projectId,
        source: body.source,
        turnHash: body.turn_hash,
        delta: body.delta,
      });
      await syncDeltaToFrames(tx, conversationId, conversation.projectId, body.delta, body.source as DeltaSource);
      return rec;
    });

    return c.json({ success: true as const, data: toApiDeltaEntry(record) }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'CREATE_FAILED', message);
  }
});

// GET /v1/conversations/:conversationId/deltas
deltaLogRoutes.openapi(listDeltasRoute, async (c) => {
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
      ? await listDeltaLogByTopic(db, conversationId, topic_id)
      : await listDeltaLogByConversation(db, conversationId);

    return c.json({ success: true as const, data: records.map(toApiDeltaEntry) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'LIST_FAILED', message);
  }
});

// GET /v1/conversations/:conversationId/draft
deltaLogRoutes.openapi(getDraftRoute, async (c) => {
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

    // Read from frames table; fallback to delta replay for unmigrated conversations
    let draft = await readDraftFromFrames(db, conversationId, topic_id);
    if (draft.frames.length === 0) {
      // Fallback: replay deltas (pre-migration conversations)
      const records = topic_id
        ? await listDeltaLogByTopic(db, conversationId, topic_id)
        : await listDeltaLogByConversation(db, conversationId);
      draft = buildDraft(toDeltaLogEntries(records));
    }

    return c.json({ success: true as const, data: draft }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'GET_FAILED', message);
  }
});

// DELETE /v1/conversations/:conversationId/deltas/:deltaId
deltaLogRoutes.openapi(deleteDeltaRoute, async (c) => {
  const { conversationId, deltaId } = c.req.valid('param');

  try {
    const db = await getDB();

    // Verify the entry exists and belongs to this conversation
    const existing = await getDeltaLogEntry(db, deltaId);
    if (!existing || existing.conversationId !== conversationId) {
      return errorResponse(c, 'NOT_FOUND', `Delta log entry not found: ${deltaId}`);
    }

    // Undo: delete delta + rebuild frames atomically
    await (db as any).transaction(async (tx: any) => {
      await deleteDeltaLogEntry(tx, deltaId);
      const remainingRecords = await listDeltaLogByConversation(tx, conversationId);
      const remainingEntries = toDeltaLogEntries(remainingRecords);
      const rebuilt = buildDraft(remainingEntries);
      await rebuildFramesFromSnapshot(tx, conversationId, existing.projectId, rebuilt);
    });

    return c.json({ success: true as const, data: null }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'DELETE_FAILED', message);
  }
});

export default deltaLogRoutes;
