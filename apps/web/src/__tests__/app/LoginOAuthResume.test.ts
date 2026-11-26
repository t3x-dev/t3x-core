import { isValidElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from '@/app/login/page';

const { getCookie, redirect } = vi.hoisted(() => ({
  getCookie: vi.fn(),
  redirect: vi.fn((_target: string): never => {
    throw new Error('NEXT_REDIRECT');
  }),
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: getCookie }) }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect,
}));

const callbackUrl =
  '/settings/agent-access/authorize?response_type=code&state=chat%2Btask%2Fone' +
  '&code_challenge=abc_def&code_challenge_method=S256' +
  '&redirect_uri=http%3A%2F%2F127.0.0.1%3A38497%2Fcallback&scope=repository%3Acommit';
const session = 't3xs_test_session';

function page(params: Record<string, string | string[] | undefined> = { callbackUrl }) {
  return LoginPage({ searchParams: Promise.resolve(params) });
}

function credential(actorKind: string, credentialKind: string) {
  return Response.json({
    success: true,
    data: { actor_kind: actorKind, credential_kind: credentialKind },
  });
}

describe('returning to MCP consent from the login entry', () => {
  beforeEach(() => {
    getCookie.mockImplementation((name: string) =>
      name === 't3x-session' ? { value: session } : undefined
    );
    vi.stubEnv('T3X_API_URL', 'http://t3x-api:8000');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('restores the exact OAuth request for the authenticated human before showing the form', async () => {
    vi.mocked(fetch).mockResolvedValue(credential('human', 'session'));
    await expect(page()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledExactlyOnceWith(callbackUrl);
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toBe('http://t3x-api:8000/api/v1/auth/me/credential');
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${session}`);
    expect(init?.cache).toBe('no-store');
    expect(['manual', 'error']).toContain(init?.redirect);
  });

  it('keeps the login form when the browser has no session cookie', async () => {
    getCookie.mockReturnValue(undefined);
    expect(isValidElement(await page())).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it.each([
    ['an expired session', () => new Response(null, { status: 401 })],
    ['an Agent credential', () => credential('agent', 'mcp')],
    ['a human API key', () => credential('human', 'api-key')],
    ['an unavailable identity endpoint', () => Promise.reject(new Error('offline'))],
  ] as const)('keeps the login form for %s', async (_scenario, result) => {
    vi.mocked(fetch).mockImplementation(async () => result());
    expect(isValidElement(await page())).toBe(true);
    expect(redirect).not.toHaveBeenCalled();
  });

  it.each([
    ['ordinary login', {}],
    ['registration', { mode: 'register', callbackUrl }],
    ['a different local callback', { callbackUrl: '/invite?source=email' }],
    ['the login page itself', { callbackUrl: '/login' }],
    ['a similarly named route', { callbackUrl: '/settings/agent-access/authorize-other' }],
    [
      'a protocol-relative URL',
      { callbackUrl: '//example.invalid/settings/agent-access/authorize' },
    ],
    ['an absolute URL', { callbackUrl: 'https://example.invalid/settings/agent-access/authorize' }],
  ] as const)('preserves %s without probing a session or automatically redirecting', async (_, params) => {
    expect(isValidElement(await page(params))).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});
