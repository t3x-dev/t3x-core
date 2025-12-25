/**
 * Branch Switch API Route
 *
 * POST /api/v1/branches/switch - Switch current branch
 */

import { type NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { switchBranch, insertBranch, findBranchByName } from '@t3x/storage/pglite';

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
 * POST /api/v1/branches/switch - Switch current branch
 */
export async function POST(request: NextRequest) {
  let body: {
    project_id?: string;
    branch_name?: string;
    create_if_missing?: boolean;
  } | null = null;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(errorResponse('INVALID_JSON', 'Invalid JSON body'), { status: 400 });
  }

  if (!body?.project_id || !body?.branch_name) {
    return NextResponse.json(
      errorResponse('INVALID_REQUEST', 'project_id and branch_name are required'),
      { status: 400 }
    );
  }

  try {
    const db = await getDB();

    // Check if branch exists
    let branch = await findBranchByName(db, body.project_id, body.branch_name);

    if (!branch) {
      if (body.create_if_missing) {
        // Create the branch
        branch = await insertBranch(db, {
          projectId: body.project_id,
          name: body.branch_name,
        });
      } else {
        return NextResponse.json(
          errorResponse('NOT_FOUND', `Branch ${body.branch_name} not found`),
          { status: 404 }
        );
      }
    }

    const switched = await switchBranch(db, body.project_id, body.branch_name);
    if (!switched) {
      return NextResponse.json(
        errorResponse('SWITCH_FAILED', 'Failed to switch branch'),
        { status: 500 }
      );
    }

    // Transform to API format
    const apiBranch = {
      branch_id: switched.branchId,
      project_id: switched.projectId,
      name: switched.name,
      parent_branch: switched.parentBranch,
      head_commit_hash: switched.headCommitHash,
      description: switched.description,
      is_current: switched.isCurrent === 1,
      created_at: switched.createdAt.toISOString(),
      updated_at: switched.updatedAt.toISOString(),
    };

    return NextResponse.json(successResponse(apiBranch));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(errorResponse('SWITCH_FAILED', message), { status: 500 });
  }
}
