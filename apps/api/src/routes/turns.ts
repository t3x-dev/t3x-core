/**
 * Turns Routes
 *
 * GET  /v1/turns - List turns (requires conversation_id query)
 * POST /v1/turns - Create turn
 * GET  /v1/turns/:hash - Get turn by hash
 * GET  /v1/turns/:hash/chain - Get turn chain (history)
 * GET  /v1/turns/:hash/context - Get turn with surrounding context (for source tracing)
 */

import type { ContentBlock } from '@t3x/core';
import { createRingExtractor, textFromBlocks } from '@t3x/core';
import {
  findConversationById,
  findTurnByHash,
  findTurnChain,
  findTurnsByConversation,
  insertTurn,
  type Turn,
} from '@t3x/storage/pglite';
import { Hono } from 'hono';
import { getDB } from '../lib/db';
import { getNLPProvider } from '../lib/nlp';
import { jsonError, jsonSuccess } from '../lib/response';

export const turnRoutes = new Hono();

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
    if (b.type === 'text' && typeof b.text !== 'string') return 'text block must have a text string';
    if ((b.type === 'image' || b.type === 'audio' || b.type === 'file') && typeof b.url !== 'string') {
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

/**
 * GET /v1/turns - List turns
 *
 * Supports cursor-based pagination: pass `cursor` query parameter
 * (empty string for first page) to receive `{ items, next_cursor, has_more }` response.
 * Omit `cursor` for legacy offset/limit mode.
 */
turnRoutes.get('/v1/turns', async (c) => {
  const conversationId = c.req.query('conversation_id');

  if (!conversationId) {
    return jsonError(c, 'INVALID_REQUEST', 'conversation_id query param is required', 400);
  }

  const limit = Math.min(Math.max(parseInt(c.req.query('limit') ?? '100', 10) || 100, 1), 1000);
  const offset = Math.max(parseInt(c.req.query('offset') ?? '0', 10) || 0, 0);
  const orderParam = c.req.query('order');
  const order = orderParam === 'desc' ? 'desc' : 'asc';
  const cursor = c.req.query('cursor');

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

  try {
    const db = await getDB();

    // Cursor-based pagination mode
    if (cursor !== undefined) {
      const result = await findTurnsByConversation(db, { conversationId, cursor, limit, order });
      return jsonSuccess(c, {
        items: result.items.map(toApiTurn),
        next_cursor: result.next_cursor,
        has_more: result.has_more,
      });
    }

    // Legacy offset/limit mode
    const turns = await findTurnsByConversation(db, { conversationId, limit, offset, order });

    return jsonSuccess(c, {
      turns: turns.map(toApiTurn),
      conversation_id: conversationId,
      limit,
      offset,
      order,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'LIST_FAILED', message, 500);
  }
});

/**
 * POST /v1/turns - Create turn
 */
turnRoutes.post('/v1/turns', async (c) => {
  let body: {
    project_id?: string;
    conversation_id?: string;
    role?: string;
    content?: string;
    language?: string;
    rings?: unknown;
    content_blocks?: ContentBlock[];
  } | null = null;

  try {
    body = await c.req.json();
  } catch {
    return jsonError(c, 'INVALID_JSON', 'Invalid JSON body', 400);
  }

  // Validate content_blocks if provided
  if (body?.content_blocks) {
    const blockError = validateContentBlocks(body.content_blocks);
    if (blockError) {
      return jsonError(c, 'INVALID_REQUEST', blockError, 400);
    }
  }

  // Auto-compute content from content_blocks when content is empty/missing
  if (body?.content_blocks?.length && !body.content) {
    body.content = textFromBlocks(body.content_blocks);
  }

  if (!body?.project_id || !body?.conversation_id || !body?.role || !body?.content) {
    return jsonError(
      c,
      'INVALID_REQUEST',
      'project_id, conversation_id, role, and content are required',
      400
    );
  }

  const validRoles = ['user', 'assistant', 'system', 'tool'];
  if (!validRoles.includes(body.role)) {
    return jsonError(c, 'INVALID_REQUEST', `role must be one of: ${validRoles.join(', ')}`, 400);
  }

  try {
    const db = await getDB();

    // Verify conversation exists
    const conversation = await findConversationById(db, body.conversation_id);
    if (!conversation) {
      return jsonError(c, 'NOT_FOUND', `Conversation ${body.conversation_id} not found`, 404);
    }

    // Verify project matches
    if (conversation.projectId !== body.project_id) {
      return jsonError(
        c,
        'INVALID_REQUEST',
        'conversation does not belong to the specified project',
        400
      );
    }

    // Extract rings if not provided — graceful fallback if NLP unavailable
    // Feature flag: DISABLE_RING_EXTRACTION=true skips ring extraction (ring retirement)
    const disableRings = process.env.DISABLE_RING_EXTRACTION === 'true';
    let rings = body.rings as Record<string, unknown> | undefined;
    if (!disableRings && !rings && body.content) {
      try {
        const nlpProvider = getNLPProvider();
        const extractor = createRingExtractor(nlpProvider);
        const ringOutput = await extractor.extract('temp', body.content, body.language);
        rings = {
          rings: {
            ring1: ringOutput.ring1,
            ring2: ringOutput.ring2,
            ring3: ringOutput.ring3,
          },
        };
      } catch (_nlpErr) {
        // NLP unavailable — save turn without ring data (graceful degradation)
      }
    }

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

    return jsonSuccess(c, apiTurn, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'CREATE_FAILED', message, 500);
  }
});

/**
 * GET /v1/turns/:hash - Get turn by hash
 */
turnRoutes.get('/v1/turns/:hash', async (c) => {
  const turnHash = decodeURIComponent(c.req.param('hash'));

  try {
    const db = await getDB();
    const turn = await findTurnByHash(db, turnHash);

    if (!turn) {
      return jsonError(c, 'NOT_FOUND', `Turn ${turnHash} not found`, 404);
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

    return jsonSuccess(c, apiTurn);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'GET_FAILED', message, 500);
  }
});

/**
 * GET /v1/turns/:hash/chain - Get turn chain (history)
 */
turnRoutes.get('/v1/turns/:hash/chain', async (c) => {
  const turnHash = decodeURIComponent(c.req.param('hash'));
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') ?? '50', 10) || 50, 1), 1000);

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

    return jsonSuccess(c, { chain: apiChain, end_turn_hash: turnHash });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'GET_FAILED', message, 500);
  }
});

