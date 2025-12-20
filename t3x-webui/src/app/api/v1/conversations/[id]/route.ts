/**
 * Individual Conversation API Routes
 *
 * GET    /api/v1/conversations/:id - Get conversation with turn count
 * PUT    /api/v1/conversations/:id - Update conversation
 * DELETE /api/v1/conversations/:id - Delete conversation
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import {
  findConversationById,
  updateConversation,
  deleteConversation,
  getConversationTurnCount,
} from '@t3x/storage';

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

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/conversations/:id - Get conversation with turn count
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  const { id: conversationId } = await params;

  try {
    const db = await getDB();
    const conversation = await findConversationById(db, conversationId);

    if (!conversation) {
      return NextResponse.json(
        errorResponse('NOT_FOUND', `Conversation ${conversationId} not found`),
        { status: 404 }
      );
    }

    const turnsCount = await getConversationTurnCount(db, conversationId);

    // Transform to API format
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

    return NextResponse.json(successResponse(apiConversation));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(errorResponse('GET_FAILED', message), { status: 500 });
  }
}

/**
 * PUT /api/v1/conversations/:id - Update conversation
 */
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
) {
  const { id: conversationId } = await params;

  let body: {
    title?: string;
    position_x?: number;
    position_y?: number;
    metadata?: Record<string, unknown>;
  } | null = null;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(errorResponse('INVALID_JSON', 'Invalid JSON body'), { status: 400 });
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
      return NextResponse.json(
        errorResponse('NOT_FOUND', `Conversation ${conversationId} not found`),
        { status: 404 }
      );
    }

    // Transform to API format
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

    return NextResponse.json(successResponse(apiConversation));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(errorResponse('UPDATE_FAILED', message), { status: 500 });
  }
}

/**
 * DELETE /api/v1/conversations/:id - Delete conversation
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  const { id: conversationId } = await params;

  try {
    const db = await getDB();
    const deleted = await deleteConversation(db, conversationId);

    if (!deleted) {
      return NextResponse.json(
        errorResponse('NOT_FOUND', `Conversation ${conversationId} not found`),
        { status: 404 }
      );
    }

    return NextResponse.json(successResponse({ deleted: true, conversation_id: conversationId }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(errorResponse('DELETE_FAILED', message), { status: 500 });
  }
}
