/**
 * Topics Routes
 *
 * Multi-topic conversation management.
 *
 * Endpoints:
 * - GET    /v1/conversations/:id/topics  - List topics for a conversation
 * - POST   /v1/conversations/:id/topics  - Create a new topic
 * - PATCH  /v1/topics/:id                - Update a topic
 * - DELETE /v1/topics/:id                - Delete a topic
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  createTopic,
  deleteTopic,
  findConversationById,
  getTopicById,
  listTopicsByConversation,
  updateTopic,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

export const topicsRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// Schemas
// ============================================================

const ConversationIdParam = z.object({
  id: z.string().min(1),
});

const TopicIdParam = z.object({
  id: z.string().min(1),
});

const TopicResponse = z.object({
  id: z.string(),
  conversation_id: z.string(),
  project_id: z.string(),
  name: z.string(),
  status: z.string(),
  created_at: z.string(),
});

const CreateTopicRequest = z.object({
  name: z.string().min(1),
});

const UpdateTopicRequest = z.object({
  name: z.string().optional(),
  status: z.string().optional(),
});

// ============================================================
// Response Helpers
// ============================================================

function toApiTopic(record: {
  id: string;
  conversationId: string;
  projectId: string;
  name: string;
  status: string;
  createdAt: Date;
}) {
  return {
    id: record.id,
    conversation_id: record.conversationId,
    project_id: record.projectId,
    name: record.name,
    status: record.status,
    created_at: record.createdAt.toISOString(),
  };
}

// ============================================================
// Route Definitions
// ============================================================

const listTopicsRoute = createRoute({
  method: 'get',
  path: '/v1/conversations/{id}/topics',
  tags: ['Topics'],
  summary: 'List topics for a conversation',
  request: { params: ConversationIdParam },
  responses: {
    200: {
      description: 'List of topics',
      content: { 'application/json': { schema: SuccessResponseSchema(z.array(TopicResponse)) } },
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

const createTopicRoute = createRoute({
  method: 'post',
  path: '/v1/conversations/{id}/topics',
  tags: ['Topics'],
  summary: 'Create a new topic',
  request: {
    params: ConversationIdParam,
    body: { content: { 'application/json': { schema: CreateTopicRequest } } },
  },
  responses: {
    201: {
      description: 'Topic created',
      content: { 'application/json': { schema: SuccessResponseSchema(TopicResponse) } },
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

const updateTopicRoute = createRoute({
  method: 'patch',
  path: '/v1/topics/{id}',
  tags: ['Topics'],
  summary: 'Update a topic',
  request: {
    params: TopicIdParam,
    body: { content: { 'application/json': { schema: UpdateTopicRequest } } },
  },
  responses: {
    200: {
      description: 'Topic updated',
      content: { 'application/json': { schema: SuccessResponseSchema(TopicResponse) } },
    },
    404: {
      description: 'Topic not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const deleteTopicRoute = createRoute({
  method: 'delete',
  path: '/v1/topics/{id}',
  tags: ['Topics'],
  summary: 'Delete a topic',
  request: { params: TopicIdParam },
  responses: {
    200: {
      description: 'Topic deleted',
      content: { 'application/json': { schema: SuccessResponseSchema(z.null()) } },
    },
    404: {
      description: 'Topic not found',
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

topicsRoutes.openapi(listTopicsRoute, async (c) => {
  const { id: conversationId } = c.req.valid('param');
  try {
    const db = await getDB();
    const conversation = await findConversationById(db, conversationId);
    if (!conversation) {
      return errorResponse(c, 'CONVERSATION_NOT_FOUND', `Conversation not found: ${conversationId}`);
    }
    const records = await listTopicsByConversation(db, conversationId);
    return c.json({ success: true as const, data: records.map(toApiTopic) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'LIST_FAILED', message);
  }
});

topicsRoutes.openapi(createTopicRoute, async (c) => {
  const { id: conversationId } = c.req.valid('param');
  const { name } = c.req.valid('json');
  try {
    const db = await getDB();
    const conversation = await findConversationById(db, conversationId);
    if (!conversation) {
      return errorResponse(c, 'CONVERSATION_NOT_FOUND', `Conversation not found: ${conversationId}`);
    }
    const record = await createTopic(db, {
      conversationId,
      projectId: conversation.projectId,
      name,
    });
    return c.json({ success: true as const, data: toApiTopic(record) }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'CREATE_FAILED', message);
  }
});

topicsRoutes.openapi(updateTopicRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  try {
    const db = await getDB();
    const record = await updateTopic(db, id, body);
    if (!record) {
      return errorResponse(c, 'NOT_FOUND', `Topic not found: ${id}`);
    }
    return c.json({ success: true as const, data: toApiTopic(record) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'UPDATE_FAILED', message);
  }
});

topicsRoutes.openapi(deleteTopicRoute, async (c) => {
  const { id } = c.req.valid('param');
  try {
    const db = await getDB();
    const record = await deleteTopic(db, id);
    if (!record) {
      return errorResponse(c, 'NOT_FOUND', `Topic not found: ${id}`);
    }
    return c.json({ success: true as const, data: null }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'DELETE_FAILED', message);
  }
});

export default topicsRoutes;
