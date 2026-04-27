/**
 * Turns Routes
 *
 * GET  /v1/turns              - List turns (requires conversation_id query)
 * POST /v1/turns              - Create turn
 * GET  /v1/turns/:hash        - Get turn by hash
 * GET  /v1/turns/:hash/chain  - Get turn chain (history)
 * GET  /v1/turns/:hash/context - Get turn with surrounding context (for source tracing)
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { ContentBlock } from '@t3x-dev/core';
import { textFromBlocks } from '@t3x-dev/core';
import {
  findConversationById,
  findTurnByHash,
  findTurnChain,
  findTurnsByConversation,
  insertTurn,
  type Turn,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { ErrorResponseSchema, HashParamSchema, SuccessResponseSchema } from '../schemas/common';

export const turnRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });

// ============================================================
// Helpers
// ============================================================

const VALID_BLOCK_TYPES = new Set(['text', 'image', 'audio', 'file']);

/** Validate content_blocks array at runtime. Returns null if valid, error string if not. */
function validateContentBlocks(blocks: unknown): string | null {
  if (!Array.isArray(blocks)) return 'content_blocks must be an array';
  for (const block of blocks) {
    if (!block || typeof block !== 'object') return 'each content block must be an object';
    const b = block as Record<string, unknown>;
    if (!VALID_BLOCK_TYPES.has(b.type as string)) {
      return `invalid block type: ${String(b.type)}`;
    }
    if (b.type === 'text' && typeof b.text !== 'string')
      return 'text block must have a text string';
    if (
      (b.type === 'image' || b.type === 'audio' || b.type === 'file') &&
      typeof b.url !== 'string'
    ) {
      return `${b.type} block must have a url string`;
    }
    if (b.type === 'file' && typeof b.filename !== 'string') {
      return 'file block must have a filename string';
    }
    if (b.type === 'file' && typeof b.mime_type !== 'string') {
      return 'file block must have a mime_type string';
    }
  }
  return null;
}

const toApiTurn = (t: {
  turnHash: string;
  parentTurnHash: string | null;
  projectId: string;
  conversationId: string;
  role: string;
  content: string;
  language: string | null;
  ringsJson: string | null;
  contentBlocks: unknown[] | null;
  createdAt: Date;
}) => ({
  turn_hash: t.turnHash,
  parent_turn_hash: t.parentTurnHash,
  project_id: t.projectId,
  conversation_id: t.conversationId,
  role: t.role,
  content: t.content,
  language: t.language,
  rings: t.ringsJson ? JSON.parse(t.ringsJson) : null,
  content_blocks: (t.contentBlocks as ContentBlock[]) ?? null,
  created_at: t.createdAt.toISOString(),
});

// ============================================================
// Shared response schemas
// ============================================================

const TurnResponseSchema = z.object({
  turn_hash: z.string(),
  parent_turn_hash: z.string().nullable(),
  project_id: z.string(),
  conversation_id: z.string(),
  role: z.string(),
  content: z.string(),
  language: z.string().nullable(),
  rings: z.unknown().nullable(),
  content_blocks: z.unknown().nullable(),
  created_at: z.string(),
});

// ============================================================
// Route Definitions
// ============================================================

