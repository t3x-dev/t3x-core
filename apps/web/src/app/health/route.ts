/**
 * Health Check Route (root level)
 *
 * GET /health - Health status (direct format)
 */

import { NextResponse } from 'next/server';

const startTime = Date.now();

export async function GET() {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

  return NextResponse.json({
    status: 'ok',
    version: '1.0.0',
    uptime: uptimeSeconds,
  });
}
