/**
 * Ingest Routes (OpenAPI)
 *
 * External source webhook endpoint for ingesting turns from third-party systems.
 *
 * POST /v1/projects/:projectId/ingest/webhook - Accept Turn[] and create conversation + turns
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  findConversationById,
  findProjectById,
  insertConversation,
  insertTurn,
} from '@t3x/storage/pglite';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

export const ingestRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================================
// Schemas
// ============================================================================

const IngestTurnSchema = z.object({
  role: z.enum(['user', 'assistant', 'system', 'tool']).openapi({ description: 'Message role' }),
  content: z.string().min(1).max(100_000).openapi({ description: 'Message content' }),
  created_at: z.string().optional().openapi({ description: 'ISO8601 timestamp (optional)' }),
});

const IngestWebhookRequest = z
  .object({
    turns: z.array(IngestTurnSchema).min(1).max(500).openapi({ description: 'Turns to ingest' }),
    conversation_id: z.string().optional().openapi({
      description:
        'Existing conversation ID to append to. If omitted, a new conversation is created.',
    }),
    title: z.string().max(1000).optional().openapi({
      description: 'Title for new conversation. Ignored if conversation_id is provided.',
    }),
    source: z.string().max(500).optional().openapi({
      description: 'Source identifier (e.g., "slack", "discord", "custom")',
    }),
  })
  .openapi('IngestWebhookRequest');

const IngestResultSchema = z.object({
  conversation_id: z.string(),
  turns_created: z.number(),
  source: z.string().nullable(),
});

// ============================================================================
// POST /v1/projects/:projectId/ingest/webhook
// ============================================================================

const ingestWebhookRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/ingest/webhook',
  tags: ['Ingest'],
  summary: 'Ingest turns from external source',
  description: `
Accepts an array of turns and creates or appends to a conversation.
If conversation_id is provided, turns are appended to the existing conversation.
Otherwise, a new conversation is created.
  `.trim(),
  request: {
    params: z.object({
      projectId: z.string().openapi({ description: 'Project ID' }),
    }),
    body: {
      content: {
        'application/json': { schema: IngestWebhookRequest },
      },
    },
  },
  responses: {
    201: {
      description: 'Turns ingested successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(IngestResultSchema),
        },
      },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Project or conversation not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

ingestRoutes.openapi(ingestWebhookRoute, async (c) => {
  const { projectId } = c.req.valid('param');
  const body = c.req.valid('json');

  const db = await getDB();

  // Verify project exists
  const project = await findProjectById(db, projectId);
  if (!project) {
    return errorResponse(c, 'PROJECT_NOT_FOUND', `Project not found: ${projectId}`);
  }

  let conversationId: string;

  if (body.conversation_id) {
    // Append to existing conversation — verify it exists and belongs to this project
    const existing = await findConversationById(db, body.conversation_id);
    if (!existing) {
      return errorResponse(
        c,
        'CONVERSATION_NOT_FOUND',
        `Conversation not found: ${body.conversation_id}`
      );
    }
    if (existing.projectId !== projectId) {
      return errorResponse(
        c,
        'INVALID_REQUEST',
        `Conversation ${body.conversation_id} does not belong to project ${projectId}`
      );
    }
    conversationId = body.conversation_id;
  } else {
    // Create new conversation
    const conv = await insertConversation(db, {
      projectId,
      title: body.title ?? `Webhook ingest${body.source ? ` (${body.source})` : ''}`,
      metadata: body.source ? { source: body.source } : undefined,
    });
    conversationId = conv.conversationId;
  }

  // Insert turns sequentially (hash chain requires ordering)
  let turnsCreated = 0;
  for (const turn of body.turns) {
    await insertTurn(db, {
      projectId,
      conversationId,
      role: turn.role,
      content: turn.content,
    });
    turnsCreated++;
  }

  return c.json(
    {
      success: true as const,
      data: {
        conversation_id: conversationId,
        turns_created: turnsCreated,
        source: body.source ?? null,
      },
    },
    201
  );
});

export default ingestRoutes;
