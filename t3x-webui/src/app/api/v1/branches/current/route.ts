/**
 * Current Branch API Route
 *
 * GET /api/v1/branches/current - Get current branch
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { findCurrentBranch } from '@t3x/storage/pglite';

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
 * GET /api/v1/branches/current - Get current branch
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

  try {
    const db = await getDB();
    const branch = await findCurrentBranch(db, projectId);

    if (!branch) {
      return NextResponse.json(
        errorResponse('NOT_FOUND', 'No current branch set'),
        { status: 404 }
      );
    }

    // Transform to API format
    const apiBranch = {
      branch_id: branch.branchId,
      project_id: branch.projectId,
      name: branch.name,
      parent_branch: branch.parentBranch,
      head_commit_hash: branch.headCommitHash,
      description: branch.description,
      is_current: branch.isCurrent === 1,
      created_at: branch.createdAt.toISOString(),
      updated_at: branch.updatedAt.toISOString(),
    };

    return NextResponse.json(successResponse(apiBranch));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(errorResponse('GET_FAILED', message), { status: 500 });
  }
}
