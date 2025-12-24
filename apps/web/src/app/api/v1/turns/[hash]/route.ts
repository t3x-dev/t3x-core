/**
 * Individual Turn API Routes
 *
 * GET /api/v1/turns/:hash - Get turn by hash
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { findTurnByHash } from '@t3x/storage/pglite';

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
  params: Promise<{ hash: string }>;
}

/**
 * GET /api/v1/turns/:hash - Get turn by hash
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  const { hash: turnHash } = await params;

  // The hash may be URL-encoded, decode it
  const decodedHash = decodeURIComponent(turnHash);

  try {
    const db = await getDB();
    const turn = await findTurnByHash(db, decodedHash);

    if (!turn) {
      return NextResponse.json(
        errorResponse('NOT_FOUND', `Turn ${decodedHash} not found`),
        { status: 404 }
      );
    }

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

    return NextResponse.json(successResponse(apiTurn));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(errorResponse('GET_FAILED', message), { status: 500 });
  }
}
