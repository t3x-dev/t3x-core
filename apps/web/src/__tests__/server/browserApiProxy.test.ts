import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { proxyBrowserApi } from '@/server/browserApiProxy';

const SESSION = 't3xs_browser_session_secret';

function request(path: string, init: RequestInit = {}) {
  return new Request(`http://localhost:3000${path}`, {
    ...init,
    headers: {
      origin: 'http://localhost:3000',
      ...init.headers,
    },
  });
}

describe('browser API proxy', () => {
  beforeEach(() => {
    process.env.T3X_API_URL = 'http://api.internal:8000';
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    delete process.env.T3X_API_URL;
    vi.restoreAllMocks();
  });

  it('sets a server-only session cookie and removes the credential from login JSON', async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({
        success: true,
        data: { id: 'user_1', api_key: SESSION, name: 'A', username: 'test-a' },
      })
    );

    const response = await proxyBrowserApi(
      request('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'test-a', password: 'secret' }),
      }),
      ['v1', 'auth', 'login']
    );

    expect(await response.json()).toEqual({
      success: true,
      data: { id: 'user_1', name: 'A', username: 'test-a' },
    });
    expect(response.headers.get('set-cookie')).toContain(
      `t3x-session=${encodeURIComponent(SESSION)}`
    );
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('set-cookie')).toContain('SameSite=Lax');
    expect(response.headers.get('set-cookie')).not.toContain('Secure');
  });

  it('adds Secure to the session cookie in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.mocked(fetch).mockResolvedValue(
      Response.json({
        success: true,
        data: { id: 'user_1', api_key: SESSION, name: null, username: 'test-a' },
      })
    );

    const response = await proxyBrowserApi(
      request('/api/v1/auth/login', { method: 'POST', body: '{}' }),
      ['v1', 'auth', 'login']
    );

    expect(response.headers.get('set-cookie')).toContain('Secure');
  });

  it('injects the HttpOnly cookie as upstream Bearer auth without forwarding Cookie', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ success: true, data: { id: 'user_1' } }));

    await proxyBrowserApi(
      request('/api/v1/auth/me', {
        headers: {
          'content-length': '999',
          cookie: `other=value; t3x-session=${encodeURIComponent(SESSION)}`,
        },
      }),
      ['v1', 'auth', 'me']
    );

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe(`Bearer ${SESSION}`);
    expect(headers.has('content-length')).toBe(false);
    expect(headers.has('cookie')).toBe(false);
  });

  it('does not let browser JavaScript forward its own Bearer credential', async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })
    );

    await proxyBrowserApi(
      request('/api/v1/auth/me', { headers: { authorization: 'Bearer browser-controlled' } }),
      ['v1', 'auth', 'me']
    );

    expect(new Headers(vi.mocked(fetch).mock.calls[0]?.[1]?.headers).has('authorization')).toBe(
      false
    );
  });

  it('treats a malformed encoded cookie as unauthenticated', async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })
    );

    const response = await proxyBrowserApi(
      request('/api/v1/auth/me', { headers: { cookie: 't3x-session=%E0%A4%A' } }),
      ['v1', 'auth', 'me']
    );

    expect(response.status).toBe(401);
    expect(new Headers(vi.mocked(fetch).mock.calls[0]?.[1]?.headers).has('authorization')).toBe(
      false
    );
  });

  it('rejects cross-origin state changes before calling the API', async () => {
    const response = await proxyBrowserApi(
      new Request('http://localhost:3000/api/v1/projects', {
        method: 'POST',
        headers: { origin: 'https://attacker.example' },
      }),
      ['v1', 'projects']
    );

    expect(response.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('accepts the public Host origin when Next uses an internal request URL', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ success: true }));

    const response = await proxyBrowserApi(
      new Request('http://localhost:3000/api/v1/projects', {
        method: 'POST',
        headers: { host: '127.0.0.1:3100', origin: 'http://127.0.0.1:3100' },
      }),
      ['v1', 'projects']
    );

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('clears the browser cookie when logout succeeds or is already unauthorized', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({ success: true, data: { logged_out: true } })
    );
    const success = await proxyBrowserApi(
      request('/api/v1/auth/logout', {
        method: 'POST',
        headers: { cookie: `t3x-session=${SESSION}` },
      }),
      ['v1', 'auth', 'logout']
    );

    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })
    );
    const unauthorized = await proxyBrowserApi(
      request('/api/v1/auth/logout', {
        method: 'POST',
        headers: { cookie: `t3x-session=${SESSION}` },
      }),
      ['v1', 'auth', 'logout']
    );

    for (const response of [success, unauthorized]) {
      expect(response.headers.get('set-cookie')).toContain('t3x-session=');
      expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    }
  });
});
