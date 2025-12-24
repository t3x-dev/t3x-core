/**
 * Turns API Routes
 *
 * GET  /api/v1/turns - List turns (requires conversation_id query)
 * POST /api/v1/turns - Create turn
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import {
  insertTurn,
  findTurnsByConversation,
  findConversationById,
} from '@t3x/storage/pglite';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

function successResponse<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

function errorResponse(code: string, message: string): ApiResponse<never> {
  return { success: false, error: { code, message } };
}

/**
 * GET /api/v1/turns - List turns
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const conversationId = searchParams.get('conversation_id');

  if (!conversationId) {
    return NextResponse.json(
      errorResponse('INVALID_REQUEST', 'conversation_id query param is required'),
      { status: 400 }
    );
  }

  const limit = parseInt(searchParams.get('limit') ?? '100', 10);
  const offset = parseInt(searchParams.get('offset') ?? '0', 10);
  const orderParam = searchParams.get('order');
  const order = orderParam === 'desc' ? 'desc' : 'asc';

  try {
    const db = await getDB();
    const turns = await findTurnsByConversation(db, { conversationId, limit, offset, order });

    // Transform to API format
    const apiTurns = turns.map((t) => ({
      turn_hash: t.turnHash,
      parent_turn_hash: t.parentTurnHash,
      project_id: t.projectId,
      conversation_id: t.conversationId,
      role: t.role,
      content: t.content,
      language: t.language,
      rings: t.ringsJson ? JSON.parse(t.ringsJson) : null,
      created_at: t.createdAt.toISOString(),
    }));

    return NextResponse.json(
      successResponse({
        turns: apiTurns,
        conversation_id: conversationId,
        limit,
        offset,
        order,
      })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(errorResponse('LIST_FAILED', message), { status: 500 });
  }
}

/**
 * POST /api/v1/turns - Create turn
 */
export async function POST(request: NextRequest) {
  let body: {
    project_id?: string;
    conversation_id?: string;
    role?: string;
    content?: string;
    language?: string;
    rings?: unknown;
  } | null = null;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(errorResponse('INVALID_JSON', 'Invalid JSON body'), { status: 400 });
  }

  if (!body?.project_id || !body?.conversation_id || !body?.role || !body?.content) {
    return NextResponse.json(
      errorResponse('INVALID_REQUEST', 'project_id, conversation_id, role, and content are required'),
      { status: 400 }
    );
  }

  const validRoles = ['user', 'assistant', 'system', 'tool'];
  if (!validRoles.includes(body.role)) {
    return NextResponse.json(
      errorResponse('INVALID_REQUEST', `role must be one of: ${validRoles.join(', ')}`),
      { status: 400 }
    );
  }

  try {
    const db = await getDB();

    // Verify conversation exists
    const conversation = await findConversationById(db, body.conversation_id);
    if (!conversation) {
      return NextResponse.json(
        errorResponse('NOT_FOUND', `Conversation ${body.conversation_id} not found`),
        { status: 404 }
      );
    }

    // Verify project matches
    if (conversation.projectId !== body.project_id) {
      return NextResponse.json(
        errorResponse('INVALID_REQUEST', 'conversation does not belong to the specified project'),
        { status: 400 }
      );
    }

    const turn = await insertTurn(db, {
      projectId: body.project_id,
      conversationId: body.conversation_id,
      role: body.role as 'user' | 'assistant' | 'system' | 'tool',
      content: body.content,
      language: body.language,
      rings: body.rings as Record<string, unknown> | undefined,
    });

    // Transform to API format
    const apiTurn = {
      turn_hash: turn.turnHash,
      parent_turn_hash: turn.parentTurnHash,
      project_id: turn.projectId,
      conversation_id: turn.conversationId,
      role: turn.role,
      content: turn.content,
      language: turn.language,
      rings: turn.ringsJson ? JSON.parse(turn.ringsJson) : null,
      created_at: turn.createdAt.toISOString(),
    };

    return NextResponse.json(successResponse(apiTurn), { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(errorResponse('CREATE_FAILED', message), { status: 500 });
  }
}
