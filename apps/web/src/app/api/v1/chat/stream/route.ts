/**
 * Chat Stream API Route (Proxy)
 *
 * Proxies streaming chat requests to the Hono API server.
 * This route exists because browser fetch to external SSE endpoints
 * may have CORS issues, so we proxy through Next.js.
 */

import type { NextRequest } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
const API_KEY = process.env.NEXT_PUBLIC_T3X_API_KEY;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Forward to Hono API (routes are under /api prefix)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (API_KEY) {
      headers.Authorization = `Bearer ${API_KEY}`;
    } else {
      // Get API key from local auth session cookie
      const sessionKey = request.cookies.get('t3x-session')?.value;
      if (sessionKey) {
        headers.Authorization = `Bearer ${sessionKey}`;
      }
    }
    const response = await fetch(`${API_BASE}/api/v1/chat/stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return Response.json(
        {
          success: false,
          error: errorData.error || { code: 'UPSTREAM_ERROR', message: `HTTP ${response.status}` },
        },
        { status: response.status }
      );
    }

    // Stream the response back
    const readable = response.body;
    if (!readable) {
      return Response.json(
        { success: false, error: { code: 'NO_BODY', message: 'No response body from upstream' } },
        { status: 500 }
      );
    }

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json(
      { success: false, error: { code: 'PROXY_ERROR', message } },
      { status: 500 }
    );
  }
}
