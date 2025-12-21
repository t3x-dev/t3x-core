/**
 * Projects API Routes
 *
 * GET  /api/v1/projects - List projects
 * POST /api/v1/projects - Create project
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { insertProject, findProjects } from '@t3x/storage/pglite';

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
 * GET /api/v1/projects - List projects
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const limit = parseInt(searchParams.get('limit') ?? '100', 10);
  const offset = parseInt(searchParams.get('offset') ?? '0', 10);

  try {
    const db = await getDB();
    const projects = await findProjects(db, { limit, offset });

    // Transform to API format
    const apiProjects = projects.map((p) => ({
      project_id: p.projectId,
      name: p.name,
      created_at: p.createdAt.toISOString(),
      metadata: p.metadataJson ? JSON.parse(p.metadataJson) : null,
    }));

    return NextResponse.json(successResponse({ projects: apiProjects, limit, offset }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(errorResponse('LIST_FAILED', message), { status: 500 });
  }
}

/**
 * POST /api/v1/projects - Create project
 */
export async function POST(request: NextRequest) {
  let body: { name?: string; metadata?: Record<string, unknown> } | null = null;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(errorResponse('INVALID_JSON', 'Invalid JSON body'), { status: 400 });
  }

  if (!body?.name) {
    return NextResponse.json(errorResponse('INVALID_REQUEST', 'name is required'), { status: 400 });
  }

  try {
    const db = await getDB();
    const project = await insertProject(db, {
      name: body.name,
      metadata: body.metadata,
    });

    // Transform to API format
    const apiProject = {
      project_id: project.projectId,
      name: project.name,
      created_at: project.createdAt.toISOString(),
      metadata: project.metadataJson ? JSON.parse(project.metadataJson) : null,
    };

    return NextResponse.json(successResponse(apiProject), { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(errorResponse('CREATE_FAILED', message), { status: 500 });
  }
}
