/**
 * Individual Commit API Routes
 *
 * GET /api/v1/commits/:hash - Get commit by hash
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { findCommitByHash } from '@t3x/storage/pglite';

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
 * GET /api/v1/commits/:hash - Get commit by hash
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  const { hash: commitHash } = await params;
  const decodedHash = decodeURIComponent(commitHash);

  try {
    const db = await getDB();
    const commit = await findCommitByHash(db, decodedHash);

    if (!commit) {
      return NextResponse.json(
        errorResponse('NOT_FOUND', `Commit ${decodedHash} not found`),
        { status: 404 }
      );
    }

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

    return NextResponse.json(successResponse(apiCommit));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(errorResponse('GET_FAILED', message), { status: 500 });
  }
}
