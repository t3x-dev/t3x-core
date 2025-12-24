/**
 * Health Check Route
 *
 * GET /api/v1/health - Health status (matches Python format)
 */

import { NextResponse } from 'next/server';

// Track server start time for uptime calculation
const startTime = Date.now();

export async function GET() {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

  return NextResponse.json({
    status: 'ok',
    version: '1.0.0',
    uptime: uptimeSeconds,
  });
}
