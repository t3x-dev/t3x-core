/**
 * Conversations Routes
 *
 * GET    /v1/conversations - List conversations (requires project_id query)
 * POST   /v1/conversations - Create conversation
 * GET    /v1/conversations/:id - Get conversation with turn count
 * PUT    /v1/conversations/:id - Update conversation
 * DELETE /v1/conversations/:id - Delete conversation
 * GET    /v1/conversations/:id/context - Get context config
 * PUT    /v1/conversations/:id/context - Update context config
 * GET    /v1/conversations/:id/memory - Get built memory string (requires Track A)
 * GET    /v1/conversations/:id/context-export - Export context as JSON/Markdown file
 */

import { buildConversationContext, getModelInfo, type ConversationData } from '@t3x-dev/core';
import {
  deleteConversation,
  findCommitV4ByHash,
  findConversationById,
  findConversationsByProject,
  findCurrentBranch,
  findPinsByProject,
  findProjectById,
  findTurnsByConversation,
  getConversationContext,
  getConversationTurnCount,
  getLeavesByIds,
  insertConversation,
  setConversationContext,
  updateConversation,
} from '@t3x-dev/storage';
import { Hono } from 'hono';
import { formatContextForExport } from '../lib/context-formatter';
import { getDB } from '../lib/db';
import { jsonError, jsonSuccess } from '../lib/response';

export const conversationRoutes = new Hono();

/**
 * GET /v1/conversations - List conversations
 *
 * Supports cursor-based pagination: pass `cursor` query parameter
 * (empty string for first page) to receive `{ items, next_cursor, has_more }` response.
 * Omit `cursor` for legacy offset/limit mode.
 */
