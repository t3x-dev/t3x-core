import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  createTopic,
  deleteTopic,
  listTopicsByConversation,
  updateTopic,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';

export const topicRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });

const TopicSchema = z.object({
  id: z.string(),
  conversation_id: z.string(),
  project_id: z.string(),
  name: z.string(),
  status: z.string(),
  created_at: z.string(),
});

// List topics for a conversation
const listRoute = createRoute({
  method: 'get',
  path: '/v1/conversations/{conversation_id}/topics',
  tags: ['Topics'],
  summary: 'List topics for a conversation',
  request: {
    params: z.object({ conversation_id: z.string() }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ success: z.literal(true), data: z.array(TopicSchema) }) } },
      description: 'Topic list',
    },
  },
});

topicRoutes.openapi(listRoute, async (c) => {
  const db = await getDB();
  const convId = c.req.param('conversation_id');
  const result = await listTopicsByConversation(db, convId);
  const data = result.map((t) => ({
    id: t.id,
    conversation_id: t.conversationId,
    project_id: t.projectId,
    name: t.name,
    status: t.status,
    created_at: t.createdAt.toISOString(),
  }));
  return c.json({ success: true as const, data });
});

// Create topic
const createTopicRoute = createRoute({
  method: 'post',
  path: '/v1/conversations/{conversation_id}/topics',
  tags: ['Topics'],
  summary: 'Create a new topic',
  request: {
    params: z.object({ conversation_id: z.string() }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            project_id: z.string(),
            name: z.string().default('new_topic'),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: z.object({ success: z.literal(true), data: TopicSchema }) } },
      description: 'Topic created',
    },
  },
});

topicRoutes.openapi(createTopicRoute, async (c) => {
  const db = await getDB();
  const convId = c.req.param('conversation_id');
  const { project_id, name } = c.req.valid('json');
  const result = await createTopic(db, {
    conversationId: convId,
    projectId: project_id,
    name,
  });
  return c.json({
    success: true as const,
    data: {
      id: result.id,
      conversation_id: result.conversationId,
      project_id: result.projectId,
      name: result.name,
      status: result.status,
      created_at: result.createdAt.toISOString(),
    },
  }, 201);
});

// Update topic
const updateTopicRoute = createRoute({
  method: 'patch',
  path: '/v1/topics/{topic_id}',
  tags: ['Topics'],
  summary: 'Update a topic',
  request: {
    params: z.object({ topic_id: z.string() }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            name: z.string().optional(),
            status: z.enum(['active', 'collapsed']).optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ success: z.literal(true), data: TopicSchema }) } },
      description: 'Topic updated',
    },
  },
});

topicRoutes.openapi(updateTopicRoute, async (c) => {
  const db = await getDB();
  const topicId = c.req.param('topic_id');
  const updates = c.req.valid('json');
  const result = await updateTopic(db, topicId, updates);
  if (!result) return errorResponse(c, 'NOT_FOUND', 'Topic not found');
  return c.json({
    success: true as const,
    data: {
      id: result.id,
      conversation_id: result.conversationId,
      project_id: result.projectId,
      name: result.name,
      status: result.status,
      created_at: result.createdAt.toISOString(),
    },
  });
});

// Delete topic
const deleteTopicRoute = createRoute({
  method: 'delete',
  path: '/v1/topics/{topic_id}',
  tags: ['Topics'],
  summary: 'Delete a topic',
  request: {
    params: z.object({ topic_id: z.string() }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ success: z.literal(true), data: z.null() }) } },
      description: 'Topic deleted',
    },
  },
});

topicRoutes.openapi(deleteTopicRoute, async (c) => {
  const db = await getDB();
  const topicId = c.req.param('topic_id');
  const result = await deleteTopic(db, topicId);
  if (!result) return errorResponse(c, 'NOT_FOUND', 'Topic not found');
  return c.json({ success: true as const, data: null });
});
