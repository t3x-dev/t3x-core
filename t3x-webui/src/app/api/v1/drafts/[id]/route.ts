/**
 * Individual Draft API Routes
 *
 * GET    /api/v1/drafts/:id - Get draft
 * DELETE /api/v1/drafts/:id - Delete draft
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { findDraftById, deleteDraft } from '@t3x/storage';

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
 * GET /api/v1/drafts/:id - Get draft
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  const { id: draftId } = await params;

  try {
    const db = await getDB();
    const draft = await findDraftById(db, draftId);

    if (!draft) {
      return NextResponse.json(
        errorResponse('NOT_FOUND', `Draft ${draftId} not found`),
        { status: 404 }
      );
    }

    // Transform to API format
    const apiDraft = {
      draft_id: draft.draftId,
      project_id: draft.projectId,
      conversation_id: draft.conversationId,
      base_commit_hash: draft.baseCommitHash,
      turn_anchor_hash: draft.turnAnchorHash,
      bridge_id: draft.bridgeId,
      bridge_payload_json: draft.bridgePayloadJson,
      must_have_json: draft.mustHaveJson,
      mustnt_have_json: draft.mustntHaveJson,
      llm_config_json: draft.llmConfigJson,
      text: draft.text,
      status: draft.status,
      created_at: draft.createdAt.toISOString(),
      completed_at: draft.completedAt?.toISOString() ?? null,
    };

    return NextResponse.json(successResponse(apiDraft));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(errorResponse('GET_FAILED', message), { status: 500 });
  }
}

/**
 * DELETE /api/v1/drafts/:id - Delete draft
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  const { id: draftId } = await params;

  try {
    const db = await getDB();
    const deleted = await deleteDraft(db, draftId);

    if (!deleted) {
      return NextResponse.json(
        errorResponse('NOT_FOUND', `Draft ${draftId} not found`),
        { status: 404 }
      );
    }

    return NextResponse.json(successResponse({ deleted: true, draft_id: draftId }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(errorResponse('DELETE_FAILED', message), { status: 500 });
  }
}