conversationRoutes.get('/v1/conversations', async (c) => {
  const projectId = c.req.query('project_id');

  if (!projectId) {
    return jsonError(c, 'INVALID_REQUEST', 'project_id query param is required', 400);
  }

  const limit = Math.min(Math.max(parseInt(c.req.query('limit') ?? '100', 10) || 100, 1), 1000);
  const offset = Math.max(parseInt(c.req.query('offset') ?? '0', 10) || 0, 0);
  const cursor = c.req.query('cursor');

  const toApiConversation = (conv: {
    conversationId: string;
    projectId: string;
    title: string | null;
    parentCommitHash: string | null;
    positionX: number | null;
    positionY: number | null;
    createdAt: Date;
    metadataJson: string | null;
  }) => ({
    conversation_id: conv.conversationId,
    project_id: conv.projectId,
    title: conv.title,
    parent_commit_hash: conv.parentCommitHash,
    position_x: conv.positionX,
    position_y: conv.positionY,
    created_at: conv.createdAt.toISOString(),
    metadata: conv.metadataJson ? JSON.parse(conv.metadataJson) : null,
  });

  try {
    const db = await getDB();

    // Cursor-based pagination mode
    if (cursor !== undefined) {
      const result = await findConversationsByProject(db, { projectId, cursor, limit });
      return jsonSuccess(c, {
        items: result.items.map(toApiConversation),
        next_cursor: result.next_cursor,
        has_more: result.has_more,
      });
    }

    // Legacy offset/limit mode
    const conversations = await findConversationsByProject(db, { projectId, limit, offset });

    return jsonSuccess(c, {
      conversations: conversations.map(toApiConversation),
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
    provider?: string | null;
    model?: string | null;
  } | null = null;

  try {
    body = await c.req.json();
  } catch {
    return jsonError(c, 'INVALID_JSON', 'Invalid JSON body', 400);
  }

  // Validate model against catalog if provided
  if (body?.model != null && !getModelInfo(body.model)) {
    return jsonError(c, 'INVALID_MODEL', `Unknown model: ${body.model}`, 400);
  }

  try {
    const db = await getDB();
    const conversation = await updateConversation(db, conversationId, {
      title: body?.title,
      positionX: body?.position_x,
      positionY: body?.position_y,
      metadata: body?.metadata,
      provider: body?.provider,
      model: body?.model,
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
      provider: conversation.provider ?? null,
      model: conversation.model ?? null,
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

// ═══════════════════════════════════════════════════════════════════════════
// Conversation Context Endpoints (V4)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /v1/conversations/:id/context - Get context config
 *
 * Returns the conversation's context configuration.
 * null response means using default (all project pins).
 */
conversationRoutes.get('/v1/conversations/:id/context', async (c) => {
  const conversationId = c.req.param('id');

  try {
    const db = await getDB();

    // Verify conversation exists
    const conversation = await findConversationById(db, conversationId);
    if (!conversation) {
      return jsonError(c, 'NOT_FOUND', `Conversation ${conversationId} not found`, 404);
    }

    // Get context config (null = using default, all pins)
    const context = await getConversationContext(db, conversationId);

    // Return null if no custom context configured (using default)
    return jsonSuccess(c, context);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'GET_CONTEXT_FAILED', message, 500);
  }
});

/**
 * PUT /v1/conversations/:id/context - Update context config
 *
 * Sets which pins to include in this conversation's context.
 * - null: use all project pins (default)
 * - []: no pins (fresh start)
 * - [...ids]: specific pins only
 */
conversationRoutes.put('/v1/conversations/:id/context', async (c) => {
  const conversationId = c.req.param('id');

  let body: { selected_pin_ids?: string[] | null } | null = null;

  try {
    body = await c.req.json();
  } catch {
    return jsonError(c, 'INVALID_JSON', 'Invalid JSON body', 400);
  }

  // Validate request body
  if (body === null || !('selected_pin_ids' in body)) {
    return jsonError(c, 'INVALID_REQUEST', 'selected_pin_ids is required', 400);
  }

  try {
    const db = await getDB();

    // Verify conversation exists
    const conversation = await findConversationById(db, conversationId);
    if (!conversation) {
      return jsonError(c, 'NOT_FOUND', `Conversation ${conversationId} not found`, 404);
    }

    // Set context config (upsert)
    const context = await setConversationContext(db, conversationId, body.selected_pin_ids ?? null);

    return jsonSuccess(c, context);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'SET_CONTEXT_FAILED', message, 500);
  }
});

/**
 * GET /v1/conversations/:id/memory - Get built memory string
 *
 * Returns the assembled context string for LLM consumption.
 * Includes text, token estimate, and sources.
 */
conversationRoutes.get('/v1/conversations/:id/memory', async (c) => {
  const conversationId = c.req.param('id');

  try {
    const db = await getDB();

    // 1. Verify conversation exists and get project_id
    const conversation = await findConversationById(db, conversationId);
    if (!conversation) {
      return jsonError(c, 'NOT_FOUND', `Conversation ${conversationId} not found`, 404);
    }

    // 2. Get context config (null = use all pins)
    const contextConfig = await getConversationContext(db, conversationId);

    // 3. Get project pins
    const projectPins = await findPinsByProject(db, conversation.projectId);

    // 4. Get current commit from branch HEAD (reuse existing branch system)
    let currentCommit;
    const currentBranch = await findCurrentBranch(db, conversation.projectId);
    if (currentBranch?.headCommitHash) {
      // Try V4 commit first, fallback gracefully if not found
      currentCommit = (await findCommitV4ByHash(db, currentBranch.headCommitHash)) ?? undefined;
    }

    // 5. Load pinned conversations data
    const conversationPins = projectPins.filter((p) => p.type === 'conversation');
    const conversations = new Map<string, ConversationData>();

    for (const pin of conversationPins) {
      // Skip if this is the current conversation (avoid circular reference)
      if (pin.ref_id === conversationId) continue;

      const conv = await findConversationById(db, pin.ref_id);
      if (!conv) continue;

      const turns = await findTurnsByConversation(db, pin.ref_id, { limit: 50 });
      conversations.set(pin.ref_id, {
        id: conv.conversationId,
        title: conv.title ?? 'Untitled',
        turns: turns.map((t) => ({
          role: t.role,
          content: t.content,
        })),
      });
    }

    // 6. Load pinned leaves data
    const leafPins = projectPins.filter((p) => p.type === 'leaf');
    const leafIds = leafPins.map((p) => p.ref_id);
    const leafRecords = leafIds.length > 0 ? await getLeavesByIds(db, leafIds) : [];
    const leaves = new Map(leafRecords.map((leaf) => [leaf.id, leaf]));

    // 7. Build context using Track A's buildConversationContext
    const builtContext = buildConversationContext({
      currentCommit,
      projectPins,
      contextConfig,
      conversations,
      leaves,
    });

    return jsonSuccess(c, builtContext);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'GET_MEMORY_FAILED', message, 500);
  }
});

/**
 * GET /v1/conversations/:id/context-export - Export context as file
 *
 * Exports the built context as a downloadable file (JSON or Markdown).
 *
 * Query params:
 * - format: 'json' (default) | 'markdown'
 *
 * Response headers:
 * - Content-Type: application/json or text/markdown
 * - Content-Disposition: attachment; filename="..."
 */
conversationRoutes.get('/v1/conversations/:id/context-export', async (c) => {
  const conversationId = c.req.param('id');
  const format = c.req.query('format') === 'markdown' ? 'markdown' : 'json';

  try {
    const db = await getDB();

    // 1. Verify conversation exists and get project_id
    const conversation = await findConversationById(db, conversationId);
    if (!conversation) {
      return jsonError(c, 'NOT_FOUND', `Conversation ${conversationId} not found`, 404);
    }

    // 2. Get context config (null = use all pins)
    const contextConfig = await getConversationContext(db, conversationId);

    // 3. Get project pins
    const projectPins = await findPinsByProject(db, conversation.projectId);

    // 4. Get current commit from branch HEAD
    let currentCommit;
    const currentBranch = await findCurrentBranch(db, conversation.projectId);
    if (currentBranch?.headCommitHash) {
      currentCommit = (await findCommitV4ByHash(db, currentBranch.headCommitHash)) ?? undefined;
    }

    // 5. Load pinned conversations data
    const conversationPins = projectPins.filter((p) => p.type === 'conversation');
    const conversations = new Map<string, ConversationData>();

    for (const pin of conversationPins) {
      if (pin.ref_id === conversationId) continue;

      const conv = await findConversationById(db, pin.ref_id);
      if (!conv) continue;

      const turns = await findTurnsByConversation(db, pin.ref_id, { limit: 50 });
      conversations.set(pin.ref_id, {
        id: conv.conversationId,
        title: conv.title ?? 'Untitled',
        turns: turns.map((t) => ({
          role: t.role,
          content: t.content,
        })),
      });
    }

    // 6. Load pinned leaves data
    const leafPins = projectPins.filter((p) => p.type === 'leaf');
    const leafIds = leafPins.map((p) => p.ref_id);
    const leafRecords = leafIds.length > 0 ? await getLeavesByIds(db, leafIds) : [];
    const leaves = new Map(leafRecords.map((leaf) => [leaf.id, leaf]));

    // 7. Build context
    const builtContext = buildConversationContext({
      currentCommit,
      projectPins,
      contextConfig,
      conversations,
      leaves,
    });

    // 8. Format for export
    const { content, contentType, fileExtension } = formatContextForExport(
      builtContext,
      conversationId,
      format
    );

    // 9. Return as downloadable file
    const filename = `${conversationId}-context.${fileExtension}`;

    return new Response(content, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'EXPORT_FAILED', message, 500);
  }
});
