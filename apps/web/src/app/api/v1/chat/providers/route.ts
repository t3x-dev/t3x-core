/**
 * Chat Providers API Route
 *
 * GET /api/v1/chat/providers - List available providers
 */

import { NextResponse } from 'next/server';

function successResponse<T>(data: T) {
  return { success: true, data };
}

export async function GET() {
  const availableProviders: string[] = ['claude'];

  // Check if OpenAI is configured
  if (process.env.OPENAI_API_KEY) {
    availableProviders.push('openai');
  }

  return NextResponse.json(
    successResponse({
      providers: availableProviders,
      default: 'claude',
    })
  );
}
