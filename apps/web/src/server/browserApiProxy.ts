const SESSION_COOKIE = 't3x-session';
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const LOGIN_PATHS = new Set(['v1/auth/login', 'v1/auth/register']);

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key !== name) continue;
    try {
      return decodeURIComponent(value.join('='));
    } catch {
      return null;
    }
  }
  return null;
}

function sessionCookie(value: string, maxAge = SESSION_MAX_AGE_SECONDS): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`;
}

function csrfAllowed(request: Request): boolean {
  if (!UNSAFE_METHODS.has(request.method.toUpperCase())) return true;
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const internalUrl = new URL(request.url);
  const host =
    request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() || request.headers.get('host');
  const protocol =
    request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ||
    internalUrl.protocol.slice(0, -1);
  return origin === (host ? `${protocol}://${host}` : internalUrl.origin);
}

function upstreamHeaders(request: Request, session: string | null): Headers {
  const headers = new Headers(request.headers);
  for (const name of [
    'authorization',
    'connection',
    'content-length',
    'cookie',
    'host',
    'origin',
    'sec-fetch-dest',
    'sec-fetch-mode',
    'sec-fetch-site',
    'transfer-encoding',
  ]) {
    headers.delete(name);
  }
  headers.set('accept-encoding', 'identity');
  if (session) headers.set('authorization', `Bearer ${session}`);
  return headers;
}

function responseHeaders(upstream: Response): Headers {
  const headers = new Headers(upstream.headers);
  for (const name of ['connection', 'content-length', 'set-cookie', 'transfer-encoding']) {
    headers.delete(name);
  }
  return headers;
}

export async function proxyBrowserApi(request: Request, path: string[]): Promise<Response> {
  if (!csrfAllowed(request)) {
    return Response.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Cross-origin request denied' } },
      { status: 403 }
    );
  }

  const apiOrigin = process.env.T3X_API_URL || 'http://localhost:8000';
  const incoming = new URL(request.url);
  const upstreamPath =
    path.length === 1 && path[0] === 'health'
      ? '/health'
      : `/api/${path.map(encodeURIComponent).join('/')}`;
  const target = new URL(upstreamPath, apiOrigin);
  target.search = incoming.search;
  const session = readCookie(request.headers.get('cookie'), SESSION_COOKIE);
  const body = ['GET', 'HEAD'].includes(request.method.toUpperCase())
    ? undefined
    : await request.blob();
  const upstream = await fetch(target, {
    method: request.method,
    headers: upstreamHeaders(request, session),
    body: body && body.size > 0 ? body : undefined,
    redirect: 'manual',
  });
  const route = path.join('/');

  if (LOGIN_PATHS.has(route) && upstream.ok) {
    const payload = (await upstream.json()) as {
      success?: boolean;
      data?: Record<string, unknown> & { api_key?: unknown };
    };
    const data = payload.data;
    const token = data?.api_key;
    if (!data || typeof token !== 'string' || !token.startsWith('t3xs_')) {
      return Response.json(
        { success: false, error: { code: 'BAD_GATEWAY', message: 'Session was not issued' } },
        { status: 502 }
      );
    }
    const { api_key: _, ...safeData } = data;
    const headers = responseHeaders(upstream);
    headers.set('content-type', 'application/json');
    headers.append('set-cookie', sessionCookie(token));
    return new Response(JSON.stringify({ ...payload, data: safeData }), {
      status: upstream.status,
      headers,
    });
  }

  const headers = responseHeaders(upstream);
  if (route === 'v1/auth/logout' && (upstream.ok || upstream.status === 401)) {
    headers.append('set-cookie', sessionCookie('', 0));
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}
