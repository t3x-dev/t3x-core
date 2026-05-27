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
 * GET    /v1/conversations/:id/context-manifest - Get structured context manifest
 * GET    /v1/conversations/:id/memory - Get built memory string (requires Track A)
 * GET    /v1/conversations/:id/context-export - Export context as JSON/Markdown file
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { type BuiltContext, getCanonicalModelId } from '@t3x-dev/core';
import {
  deleteConversation,
  findConversationById,
  findConversationsByProject,
  findProjectById,
  getConversationContext,
  getConversationTurnCount,
  insertConversation,
  renameConversation,
  setConversationContext,
  updateConversation,
} from '@t3x-dev/storage';
import { formatContextForExport } from '../lib/context-formatter';
import { buildConversationContextManifest } from '../lib/context-manifest';
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
  alias: z.string().nullable(),
  parent_commit_hash: z.string().nullable(),
  committed_as: z.string().nullable(),
  committed_at: z.string().nullable(),
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

const ContextManifestBaselineSchema = z.object({
  commit_hash: z.string().nullable(),
  branch: z.string().nullable(),
  message: z.string().nullable(),
  content: z.unknown().nullable(),
  source: z.enum(['parent_commit', 'none']),
  source_conversation_id: z.string().nullable(),
  node_count: z.number(),
  relation_count: z.number(),
});

const ContextManifestReferenceSchema = z.object({
  type: z.enum(['conversation', 'leaf', 'import']),
  id: z.string(),
  pin_id: z.string(),
  included: z.boolean(),
  title: z.string().optional(),
});

const ContextManifestFeedbackSchema = z.object({
  type: z.enum(['leaf_assertion', 'runner_assertion']),
  id: z.string(),
  parent_ref_id: z.string(),
  pin_id: z.string(),
  selected: z.boolean(),
  included: z.boolean(),
  passed: z.boolean().optional(),
  details: z.string().optional(),
  lesson: z.string().optional(),
});

const ContextManifestSourceItemSchema = z.object({
  id: z.string(),
  kind: z.enum([
    'baseline',
    'conversation',
    'leaf',
    'commit',
    'import',
    'file',
    'web',
    'result',
    'lesson',
  ]),
  role: z.enum(['baseline', 'evidence', 'guidance', 'provenance']),
  title: z.string(),
  pinned: z.boolean(),
  pinnable: z.boolean(),
  included: z.boolean(),
  readonly: z.boolean().optional(),
  pin_id: z.string().optional(),
  parent_source_id: z.string().optional(),
  token_estimate: z.number().optional(),
  metadata: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .optional(),
});

const ContextSourceSchema = z.object({
  type: z.enum(['commit', 'conversation', 'leaf', 'import']),
  id: z.string(),
  title: z.string().optional(),
});

const ConversationContextManifestSchema = z.object({
  conversation_id: z.string(),
  project_id: z.string(),
  baseline: ContextManifestBaselineSchema,
  references: z.array(ContextManifestReferenceSchema),
  feedback: z.array(ContextManifestFeedbackSchema),
  source_items: z.array(ContextManifestSourceItemSchema),
  chat_context_text: z.string(),
  extraction_context_text: z.string(),
  token_estimate: z.number(),
  sources: z.array(ContextSourceSchema),
});

// ─── Helper ───────────────────────────────────────────────────────────────────

