/**
 * Merge Resolve API Route
 *
 * POST /api/v1/merge/resolve - Apply conflict resolutions
 */

import { type NextRequest, NextResponse } from 'next/server';
import { createMergeEngine, type MergeResult } from '@t3x/core';

interface ResolveRequest {
  mergeResult: MergeResult;
  resolutions: Record<string, string>;
}

function successResponse<T>(data: T) {
  return { success: true, data };
}

function errorResponse(code: string, message: string) {
  return { success: false, error: { code, message } };
}

export async function POST(request: NextRequest) {
  let body: ResolveRequest | null = null;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(errorResponse('INVALID_JSON', 'Invalid JSON body'), { status: 400 });
  }

  if (!body || !body.mergeResult || !body.resolutions) {
    return NextResponse.json(
      errorResponse('INVALID_REQUEST', "Request body must include 'mergeResult' and 'resolutions'"),
      { status: 400 }
    );
  }

  try {
    // Create merge engine and apply resolutions
    const mergeEngine = createMergeEngine();
    const resolutionMap = new Map(Object.entries(body.resolutions));
    const result = mergeEngine.applyResolutions(body.mergeResult, resolutionMap);

    return NextResponse.json(successResponse(result));
  } catch (error) {
    return NextResponse.json(
      errorResponse('RESOLVE_FAILED', (error as Error).message),
      { status: 500 }
    );
  }
}
