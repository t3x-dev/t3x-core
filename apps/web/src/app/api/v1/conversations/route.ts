/**
 * Conversations API Routes
 *
 * GET  /api/v1/conversations - List conversations (requires project_id query)
 * POST /api/v1/conversations - Create conversation
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import {
  insertConversation,
  findConversationsByProject,
  findProjectById,
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
 * GET /api/v1/conversations - List conversations
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const projectId = searchParams.get('project_id');

  if (!projectId) {
    return NextResponse.json(
      errorResponse('INVALID_REQUEST', 'project_id query param is required'),
      { status: 400 }
    );
  }

  const limit = parseInt(searchParams.get('limit') ?? '100', 10);
  const offset = parseInt(searchParams.get('offset') ?? '0', 10);

  try {
    const db = await getDB();
    const conversations = await findConversationsByProject(db, { projectId, limit, offset });

    // Transform to API format
    const apiConversations = conversations.map((c) => ({
      conversation_id: c.conversationId,
      project_id: c.projectId,
      title: c.title,
      parent_commit_hash: c.parentCommitHash,
      position_x: c.positionX,
      position_y: c.positionY,
      created_at: c.createdAt.toISOString(),
      metadata: c.metadataJson ? JSON.parse(c.metadataJson) : null,
    }));

    return NextResponse.json(
      successResponse({ conversations: apiConversations, project_id: projectId, limit, offset })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(errorResponse('LIST_FAILED', message), { status: 500 });
  }
}

/**
 * POST /api/v1/conversations - Create conversation
 */
export async function POST(request: NextRequest) {
  let body: {
    project_id?: string;
    title?: string;
    parent_commit_hash?: string;
    position_x?: number;
    position_y?: number;
    metadata?: Record<string, unknown>;
  } | null = null;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(errorResponse('INVALID_JSON', 'Invalid JSON body'), { status: 400 });
  }

  if (!body?.project_id) {
    return NextResponse.json(
      errorResponse('INVALID_REQUEST', 'project_id is required'),
      { status: 400 }
    );
  }

  try {
    const db = await getDB();

    // Verify project exists
    const project = await findProjectById(db, body.project_id);
    if (!project) {
      return NextResponse.json(
        errorResponse('NOT_FOUND', `Project ${body.project_id} not found`),
        { status: 404 }
      );
    }

    const conversation = await insertConversation(db, {
      projectId: body.project_id,
      title: body.title,
      parentCommitHash: body.parent_commit_hash,
      positionX: body.position_x,
      positionY: body.position_y,
      metadata: body.metadata,
    });

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

    return NextResponse.json(successResponse(apiConversation), { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(errorResponse('CREATE_FAILED', message), { status: 500 });
  }
}
