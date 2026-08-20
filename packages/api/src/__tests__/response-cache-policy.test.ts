import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import {
  PRIVATE_NO_STORE,
  responseCachePolicyMiddleware,
} from '../middleware/response-cache-policy';
import type { AppEnv } from '../types';

type Principal = 'core' | 'cloud' | undefined;

function createTestApp(principal?: Principal) {
  const app = new Hono<AppEnv>();
  app.use('*', responseCachePolicyMiddleware);

  if (principal === 'core') {
    app.use('*', async (c, next) => {
      c.set('apiKey', {
        id: 'key_core',
        name: 'Core test key',
        key: 't3xk_test',
        user_id: 'user_core',
        project_id: null,
        principal_kind: 'human',
        transition_scopes: [],
        created_at: new Date().toISOString(),
        last_used_at: null,
      } as NonNullable<AppEnv['Variables']['apiKey']>);
      await next();
    });
  }

  if (principal === 'cloud') {
    app.use('*', async (c, next) => {
      c.set('userId', 'user_cloud');
      await next();
    });
  }

  app.get('/protected', (c) => c.json({ secret: true }));
  app.post('/api/v1/auth/login', (c) => c.json({ api_key: 't3xk_secret' }));
  app.get('/api/v1/auth/callback/provider', (c) => c.json({ session: 'cloud-secret' }));
  app.get('/api/v1/share/:token', (c) => c.json({ shared: c.req.param('token') }));
  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.get('/api/docs', (c) => c.html('<html>docs</html>'));
  app.get(
    '/assets/app.js',
    () =>
      new Response('console.log("ok")', {
        headers: {
          'Content-Type': 'application/javascript',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      })
  );
  app.get(
    '/events',
    () =>
      new Response('data: ready\n\n', {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      })
  );
  app.get(
    '/download',
    () =>
      new Response('private export', {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': 'attachment; filename="export.bin"',
        },
      })
  );

  return app;
}

describe('response cache policy', () => {
  it('is mounted on the app factory for built-in local auth responses', async () => {
    const { app } = createApp();
    const response = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

    expect(response.status).toBe(400);
    expect(response.headers.get('Cache-Control')).toBe(PRIVATE_NO_STORE);
  });

  it('runs after an injected Cloud auth adapter establishes a user principal', async () => {
    const { app } = createApp({
      skipBuiltinAuth: true,
      skipLocalAuth: true,
      middleware: [
        async (c, next) => {
          if (c.req.path === '/api/v1/cloud-cache-probe') {
            c.set('userId', 'user_cloud');
          }
          await next();
        },
      ],
      routes(api) {
        api.get('/v1/cloud-cache-probe', (c) => c.json({ secret: true }));
      },
    });

    const response = await app.request('/api/v1/cloud-cache-probe');

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe(PRIVATE_NO_STORE);
  });

  it('marks Core API-key responses private and non-cacheable', async () => {
    const response = await createTestApp('core').request('/protected');

    expect(response.headers.get('Cache-Control')).toBe(PRIVATE_NO_STORE);
  });

  it('marks Cloud user principal responses private and non-cacheable', async () => {
    const response = await createTestApp('cloud').request('/protected');

    expect(response.headers.get('Cache-Control')).toBe(PRIVATE_NO_STORE);
  });

  it.each([
    '/api/v1/auth/login',
    '/api/v1/auth/callback/provider',
  ])('does not cache sensitive auth response %s before a principal exists', async (path) => {
    const response = await createTestApp().request(path, {
      method: path.endsWith('/login') ? 'POST' : 'GET',
    });

    expect(response.headers.get('Cache-Control')).toBe(PRIVATE_NO_STORE);
  });

  it('does not cache public share resolution so revocation takes effect immediately', async () => {
    const response = await createTestApp().request('/api/v1/share/share_token');

    expect(response.headers.get('Cache-Control')).toBe(PRIVATE_NO_STORE);
  });

  it.each([
    '/health',
    '/api/docs',
  ])('leaves unauthenticated public response %s outside the private policy', async (path) => {
    const response = await createTestApp().request(path);

    expect(response.headers.has('Cache-Control')).toBe(false);
  });

  it('preserves an explicit static asset cache policy', async () => {
    const response = await createTestApp('cloud').request('/assets/app.js');

    expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
  });

  it('preserves the SSE cache policy and stream content type', async () => {
    const response = await createTestApp('core').request('/events');

    expect(response.headers.get('Cache-Control')).toBe('no-cache');
    expect(response.headers.get('Content-Type')).toContain('text/event-stream');
    expect(await response.text()).toBe('data: ready\n\n');
  });

  it('keeps download headers and body while adding the private default', async () => {
    const response = await createTestApp('core').request('/download');

    expect(response.headers.get('Cache-Control')).toBe(PRIVATE_NO_STORE);
    expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="export.bin"');
    expect(await response.text()).toBe('private export');
  });

  it('protects credential-bearing error responses even without a resolved principal', async () => {
    const response = await createTestApp().request('/missing', {
      headers: { Authorization: 'Bearer invalid' },
    });

    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe(PRIVATE_NO_STORE);
  });
});
