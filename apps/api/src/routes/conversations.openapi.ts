/**
 * Conversations Routes (OpenAPI)
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

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  buildConversationContext,
  type ConversationData,
  getModelInfo,
  type SentenceCommit,
} from '@t3x-dev/core';
import {
  deleteConversation,
  findConversationById,
  findConversationsByProject,
  findCurrentBranch,
  findPinsByProject,
  findProjectById,
  findTurnsByConversation,
  getCommitUnified,
  getConversationContext,
  getConversationTurnCount,
  getLeavesByIds,
  insertConversation,
  setConversationContext,
  updateConversation,
} from '@t3x-dev/storage';
import { formatContextForExport } from '../lib/context-formatter';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import {
  CursorPageResponseSchema,
  ErrorResponseSchema,
  IdParamSchema,
  SuccessResponseSchema,
} from '../schemas/common';

export const conversationRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });

// Handle JSON parse errors (invalid JSON body)
conversationRoutes.onError((err, c) => {
  const message = err.message || '';
  if (
    err instanceof SyntaxError ||
    message.includes('JSON') ||
    message.includes('Unexpected token') ||
    message.includes('not valid JSON')
  ) {
    return c.json(
      { success: false as const, error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } },
      400
    );
  }
  return c.json(
    {
      success: false as const,
      error: { code: 'INTERNAL_ERROR', message: message || 'Internal server error' },
    },
    500
  );
});

// ─── Shared schemas ──────────────────────────────────────────────────────────

const ConversationSchema = z.object({
  conversation_id: z.string(),
  project_id: z.string(),
  title: z.string().nullable(),
  parent_commit_hash: z.string().nullable(),
  position_x: z.number().nullable(),
  position_y: z.number().nullable(),
  created_at: z.string(),
  metadata: z.record(z.string(), z.any()).nullable(),
});

const ConversationWithTurnsSchema = ConversationSchema.extend({
  turns_count: z.number(),
});

const ConversationWithModelSchema = ConversationSchema.extend({
  provider: z.string().nullable(),
  model: z.string().nullable(),
});

const ListConversationsQuerySchema = z.object({
  project_id: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(1000).default(100).optional(),
  offset: z.coerce.number().int().min(0).default(0).optional(),
  cursor: z.string().optional(),
});

const CreateConversationSchema = z.object({
  project_id: z.string().min(1),
  title: z.string().optional(),
  parent_commit_hash: z.string().optional(),
  position_x: z.number().optional(),
  position_y: z.number().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

const UpdateConversationSchema = z.object({
  title: z.string().optional(),
  position_x: z.number().optional(),
  position_y: z.number().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  provider: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
});

const UpdateContextSchema = z.object({
  selected_pin_ids: z.array(z.string()).nullable(),
});

// ─── Helper ───────────────────────────────────────────────────────────────────

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

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /v1/conversations - List conversations
 *
 * Supports cursor-based pagination: pass `cursor` query parameter
 * (empty string for first page) to receive `{ items, next_cursor, has_more }` response.
 * Omit `cursor` for legacy offset/limit mode.
 */
