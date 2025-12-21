/**
 * Drafts API Routes
 *
 * GET  /api/v1/drafts - List drafts (requires project_id query)
 * POST /api/v1/drafts - Create draft
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import {
  insertDraft,
  findDraftsByProject,
  findProjectById,
  type DraftStatus,
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

/**
 * GET /api/v1/drafts - List drafts
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

  const status = searchParams.get('status') as DraftStatus | null ?? undefined;
  const limit = parseInt(searchParams.get('limit') ?? '100', 10);
  const offset = parseInt(searchParams.get('offset') ?? '0', 10);

  try {
    const db = await getDB();
    const draftList = await findDraftsByProject(db, { projectId, status, limit, offset });

    // Transform to API format
    const apiDrafts = draftList.map((d) => ({
      draft_id: d.draftId,
      project_id: d.projectId,
      conversation_id: d.conversationId,
      base_commit_hash: d.baseCommitHash,
      turn_anchor_hash: d.turnAnchorHash,
      bridge_id: d.bridgeId,
      bridge_payload_json: d.bridgePayloadJson,
      must_have_json: d.mustHaveJson,
      mustnt_have_json: d.mustntHaveJson,
      llm_config_json: d.llmConfigJson,
      text: d.text,
      status: d.status,
      created_at: d.createdAt.toISOString(),
      completed_at: d.completedAt?.toISOString() ?? null,
    }));

    return NextResponse.json(
      successResponse({ drafts: apiDrafts, project_id: projectId, limit, offset })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(errorResponse('LIST_FAILED', message), { status: 500 });
  }
}

/**
 * POST /api/v1/drafts - Create draft
 */
export async function POST(request: NextRequest) {
  let body: {
    project_id?: string;
    conversation_id?: string;
    base_commit_hash?: string;
    turn_anchor_hash?: string;
    bridge_id?: string;
    bridge_payload?: unknown;
    must_have?: unknown[];
    mustnt_have?: unknown[];
    llm_config?: unknown;
    text?: string;
  } | null = null;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(errorResponse('INVALID_JSON', 'Invalid JSON body'), { status: 400 });
  }

  if (!body?.project_id || !body?.conversation_id || !body?.bridge_id || !body?.text) {
    return NextResponse.json(
      errorResponse('INVALID_REQUEST', 'project_id, conversation_id, bridge_id, and text are required'),
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

    const draft = await insertDraft(db, {
      projectId: body.project_id,
      conversationId: body.conversation_id,
      baseCommitHash: body.base_commit_hash,
      turnAnchorHash: body.turn_anchor_hash,
      bridgeId: body.bridge_id,
      bridgePayload: body.bridge_payload ?? {},
      mustHave: body.must_have,
      mustntHave: body.mustnt_have,
      llmConfig: body.llm_config ?? {},
      text: body.text,
    });

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

    return NextResponse.json(successResponse(apiDraft), { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(errorResponse('CREATE_FAILED', message), { status: 500 });
  }
}
