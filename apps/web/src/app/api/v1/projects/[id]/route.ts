/**
 * Individual Project API Routes
 *
 * GET    /api/v1/projects/:id - Get project with stats
 * PUT    /api/v1/projects/:id - Update project
 * DELETE /api/v1/projects/:id - Delete project
 */

import { type NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { findProjectWithStats, updateProject, deleteProject } from '@t3x/storage/pglite';

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
 * GET /api/v1/projects/:id - Get project with stats
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  const { id: projectId } = await params;

  try {
    const db = await getDB();
    const project = await findProjectWithStats(db, projectId);

    if (!project) {
      return NextResponse.json(
        errorResponse('NOT_FOUND', `Project ${projectId} not found`),
        { status: 404 }
      );
    }

    // Transform to API format
    const apiProject = {
      project_id: project.projectId,
      name: project.name,
      created_at: project.createdAt.toISOString(),
      metadata: project.metadataJson ? JSON.parse(project.metadataJson) : null,
      conversations_count: project.stats.conversationsCount,
      turns_count: project.stats.turnsCount,
      commits_count: project.stats.commitsCount,
      branches_count: project.stats.branchesCount,
      drafts_count: project.stats.draftsCount,
    };

    return NextResponse.json(successResponse(apiProject));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(errorResponse('GET_FAILED', message), { status: 500 });
  }
}

/**
 * PUT /api/v1/projects/:id - Update project
 */
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
) {
  const { id: projectId } = await params;

  let body: { name?: string; metadata?: Record<string, unknown> } | null = null;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(errorResponse('INVALID_JSON', 'Invalid JSON body'), { status: 400 });
  }

  try {
    const db = await getDB();
    const project = await updateProject(db, projectId, {
      name: body?.name,
      metadata: body?.metadata,
    });

    if (!project) {
      return NextResponse.json(
        errorResponse('NOT_FOUND', `Project ${projectId} not found`),
        { status: 404 }
      );
    }

    // Transform to API format
    const apiProject = {
      project_id: project.projectId,
      name: project.name,
      created_at: project.createdAt.toISOString(),
      metadata: project.metadataJson ? JSON.parse(project.metadataJson) : null,
    };

    return NextResponse.json(successResponse(apiProject));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(errorResponse('UPDATE_FAILED', message), { status: 500 });
  }
}

/**
 * DELETE /api/v1/projects/:id - Delete project
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  const { id: projectId } = await params;

  try {
    const db = await getDB();
    const deleted = await deleteProject(db, projectId);

    if (!deleted) {
      return NextResponse.json(
        errorResponse('NOT_FOUND', `Project ${projectId} not found`),
        { status: 404 }
      );
    }

    return NextResponse.json(successResponse({ deleted: true, project_id: projectId }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(errorResponse('DELETE_FAILED', message), { status: 500 });
  }
}