const listConversationsRoute = createRoute({
  method: 'get',
  path: '/v1/conversations',
  tags: ['Conversations'],
  summary: 'List conversations for a project',
  request: {
    query: ListConversationsQuerySchema,
  },
  responses: {
    200: {
      description: 'List of conversations (cursor or offset mode)',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.union([
              CursorPageResponseSchema(ConversationSchema),
              z.object({
                conversations: z.array(ConversationSchema),
                project_id: z.string(),
                limit: z.number(),
                offset: z.number(),
              }),
            ])
          ),
        },
      },
    },
    400: {
      description: 'Validation error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

conversationRoutes.openapi(listConversationsRoute, async (c) => {
  const { project_id: projectId, cursor } = c.req.valid('query');
  const limit = Math.min(Math.max(c.req.valid('query').limit ?? 100, 1), 1000);
  const offset = Math.max(c.req.valid('query').offset ?? 0, 0);

  try {
    const db = await getDB();

    // Cursor-based pagination mode
    if (cursor !== undefined) {
      const result = await findConversationsByProject(db, { projectId, cursor, limit });
      return c.json(
        {
          success: true as const,
          data: {
            items: result.items.map(toApiConversation),
            next_cursor: result.next_cursor,
            has_more: result.has_more,
          },
        },
        200
      );
    }

    // Legacy offset/limit mode
    const convs = await findConversationsByProject(db, { projectId, limit, offset });
    return c.json(
      {
        success: true as const,
        data: {
          conversations: convs.map(toApiConversation),
          project_id: projectId,
          limit,
          offset,
        },
      },
      200
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'LIST_FAILED', message);
  }
});

/**
 * POST /v1/conversations - Create conversation
 */
const createConversationRoute = createRoute({
  method: 'post',
  path: '/v1/conversations',
  tags: ['Conversations'],
  summary: 'Create a new conversation',
  request: {
    body: {
      content: { 'application/json': { schema: CreateConversationSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      description: 'Conversation created',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(ConversationSchema),
        },
      },
    },
    400: {
      description: 'Validation error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Project not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

conversationRoutes.openapi(createConversationRoute, async (c) => {
  const body = c.req.valid('json');

  try {
    const db = await getDB();

    // Verify project exists
    const project = await findProjectById(db, body.project_id);
    if (!project) {
      return errorResponse(c, 'NOT_FOUND', `Project ${body.project_id} not found`);
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

    return c.json({ success: true as const, data: apiConversation }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'CREATE_FAILED', message);
  }
});

/**
 * GET /v1/conversations/:id - Get conversation with turn count
 */
const getConversationRoute = createRoute({
  method: 'get',
  path: '/v1/conversations/{id}',
  tags: ['Conversations'],
  summary: 'Get a conversation with turn count',
  request: {
    params: IdParamSchema,
  },
  responses: {
    200: {
      description: 'Conversation with turn count',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(ConversationWithTurnsSchema),
        },
      },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

conversationRoutes.openapi(getConversationRoute, async (c) => {
  const { id: conversationId } = c.req.valid('param');

  try {
    const db = await getDB();
    const conversation = await findConversationById(db, conversationId);

    if (!conversation) {
      return errorResponse(c, 'NOT_FOUND', `Conversation ${conversationId} not found`);
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

    return c.json({ success: true as const, data: apiConversation }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'GET_FAILED', message);
  }
});

/**
 * PUT /v1/conversations/:id - Update conversation
 */
const updateConversationRoute = createRoute({
  method: 'put',
  path: '/v1/conversations/{id}',
  tags: ['Conversations'],
  summary: 'Update a conversation',
  request: {
    params: IdParamSchema,
    body: {
      content: { 'application/json': { schema: UpdateConversationSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'Updated conversation',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(ConversationWithModelSchema),
        },
      },
    },
    400: {
      description: 'Validation error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

conversationRoutes.openapi(updateConversationRoute, async (c) => {
  const { id: conversationId } = c.req.valid('param');
  const body = c.req.valid('json');

  // Validate model against catalog if provided
  if (body.model != null && !getModelInfo(body.model)) {
    return c.json(
      {
        success: false as const,
        error: { code: 'INVALID_MODEL', message: `Unknown model: ${body.model}` },
      },
      400
    );
  }

  try {
    const db = await getDB();
    const conversation = await updateConversation(db, conversationId, {
      title: body.title,
      positionX: body.position_x,
      positionY: body.position_y,
      metadata: body.metadata,
      provider: body.provider,
      model: body.model,
    });

    if (!conversation) {
      return errorResponse(c, 'NOT_FOUND', `Conversation ${conversationId} not found`);
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

    return c.json({ success: true as const, data: apiConversation }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'UPDATE_FAILED', message);
  }
});

/**
 * DELETE /v1/conversations/:id - Delete conversation
 */
const deleteConversationRoute = createRoute({
  method: 'delete',
  path: '/v1/conversations/{id}',
  tags: ['Conversations'],
  summary: 'Delete a conversation',
  request: {
    params: IdParamSchema,
  },
  responses: {
    200: {
      description: 'Deleted successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.object({ deleted: z.literal(true), conversation_id: z.string() })
          ),
        },
      },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

conversationRoutes.openapi(deleteConversationRoute, async (c) => {
  const { id: conversationId } = c.req.valid('param');

  try {
    const db = await getDB();
    const deleted = await deleteConversation(db, conversationId);

    if (!deleted) {
      return errorResponse(c, 'NOT_FOUND', `Conversation ${conversationId} not found`);
    }

    return c.json(
      { success: true as const, data: { deleted: true as const, conversation_id: conversationId } },
      200
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'DELETE_FAILED', message);
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
const getContextRoute = createRoute({
  method: 'get',
  path: '/v1/conversations/{id}/context',
  tags: ['Conversations'],
  summary: 'Get conversation context config',
  request: {
    params: IdParamSchema,
  },
  responses: {
    200: {
      description: 'Context config (null = using default)',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.unknown()),
        },
      },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

conversationRoutes.openapi(getContextRoute, async (c) => {
  const { id: conversationId } = c.req.valid('param');

  try {
    const db = await getDB();

    // Verify conversation exists
    const conversation = await findConversationById(db, conversationId);
    if (!conversation) {
      return errorResponse(c, 'NOT_FOUND', `Conversation ${conversationId} not found`);
    }

    // Get context config (null = using default, all pins)
    const context = await getConversationContext(db, conversationId);

    // Return null if no custom context configured (using default)
    return c.json({ success: true as const, data: context }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ success: false as const, error: { code: 'GET_CONTEXT_FAILED', message } }, 500);
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
const updateContextRoute = createRoute({
  method: 'put',
  path: '/v1/conversations/{id}/context',
  tags: ['Conversations'],
  summary: 'Update conversation context config',
  request: {
    params: IdParamSchema,
    body: {
      content: { 'application/json': { schema: UpdateContextSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'Updated context config',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.unknown()),
        },
      },
    },
    400: {
      description: 'Validation error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

conversationRoutes.openapi(updateContextRoute, async (c) => {
  const { id: conversationId } = c.req.valid('param');
  const body = c.req.valid('json');

  try {
    const db = await getDB();

    // Verify conversation exists
    const conversation = await findConversationById(db, conversationId);
    if (!conversation) {
      return errorResponse(c, 'NOT_FOUND', `Conversation ${conversationId} not found`);
    }

    // Set context config (upsert)
    const context = await setConversationContext(db, conversationId, body.selected_pin_ids ?? null);

    return c.json({ success: true as const, data: context }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ success: false as const, error: { code: 'SET_CONTEXT_FAILED', message } }, 500);
  }
});

/**
 * GET /v1/conversations/:id/memory - Get built memory string
 *
 * Returns the assembled context string for LLM consumption.
 * Includes text, token estimate, and sources.
 */
const getMemoryRoute = createRoute({
  method: 'get',
  path: '/v1/conversations/{id}/memory',
  tags: ['Conversations'],
  summary: 'Get built memory / context string for LLM consumption',
  request: {
    params: IdParamSchema,
  },
  responses: {
    200: {
      description: 'Built context object',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.unknown()),
        },
      },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

conversationRoutes.openapi(getMemoryRoute, async (c) => {
  const { id: conversationId } = c.req.valid('param');

  try {
    const db = await getDB();

    // 1. Verify conversation exists and get project_id
    const conversation = await findConversationById(db, conversationId);
    if (!conversation) {
      return errorResponse(c, 'NOT_FOUND', `Conversation ${conversationId} not found`);
    }

    // 2. Get context config (null = use all pins)
    const contextConfig = await getConversationContext(db, conversationId);

    // 3. Get project pins
    const projectPins = await findPinsByProject(db, conversation.projectId);

    // 4. Get current commit from branch HEAD (reuse existing branch system)
    let currentCommit: SentenceCommit | undefined;
    const currentBranch = await findCurrentBranch(db, conversation.projectId);
    if (currentBranch?.headCommitHash) {
      const unified = await getCommitUnified(db, currentBranch.headCommitHash);
      if (unified) {
        // Convert unified Commit to V4-compatible shape for buildConversationContext
        currentCommit = {
          ...unified,
          schema: 't3x/commit/v4' as const,
          content: {
            sentences: unified.content.frames.map((frame) => ({
              id: frame.id,
              text: `[${frame.type}] ${Object.entries(frame.slots)
                .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : String(v)}`)
                .join('; ')}`,
              confidence: 1,
            })),
          },
        } as SentenceCommit;
      }
    }

    // 5. Load pinned conversations data
    const conversationPins = projectPins.filter((p) => p.type === 'conversation');
    const conversationsMap = new Map<string, ConversationData>();

    for (const pin of conversationPins) {
      // Skip if this is the current conversation (avoid circular reference)
      if (pin.ref_id === conversationId) continue;

      const conv = await findConversationById(db, pin.ref_id);
      if (!conv) continue;

      const turns = await findTurnsByConversation(db, { conversationId: pin.ref_id, limit: 50 });
      conversationsMap.set(pin.ref_id, {
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
      conversations: conversationsMap,
      leaves,
    });

    return c.json({ success: true as const, data: builtContext }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ success: false as const, error: { code: 'GET_MEMORY_FAILED', message } }, 500);
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
      return c.json(
        {
          success: false as const,
          error: { code: 'NOT_FOUND', message: `Conversation ${conversationId} not found` },
        },
        404
      );
    }

    // 2. Get context config (null = use all pins)
    const contextConfig = await getConversationContext(db, conversationId);

    // 3. Get project pins
    const projectPins = await findPinsByProject(db, conversation.projectId);

    // 4. Get current commit from branch HEAD
    let currentCommit: SentenceCommit | undefined;
    const currentBranch = await findCurrentBranch(db, conversation.projectId);
    if (currentBranch?.headCommitHash) {
      const unified = await getCommitUnified(db, currentBranch.headCommitHash);
      if (unified) {
        // Convert unified Commit to V4-compatible shape for buildConversationContext
        currentCommit = {
          ...unified,
          schema: 't3x/commit/v4' as const,
          content: {
            sentences: unified.content.frames.map((frame) => ({
              id: frame.id,
              text: `[${frame.type}] ${Object.entries(frame.slots)
                .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : String(v)}`)
                .join('; ')}`,
              confidence: 1,
            })),
          },
        } as SentenceCommit;
      }
    }

    // 5. Load pinned conversations data
    const conversationPins = projectPins.filter((p) => p.type === 'conversation');
    const conversationsMap = new Map<string, ConversationData>();

    for (const pin of conversationPins) {
      if (pin.ref_id === conversationId) continue;

      const conv = await findConversationById(db, pin.ref_id);
      if (!conv) continue;

      const turns = await findTurnsByConversation(db, { conversationId: pin.ref_id, limit: 50 });
      conversationsMap.set(pin.ref_id, {
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
      conversations: conversationsMap,
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
    return c.json({ success: false as const, error: { code: 'EXPORT_FAILED', message } }, 500);
  }
});
