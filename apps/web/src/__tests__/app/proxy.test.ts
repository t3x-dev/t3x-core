import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it } from 'vitest';
import { proxy } from '@/proxy';

function createRequest(pathname: string, cookie) {
  const headers = new Headers();
  if (cookie) {
    headers.set('cookie', cookie);
  }

  return new NextRequest(`http://localhost${pathname}`, { headers });
}

describe('proxy auth gating', () => {
  afterEach(() => {
    delete process.env.AUTH_DISABLED;
    delete process.env.NEXT_PUBLIC_AUTH_DISABLED;
  });

  it('allows chat routes through when auth is disabled for local source dev', () => {
    process.env.AUTH_DISABLED = 'true';

    const response = proxy(createRequest('/chat'));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('redirects unauthenticated chat routes to login when auth is enabled', () => {
    process.env.AUTH_DISABLED = 'false';

    const response = proxy(createRequest('/chat'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/login?callbackUrl=%2Fchat');
  });

  it('preserves local query state in the post-login callback', () => {
    process.env.AUTH_DISABLED = 'false';

    const response = proxy(createRequest('/chat?projectId=project_1&view=canvas'));

    expect(response.headers.get('location')).toBe(
      'http://localhost/login?callbackUrl=%2Fchat%3FprojectId%3Dproject_1%26view%3Dcanvas'
    );
  });

  it('allows authenticated chat routes through when auth is enabled', () => {
    process.env.AUTH_DISABLED = 'false';

    const response = proxy(createRequest('/chat', 't3x-session=test-key'));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('allows the invitation landing route to capture its browser-only fragment', () => {
    process.env.AUTH_DISABLED = 'false';

    const response = proxy(createRequest('/invite'));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });
});
