// OAuth discovery and code exchange use no browser session or proxy-supplied authority.
export async function mcpPublicEndpoint(endpoint: 'metadata' | 'token', request?: Request) {
  const origin = process.env.T3X_API_URL || 'http://localhost:8000';
  const url = new URL('/api/mcp-oauth/' + endpoint, origin);
  const headers = {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
    'Referrer-Policy': 'no-referrer',
  };
  if (
    request &&
    (request.headers.get('content-type')?.split(';')[0]?.trim() !==
      'application/x-www-form-urlencoded' ||
      !request.body)
  )
    return Response.json({ error: 'invalid_request' }, { status: 400, headers });
  try {
    // Stream to the issuer, which enforces a size limit before parsing form fields.
    const init: RequestInit & { duplex?: 'half' } = request
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: request.body,
          duplex: 'half',
        }
      : { method: 'GET' };
    const response = await fetch(url, {
      ...init,
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return Response.json({ error: 'temporarily_unavailable' }, { status: 503, headers });
  }
}
