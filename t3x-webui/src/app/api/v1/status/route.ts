/**
 * Status API Route
 *
 * GET /api/v1/status - Get API status
 */

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { findProjects } from '@t3x/storage';

const startTime = Date.now();

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
 * GET /api/v1/status - Get API status
 */
export async function GET() {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

  try {
    const db = await getDB();
    const projects = await findProjects(db, { limit: 1, offset: 0 });

    return NextResponse.json(
      successResponse({
        status: 'ok',
        version: '1.0.0',
        uptime: uptimeSeconds,
        database: 'connected',
        projects_count: projects.length > 0 ? 'available' : 'empty',
      })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      errorResponse('STATUS_ERROR', message),
      { status: 500 }
    );
  }
}
