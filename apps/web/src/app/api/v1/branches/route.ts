/**
 * Branches API Routes
 *
 * GET  /api/v1/branches - List branches (requires project_id query)
 * POST /api/v1/branches - Create branch
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import {
  insertBranch,
  findBranchesByProject,
  findBranchByName,
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
 * GET /api/v1/branches - List branches
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
    const branchList = await findBranchesByProject(db, { projectId, limit, offset });

    // Transform to API format
    const apiBranches = branchList.map((b) => ({
      branch_id: b.branchId,
      project_id: b.projectId,
      name: b.name,
      parent_branch: b.parentBranch,
      head_commit_hash: b.headCommitHash,
      description: b.description,
      is_current: b.isCurrent === 1,
      created_at: b.createdAt.toISOString(),
      updated_at: b.updatedAt.toISOString(),
    }));

    return NextResponse.json(
      successResponse({ branches: apiBranches, project_id: projectId, limit, offset })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(errorResponse('LIST_FAILED', message), { status: 500 });
  }
}

/**
 * POST /api/v1/branches - Create branch
 */
export async function POST(request: NextRequest) {
  let body: {
    project_id?: string;
    name?: string;
    parent_branch?: string;
    description?: string;
  } | null = null;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(errorResponse('INVALID_JSON', 'Invalid JSON body'), { status: 400 });
  }

  if (!body?.project_id || !body?.name) {
    return NextResponse.json(
      errorResponse('INVALID_REQUEST', 'project_id and name are required'),
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

    // Check if branch already exists
    const existing = await findBranchByName(db, body.project_id, body.name);
    if (existing) {
      return NextResponse.json(
        errorResponse('CONFLICT', `Branch ${body.name} already exists`),
        { status: 409 }
      );
    }

    const branch = await insertBranch(db, {
      projectId: body.project_id,
      name: body.name,
      parentBranch: body.parent_branch,
      description: body.description,
    });

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

    return NextResponse.json(successResponse(apiBranch), { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(errorResponse('CREATE_FAILED', message), { status: 500 });
  }
}
