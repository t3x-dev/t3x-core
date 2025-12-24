/**
 * Commits API Routes
 *
 * GET  /api/v1/commits - List commits (requires project_id query)
 * POST /api/v1/commits - Create commit
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import {
  insertCommit,
  findCommitsByProject,
  findProjectById,
  CommitError,
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
 * GET /api/v1/commits - List commits
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

  const branch = searchParams.get('branch') ?? undefined;
  const limit = parseInt(searchParams.get('limit') ?? '100', 10);
  const offset = parseInt(searchParams.get('offset') ?? '0', 10);

  try {
    const db = await getDB();
    const commitList = await findCommitsByProject(db, { projectId, branch, limit, offset });

    // Transform to API format
    const apiCommits = commitList.map((c) => ({
      commit_hash: c.commitHash,
      project_id: c.projectId,
      branch: c.branch,
      message: c.message,
      parents_json: c.parentsJson,
      turn_window_json: c.turnWindowJson,
      facet_snapshot_json: c.facetSnapshotJson,
      pipeline_config_json: c.pipelineConfigJson,
      draft_id: c.draftId,
      draft_text_hash: c.draftTextHash,
      signature_json: c.signatureJson,
      source_excerpt_json: c.sourceExcerptJson,
      must_have_json: c.mustHaveJson,
      mustnt_have_json: c.mustntHaveJson,
      position_x: c.positionX,
      position_y: c.positionY,
      source_refs_json: c.sourceRefsJson,
      created_at: c.createdAt.toISOString(),
    }));

    return NextResponse.json(
      successResponse({ commits: apiCommits, project_id: projectId, branch, limit, offset })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(errorResponse('LIST_FAILED', message), { status: 500 });
  }
}

/**
 * POST /api/v1/commits - Create commit
 */
export async function POST(request: NextRequest) {
  let body: {
    project_id?: string;
    branch?: string;
    message?: string;
    turn_window?: {
      start_turn_hash: string;
      end_turn_hash: string;
    };
    facet_snapshot?: unknown[];
    merge_parents?: string[];
    pipeline_config?: unknown;
    draft_id?: string;
    signature?: unknown;
    source_excerpt?: unknown;
    must_have?: unknown[];
    mustnt_have?: unknown[];
    position_x?: number;
    position_y?: number;
    source_refs?: unknown[];
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

  // Validate: either turn_window or merge_parents required
  const hasMergeParents = body.merge_parents && body.merge_parents.length > 0;
  const hasTurnWindow = !!body.turn_window;

  if (!hasMergeParents && !hasTurnWindow) {
    return NextResponse.json(
      errorResponse('INVALID_REQUEST', 'Either turn_window or merge_parents is required'),
      { status: 400 }
    );
  }

  if (hasMergeParents && hasTurnWindow) {
    return NextResponse.json(
      errorResponse('INVALID_REQUEST', 'Cannot specify both merge_parents and turn_window'),
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

    const commit = await insertCommit(db, {
      projectId: body.project_id,
      branch: body.branch,
      message: body.message,
      turnWindow: body.turn_window ? {
        startTurnHash: body.turn_window.start_turn_hash,
        endTurnHash: body.turn_window.end_turn_hash,
      } : undefined,
      facetSnapshot: body.facet_snapshot ?? [],
      mergeParents: body.merge_parents,
      pipelineConfig: body.pipeline_config,
      draftId: body.draft_id,
      signature: body.signature,
      sourceExcerpt: body.source_excerpt,
      mustHave: body.must_have,
      mustntHave: body.mustnt_have,
      positionX: body.position_x,
      positionY: body.position_y,
      sourceRefs: body.source_refs,
    });

    // Transform to API format
    const apiCommit = {
      commit_hash: commit.commitHash,
      project_id: commit.projectId,
      branch: commit.branch,
      message: commit.message,
      parents_json: commit.parentsJson,
      turn_window_json: commit.turnWindowJson,
      facet_snapshot_json: commit.facetSnapshotJson,
      pipeline_config_json: commit.pipelineConfigJson,
      draft_id: commit.draftId,
      draft_text_hash: commit.draftTextHash,
      signature_json: commit.signatureJson,
      source_excerpt_json: commit.sourceExcerptJson,
      must_have_json: commit.mustHaveJson,
      mustnt_have_json: commit.mustntHaveJson,
      position_x: commit.positionX,
      position_y: commit.positionY,
      source_refs_json: commit.sourceRefsJson,
      created_at: commit.createdAt.toISOString(),
    };

    return NextResponse.json(successResponse(apiCommit), { status: 201 });
  } catch (err) {
    if (err instanceof CommitError) {
      const status = err.code === 'BRANCH_NOT_FOUND' ? 404 : 400;
      return NextResponse.json(errorResponse(err.code, err.message), { status });
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(errorResponse('CREATE_FAILED', message), { status: 500 });
  }
}