const toApiConversation = (conv: {
  conversationId: string;
  projectId: string;
  title: string | null;
  alias: string | null;
  parentCommitHash: string | null;
  committedAs: string | null;
  committedAt: Date | null;
  positionX: number | null;
  positionY: number | null;
  createdAt: Date;
  metadataJson: string | null;
}) => ({
  conversation_id: conv.conversationId,
  project_id: conv.projectId,
  title: conv.title,
  alias: conv.alias,
  parent_commit_hash: conv.parentCommitHash,
  committed_as: conv.committedAs,
  committed_at: conv.committedAt?.toISOString() ?? null,
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
      alias: conversation.alias,
      parent_commit_hash: conversation.parentCommitHash,
      committed_as: conversation.committedAs,
      committed_at: conversation.committedAt?.toISOString() ?? null,
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
      alias: conversation.alias,
      parent_commit_hash: conversation.parentCommitHash,
      committed_as: conversation.committedAs,
      committed_at: conversation.committedAt?.toISOString() ?? null,
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
  const canonicalModel = body.model == null ? body.model : getCanonicalModelId(body.model);

  // Validate model against catalog if provided
  if (body.model != null && !canonicalModel) {
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
      model: canonicalModel,
    });

    if (!conversation) {
      return errorResponse(c, 'NOT_FOUND', `Conversation ${conversationId} not found`);
    }

    const apiConversation = {
      conversation_id: conversation.conversationId,
      project_id: conversation.projectId,
      title: conversation.title,
      alias: conversation.alias,
      parent_commit_hash: conversation.parentCommitHash,
      committed_as: conversation.committedAs,
      committed_at: conversation.committedAt?.toISOString() ?? null,
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
 * - no context row: no project pins
 * - null: use all project pins
 * - []: no pins
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
 * GET /v1/conversations/:id/context-manifest - Get structured context manifest
 *
 * Returns the conversation's fully assembled context manifest, including the
 * parent baseline, references, selected feedback, chat text, extraction text,
 * token estimate, and sources.
 */
const getContextManifestRoute = createRoute({
  method: 'get',
  path: '/v1/conversations/{id}/context-manifest',
  tags: ['Conversations'],
  summary: 'Get structured conversation context manifest',
  request: {
    params: IdParamSchema,
  },
  responses: {
    200: {
      description: 'Structured context manifest',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(ConversationContextManifestSchema),
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

conversationRoutes.openapi(getContextManifestRoute, async (c) => {
  const { id: conversationId } = c.req.valid('param');

  try {
    const db = await getDB();
    const conversation = await findConversationById(db, conversationId);
    if (!conversation) {
      return errorResponse(c, 'NOT_FOUND', `Conversation ${conversationId} not found`);
    }

    const manifest = await buildConversationContextManifest(db, conversationId);
    return c.json({ success: true as const, data: manifest }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json(
      {
        success: false as const,
        error: { code: 'GET_CONTEXT_MANIFEST_FAILED', message },
      },
      500
    );
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
    const conversation = await findConversationById(db, conversationId);
    if (!conversation) {
      return errorResponse(c, 'NOT_FOUND', `Conversation ${conversationId} not found`);
    }

    const manifest = await buildConversationContextManifest(db, conversationId);

    return c.json(
      {
        success: true as const,
        data: {
          text: manifest.chat_context_text,
          token_estimate: manifest.token_estimate,
          sources: manifest.sources,
        },
      },
      200
    );
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

    // 1. Verify conversation exists.
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

    // 2. Build export context from the same manifest-backed context as /memory.
    const manifest = await buildConversationContextManifest(db, conversationId);
    const builtContext: BuiltContext = {
      text: manifest.chat_context_text,
      token_estimate: manifest.token_estimate,
      sources: manifest.sources,
    };

    // 3. Format for export
    const { content, contentType, fileExtension } = formatContextForExport(
      builtContext,
      conversationId,
      format
    );

    // 4. Return as downloadable file
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

// ============================================================
// PATCH /v1/conversations/:conversation_id/rename
// ============================================================

const RenameRequestSchema = z.object({
  alias: z.string().min(1).max(64),
});

const renameRoute = createRoute({
  method: 'patch',
  path: '/v1/conversations/{conversation_id}/rename',
  tags: ['Conversations'],
  summary: 'Rename a conversation (set or replace its alias)',
  description:
    'Sets the alias of a conversation. Aliases must match ^[a-z][a-z0-9_]{0,63}$ ' +
    'and are unique within a project. Emits a conversation.renamed event.',
  request: {
    params: z.object({ conversation_id: z.string() }),
    body: { content: { 'application/json': { schema: RenameRequestSchema } } },
  },
  responses: {
    200: {
      description: 'Conversation renamed',
      content: { 'application/json': { schema: SuccessResponseSchema(ConversationSchema) } },
    },
    400: {
      description: 'Invalid alias format',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Conversation not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Alias already taken in this project',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

conversationRoutes.openapi(renameRoute, async (c) => {
  const { conversation_id } = c.req.valid('param');
  const { alias } = c.req.valid('json');

  const db = await getDB();
  const existing = await findConversationById(db, conversation_id);
  if (!existing) {
    return errorResponse(c, 'CONVERSATION_NOT_FOUND', `Conversation not found: ${conversation_id}`);
  }

  try {
    await renameConversation(db, conversation_id, alias);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('Invalid alias format')) {
      return errorResponse(c, 'INVALID_REQUEST', message);
    }
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505') {
      return c.json(
        {
          success: false as const,
          error: {
            code: 'ALIAS_TAKEN',
            message: `Alias '${alias}' is already taken in this project`,
          },
        },
        409
      );
    }
    return errorResponse(c, 'INTERNAL_ERROR', message);
  }

  const updated = await findConversationById(db, conversation_id);
  if (!updated) {
    return errorResponse(c, 'INTERNAL_ERROR', 'Conversation disappeared during rename');
  }

  return c.json({ success: true as const, data: toApiConversation(updated) }, 200);
});
