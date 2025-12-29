/**
 * Conversations Routes
 *
 * GET    /v1/conversations - List conversations (requires project_id query)
 * POST   /v1/conversations - Create conversation
 * GET    /v1/conversations/:id - Get conversation with turn count
 * PUT    /v1/conversations/:id - Update conversation
 * DELETE /v1/conversations/:id - Delete conversation
 */

import {
  deleteConversation,
  findConversationById,
  findConversationsByProject,
  findProjectById,
  getConversationTurnCount,
  insertConversation,
  updateConversation,
} from '@t3x/storage/pglite';
import { Hono } from 'hono';
import { getDB } from '../lib/db';
import { jsonError, jsonSuccess } from '../lib/response';

export const conversationRoutes = new Hono();

/**
 * GET /v1/conversations - List conversations
 */
conversationRoutes.get('/v1/conversations', async (c) => {
  const projectId = c.req.query('project_id');

  if (!projectId) {
    return jsonError(c, 'INVALID_REQUEST', 'project_id query param is required', 400);
  }

  const limit = parseInt(c.req.query('limit') ?? '100', 10);
  const offset = parseInt(c.req.query('offset') ?? '0', 10);

  try {
    const db = await getDB();
    const conversations = await findConversationsByProject(db, { projectId, limit, offset });

    const apiConversations = conversations.map((conv) => ({
      conversation_id: conv.conversationId,
      project_id: conv.projectId,
      title: conv.title,
      parent_commit_hash: conv.parentCommitHash,
      position_x: conv.positionX,
      position_y: conv.positionY,
      created_at: conv.createdAt.toISOString(),
      metadata: conv.metadataJson ? JSON.parse(conv.metadataJson) : null,
    }));

    return jsonSuccess(c, {
      conversations: apiConversations,
      project_id: projectId,
      limit,
      offset,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'LIST_FAILED', message, 500);
  }
});

/**
 * POST /v1/conversations - Create conversation
 */
conversationRoutes.post('/v1/conversations', async (c) => {
  let body: {
    project_id?: string;
    title?: string;
    parent_commit_hash?: string;
    position_x?: number;
    position_y?: number;
    metadata?: Record<string, unknown>;
  } | null = null;

  try {
    body = await c.req.json();
  } catch {
    return jsonError(c, 'INVALID_JSON', 'Invalid JSON body', 400);
  }

  if (!body?.project_id) {
    return jsonError(c, 'INVALID_REQUEST', 'project_id is required', 400);
  }

  try {
    const db = await getDB();

    // Verify project exists
    const project = await findProjectById(db, body.project_id);
    if (!project) {
      return jsonError(c, 'NOT_FOUND', `Project ${body.project_id} not found`, 404);
    }

    const conversation = await insertConversation(db, {
      projectId: body.project_id,
      title: body.title,
      parentCommitHash: body.parent_commit_hash,
      positionX: body.position_x,
      positionY: body.position_y,
      metadata: body.metadata,
    });

    const apiConversation = {
      conversation_id: conversation.conversationId,
      project_id: conversation.projectId,
      title: conversation.title,
      parent_commit_hash: conversation.parentCommitHash,
      position_x: conversation.positionX,
      position_y: conversation.positionY,
      created_at: conversation.createdAt.toISOString(),
      metadata: conversation.metadataJson ? JSON.parse(conversation.metadataJson) : null,
    };

    return jsonSuccess(c, apiConversation, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'CREATE_FAILED', message, 500);
  }
});

/**
 * GET /v1/conversations/:id - Get conversation with turn count
 */
conversationRoutes.get('/v1/conversations/:id', async (c) => {
  const conversationId = c.req.param('id');

  try {
    const db = await getDB();
    const conversation = await findConversationById(db, conversationId);

    if (!conversation) {
      return jsonError(c, 'NOT_FOUND', `Conversation ${conversationId} not found`, 404);
    }

    const turnsCount = await getConversationTurnCount(db, conversationId);

    const apiConversation = {
      conversation_id: conversation.conversationId,
      project_id: conversation.projectId,
      title: conversation.title,
      parent_commit_hash: conversation.parentCommitHash,
      position_x: conversation.positionX,
      position_y: conversation.positionY,
      created_at: conversation.createdAt.toISOString(),
      metadata: conversation.metadataJson ? JSON.parse(conversation.metadataJson) : null,
      turns_count: turnsCount,
    };

    return jsonSuccess(c, apiConversation);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'GET_FAILED', message, 500);
  }
});

/**
 * PUT /v1/conversations/:id - Update conversation
 */
conversationRoutes.put('/v1/conversations/:id', async (c) => {
  const conversationId = c.req.param('id');

  let body: {
    title?: string;
    position_x?: number;
    position_y?: number;
    metadata?: Record<string, unknown>;
  } | null = null;

  try {
    body = await c.req.json();
  } catch {
    return jsonError(c, 'INVALID_JSON', 'Invalid JSON body', 400);
  }

  try {
    const db = await getDB();
    const conversation = await updateConversation(db, conversationId, {
      title: body?.title,
      positionX: body?.position_x,
      positionY: body?.position_y,
      metadata: body?.metadata,
    });

    if (!conversation) {
      return jsonError(c, 'NOT_FOUND', `Conversation ${conversationId} not found`, 404);
    }

    const apiConversation = {
      conversation_id: conversation.conversationId,
      project_id: conversation.projectId,
      title: conversation.title,
      parent_commit_hash: conversation.parentCommitHash,
      position_x: conversation.positionX,
      position_y: conversation.positionY,
      created_at: conversation.createdAt.toISOString(),
      metadata: conversation.metadataJson ? JSON.parse(conversation.metadataJson) : null,
    };

    return jsonSuccess(c, apiConversation);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'UPDATE_FAILED', message, 500);
  }
});

/**
 * DELETE /v1/conversations/:id - Delete conversation
 */
conversationRoutes.delete('/v1/conversations/:id', async (c) => {
  const conversationId = c.req.param('id');

  try {
    const db = await getDB();
    const deleted = await deleteConversation(db, conversationId);

    if (!deleted) {
      return jsonError(c, 'NOT_FOUND', `Conversation ${conversationId} not found`, 404);
    }

    return jsonSuccess(c, { deleted: true, conversation_id: conversationId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'DELETE_FAILED', message, 500);
  }
});