// GET /v1/turns - List turns
const listTurnsRoute = createRoute({
  method: 'get',
  path: '/v1/turns',
  tags: ['Turns'],
  summary: 'List turns',
  description:
    'Lists turns for a conversation. Supports cursor-based pagination via optional `cursor` query parameter, or legacy offset/limit mode.',
  request: {
    query: z.object({
      conversation_id: z.string().min(1),
      limit: z.coerce.number().int().min(1).max(1000).default(100).optional(),
      offset: z.coerce.number().int().min(0).default(0).optional(),
      order: z.enum(['asc', 'desc']).default('asc').optional(),
      cursor: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: 'Turns list (cursor or legacy mode)',
      content: { 'application/json': { schema: SuccessResponseSchema(z.unknown()) } },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// POST /v1/turns - Create turn
const createTurnRoute = createRoute({
  method: 'post',
  path: '/v1/turns',
  tags: ['Turns'],
  summary: 'Create turn',
  description: 'Creates a new turn in a conversation.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            project_id: z.string().min(1).optional(),
            conversation_id: z.string().min(1).optional(),
            role: z.string().optional(),
            content: z.string().optional(),
            language: z.string().optional(),
            rings: z.unknown().optional(),
            content_blocks: z.array(z.unknown()).optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Turn created',
      content: { 'application/json': { schema: SuccessResponseSchema(TurnResponseSchema) } },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
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

// GET /v1/turns/:hash - Get turn by hash
const getTurnRoute = createRoute({
  method: 'get',
  path: '/v1/turns/{hash}',
  tags: ['Turns'],
  summary: 'Get turn by hash',
  request: {
    params: HashParamSchema,
  },
  responses: {
    200: {
      description: 'Turn found',
      content: { 'application/json': { schema: SuccessResponseSchema(TurnResponseSchema) } },
    },
    404: {
      description: 'Turn not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// GET /v1/turns/:hash/chain - Get turn chain
const getTurnChainRoute = createRoute({
  method: 'get',
  path: '/v1/turns/{hash}/chain',
  tags: ['Turns'],
  summary: 'Get turn chain',
  description: 'Returns the chain of turns leading up to (and including) the specified turn.',
  request: {
    params: HashParamSchema,
    query: z.object({
      limit: z.coerce.number().int().min(1).max(1000).default(50).optional(),
    }),
  },
  responses: {
    200: {
      description: 'Turn chain',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.object({
              chain: z.array(TurnResponseSchema),
              end_turn_hash: z.string(),
            })
          ),
        },
      },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// GET /v1/turns/:hash/context - Get turn with surrounding context
const getTurnContextRoute = createRoute({
  method: 'get',
  path: '/v1/turns/{hash}/context',
  tags: ['Turns'],
  summary: 'Get turn context',
  description:
    'Returns the target turn with surrounding conversation context. Used for source tracing in merge UI.',
  request: {
    params: HashParamSchema,
    query: z.object({
      before: z.coerce.number().int().min(0).default(2).optional(),
      after: z.coerce.number().int().min(0).default(2).optional(),
      highlight_start: z.string().optional(),
      highlight_end: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: 'Turn with context',
      content: { 'application/json': { schema: SuccessResponseSchema(z.unknown()) } },
    },
    404: {
      description: 'Turn not found',
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

/**
 * GET /v1/turns - List turns
 *
 * Supports cursor-based pagination: pass `cursor` query parameter
 * (empty string for first page) to receive `{ items, next_cursor, has_more }` response.
 * Omit `cursor` for legacy offset/limit mode.
 */
turnRoutes.openapi(listTurnsRoute, async (c) => {
  const {
    conversation_id: conversationId,
    limit: rawLimit,
    offset: rawOffset,
    order: rawOrder,
    cursor,
  } = c.req.valid('query');

  const limit = Math.min(Math.max(rawLimit ?? 100, 1), 1000);
  const offset = Math.max(rawOffset ?? 0, 0);
  const order = rawOrder === 'desc' ? 'desc' : 'asc';

  try {
    const db = await getDB();

    // Cursor-based pagination mode
    if (cursor !== undefined) {
      const result = await findTurnsByConversation(db, { conversationId, cursor, limit, order });
      return c.json(
        {
          success: true as const,
          data: {
            items: result.items.map(toApiTurn),
            next_cursor: result.next_cursor,
            has_more: result.has_more,
          },
        },
        200
      );
    }

    // Legacy offset/limit mode
    const turns = await findTurnsByConversation(db, { conversationId, limit, offset, order });

    return c.json(
      {
        success: true as const,
        data: {
          turns: turns.map(toApiTurn),
          conversation_id: conversationId,
          limit,
          offset,
          order,
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
 * POST /v1/turns - Create turn
 */
turnRoutes.openapi(createTurnRoute, async (c) => {
  type TurnBody = {
    project_id?: string;
    conversation_id?: string;
    role?: string;
    content?: string;
    language?: string;
    rings?: unknown;
    content_blocks?: ContentBlock[];
  };
  let body: TurnBody | null = null;

  try {
    body = c.req.valid('json') as TurnBody;
  } catch {
    return c.json(
      { success: false as const, error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } },
      400
    );
  }

  // Validate content_blocks if provided
  if (body?.content_blocks) {
    const blockError = validateContentBlocks(body.content_blocks);
    if (blockError) {
      return errorResponse(c, 'INVALID_REQUEST', blockError);
    }
  }

  // Auto-compute content from content_blocks when content is empty/missing
  if (body?.content_blocks?.length && !body.content) {
    body.content = textFromBlocks(body.content_blocks);
  }

  if (!body?.project_id || !body?.conversation_id || !body?.role || !body?.content) {
    return errorResponse(
      c,
      'INVALID_REQUEST',
      'project_id, conversation_id, role, and content are required'
    );
  }

  const validRoles = ['user', 'assistant', 'system', 'tool'];
  if (!validRoles.includes(body.role)) {
    return errorResponse(c, 'INVALID_REQUEST', `role must be one of: ${validRoles.join(', ')}`);
  }

  try {
    const db = await getDB();

    // Verify conversation exists
    const conversation = await findConversationById(db, body.conversation_id);
    if (!conversation) {
      return errorResponse(c, 'NOT_FOUND', `Conversation ${body.conversation_id} not found`);
    }

    // Verify project matches
    if (conversation.projectId !== body.project_id) {
      return errorResponse(
        c,
        'INVALID_REQUEST',
        'conversation does not belong to the specified project'
      );
    }
    if (conversation.committedAs) {
      return errorResponse(
        c,
        'ALREADY_COMMITTED',
        `Conversation ${body.conversation_id} has already been committed`
      );
    }

    // Ring extraction has been retired — pass through any rings provided by the client
    const rings = body.rings as Record<string, unknown> | undefined;

    const turn = await insertTurn(db, {
      projectId: body.project_id,
      conversationId: body.conversation_id,
      role: body.role as 'user' | 'assistant' | 'system' | 'tool',
      content: body.content,
      language: body.language,
      rings,
      content_blocks: body.content_blocks,
    });

    const apiTurn = {
      turn_hash: turn.turnHash,
      parent_turn_hash: turn.parentTurnHash,
      project_id: turn.projectId,
      conversation_id: turn.conversationId,
      role: turn.role,
      content: turn.content,
      language: turn.language,
      rings: turn.ringsJson ? JSON.parse(turn.ringsJson) : null,
      content_blocks: (turn.contentBlocks as ContentBlock[]) ?? null,
      created_at: turn.createdAt.toISOString(),
    };

    return c.json({ success: true as const, data: apiTurn }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'CREATE_FAILED', message);
  }
});

/**
 * GET /v1/turns/:hash - Get turn by hash
 */
turnRoutes.openapi(getTurnRoute, async (c) => {
  const turnHash = decodeURIComponent(c.req.valid('param').hash);

  try {
    const db = await getDB();
    const turn = await findTurnByHash(db, turnHash);

    if (!turn) {
      return errorResponse(c, 'NOT_FOUND', `Turn ${turnHash} not found`);
    }

    const apiTurn = {
      turn_hash: turn.turnHash,
      parent_turn_hash: turn.parentTurnHash,
      project_id: turn.projectId,
      conversation_id: turn.conversationId,
      role: turn.role,
      content: turn.content,
      language: turn.language,
      rings: turn.ringsJson ? JSON.parse(turn.ringsJson) : null,
      content_blocks: (turn.contentBlocks as ContentBlock[]) ?? null,
      created_at: turn.createdAt.toISOString(),
    };

    return c.json({ success: true as const, data: apiTurn }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'GET_FAILED', message);
  }
});

/**
 * GET /v1/turns/:hash/chain - Get turn chain (history)
 */
turnRoutes.openapi(getTurnChainRoute, async (c) => {
  const turnHash = decodeURIComponent(c.req.valid('param').hash);
  const { limit: rawLimit } = c.req.valid('query');
  const limit = Math.min(Math.max(rawLimit ?? 50, 1), 1000);

  try {
    const db = await getDB();
    const chain = await findTurnChain(db, turnHash, limit);

    const apiChain = chain.map((t) => ({
      turn_hash: t.turnHash,
      parent_turn_hash: t.parentTurnHash,
      project_id: t.projectId,
      conversation_id: t.conversationId,
      role: t.role,
      content: t.content,
      language: t.language,
      rings: t.ringsJson ? JSON.parse(t.ringsJson) : null,
      content_blocks: (t.contentBlocks as ContentBlock[]) ?? null,
      created_at: t.createdAt.toISOString(),
    }));

    return c.json(
      { success: true as const, data: { chain: apiChain, end_turn_hash: turnHash } },
      200
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'GET_FAILED', message);
  }
});

/**
 * GET /v1/turns/:hash/context - Get turn with surrounding context
 *
 * Used for source tracing in merge UI - shows where a node came from
 * with surrounding conversation context.
 *
 * Query params:
 *   before - Number of turns before the target (default: 2)
 *   after - Number of turns after the target (default: 2)
 *   highlight_start - Start character position to highlight (optional)
 *   highlight_end - End character position to highlight (optional)
 */
turnRoutes.openapi(getTurnContextRoute, async (c) => {
  const turnHash = decodeURIComponent(c.req.valid('param').hash);
  const {
    before: rawBefore,
    after: rawAfter,
    highlight_start: highlightStart,
    highlight_end: highlightEnd,
  } = c.req.valid('query');
  const before = rawBefore ?? 2;
  const after = rawAfter ?? 2;

  try {
    const db = await getDB();

    // Get the target turn
    const targetTurn = await findTurnByHash(db, turnHash);
    if (!targetTurn) {
      return errorResponse(c, 'NOT_FOUND', `Turn ${turnHash} not found`);
    }

    // Get conversation info
    const conversation = await findConversationById(db, targetTurn.conversationId);

    // Get all turns in this conversation
    const allTurns = await findTurnsByConversation(db, {
      conversationId: targetTurn.conversationId,
      limit: 1000,
      order: 'asc',
    });

    // Find target turn index
    const targetIndex = allTurns.findIndex((t) => t.turnHash === turnHash);
    if (targetIndex === -1) {
      return errorResponse(c, 'NOT_FOUND', 'Turn not found in conversation');
    }

    // Extract context window
    const startIndex = Math.max(0, targetIndex - before);
    const endIndex = Math.min(allTurns.length - 1, targetIndex + after);
    const contextTurns = allTurns.slice(startIndex, endIndex + 1);

    // Convert to API format
    const toApiTurnWithContext = (t: Turn, isTarget: boolean) => ({
      turn_hash: t.turnHash,
      parent_turn_hash: t.parentTurnHash,
      project_id: t.projectId,
      conversation_id: t.conversationId,
      role: t.role,
      content: t.content,
      language: t.language,
      rings: t.ringsJson ? JSON.parse(t.ringsJson) : null,
      content_blocks: (t.contentBlocks as ContentBlock[]) ?? null,
      created_at: t.createdAt.toISOString(),
      is_target: isTarget,
      highlight:
        isTarget && highlightStart && highlightEnd
          ? { start: parseInt(highlightStart, 10), end: parseInt(highlightEnd, 10) }
          : undefined,
    });

    return c.json(
      {
        success: true as const,
        data: {
          target_turn: toApiTurnWithContext(targetTurn, true),
          context: contextTurns.map((t) => toApiTurnWithContext(t, t.turnHash === turnHash)),
          conversation_id: targetTurn.conversationId,
          conversation_title: conversation?.title ?? null,
        },
      },
      200
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'GET_FAILED', message);
  }
});
