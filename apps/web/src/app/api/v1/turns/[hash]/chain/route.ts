/**
 * Turn Chain API Route
 *
 * GET /api/v1/turns/:hash/chain - Get turn history chain
 */

import { type NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { findTurnChain } from '@t3x/storage/pglite';

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
 * GET /api/v1/turns/:hash/chain - Get turn chain (history)
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  const { hash: turnHash } = await params;
  const decodedHash = decodeURIComponent(turnHash);

  const searchParams = request.nextUrl.searchParams;
  const limit = parseInt(searchParams.get('limit') ?? '50', 10);

  try {
    const db = await getDB();
    const chain = await findTurnChain(db, decodedHash, limit);

    // Transform to API format
    const apiChain = chain.map((t) => ({
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
      successResponse({ chain: apiChain, end_turn_hash: decodedHash })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(errorResponse('GET_FAILED', message), { status: 500 });
  }
}