/**
 * GET /v1/turns/:hash/context - Get turn with surrounding context
 *
 * Used for source tracing in merge UI - shows where a sentence came from
 * with surrounding conversation context.
 *
 * Query params:
 *   before - Number of turns before the target (default: 2)
 *   after - Number of turns after the target (default: 2)
 *   highlight_start - Start character position to highlight (optional)
 *   highlight_end - End character position to highlight (optional)
 */
turnRoutes.get('/v1/turns/:hash/context', async (c) => {
  const turnHash = decodeURIComponent(c.req.param('hash'));
  const before = parseInt(c.req.query('before') ?? '2', 10);
  const after = parseInt(c.req.query('after') ?? '2', 10);
  const highlightStart = c.req.query('highlight_start');
  const highlightEnd = c.req.query('highlight_end');

  try {
    const db = await getDB();

    // Get the target turn
    const targetTurn = await findTurnByHash(db, turnHash);
    if (!targetTurn) {
      return jsonError(c, 'NOT_FOUND', `Turn ${turnHash} not found`, 404);
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
      return jsonError(c, 'NOT_FOUND', 'Turn not found in conversation', 404);
    }

    // Extract context window
    const startIndex = Math.max(0, targetIndex - before);
    const endIndex = Math.min(allTurns.length - 1, targetIndex + after);
    const contextTurns = allTurns.slice(startIndex, endIndex + 1);

    // Convert to API format
    const toApiTurn = (t: Turn, isTarget: boolean) => ({
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

    return jsonSuccess(c, {
      target_turn: toApiTurn(targetTurn, true),
      context: contextTurns.map((t) => toApiTurn(t, t.turnHash === turnHash)),
      conversation_id: targetTurn.conversationId,
      conversation_title: conversation?.title ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'GET_FAILED', message, 500);
  }
});
