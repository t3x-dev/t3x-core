import type { RequestPrincipal } from '@t3x-dev/application';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({
  createLocalUser: vi.fn(),
  createSession: vi.fn(),
  findUserByUsername: vi.fn(),
  revokeSession: vi.fn(),
}));
const realtime = vi.hoisted(() => ({ disconnectSession: vi.fn() }));

vi.mock('@t3x-dev/storage', () => storage);
vi.mock('../lib/db', () => ({ getDB: vi.fn().mockResolvedValue({}) }));
vi.mock('../lib/room-manager', () => ({ roomManager: realtime }));
vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('password-hash'),
    compare: vi.fn().mockResolvedValue(true),
  },
}));
vi.mock('../middleware/rate-limit', () => ({
  RATE_LIMIT_POLICIES: {
    registerIp: { scope: 'register-ip', limit: 5, windowMs: 60_000 },
    loginUsername: { scope: 'login-username', limit: 10, windowMs: 60_000 },
  },
  consumeRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    count: 1,
    remaining: 4,
    resetAt: Date.now() + 60_000,
  }),
  getRequestRateLimitStore: vi.fn().mockReturnValue({}),
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
  applyRateLimitHeaders: vi.fn(),
}));

import { authLocalRoutes } from '../routes/auth-local.openapi';
import type { AppEnv } from '../types';

function createTestApp(principal?: RequestPrincipal) {
  const app = new Hono<AppEnv>();
  if (principal) {
    app.use('*', async (c, next) => {
      c.set('requestPrincipal', principal);
      await next();
    });
  }
  app.route('/', authLocalRoutes);
  return app;
}

describe('local auth session lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a fixed-expiry browser session when registering', async () => {
    storage.findUserByUsername.mockResolvedValue(null);
    storage.createLocalUser.mockResolvedValue({
      id: 'user_a',
      name: 'Test A',
      username: 'test-a2',
    });

    const response = await createTestApp().request('/v1/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'Test Browser A' },
      body: JSON.stringify({ username: 'test-a2', password: 'test-password-123' }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.api_key).toMatch(/^t3xs_/);
    expect(storage.createSession).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        rawToken: body.data.api_key,
        userId: 'user_a',
        authMethod: 'local_password',
        userAgent: 'Test Browser A',
        expiresAt: expect.any(Date),
      })
    );
  });

  it('creates a fixed-expiry browser session when logging in', async () => {
    storage.findUserByUsername.mockResolvedValue({
      id: 'user_b',
      name: 'Test B',
      username: 'test-b2',
      passwordHash: 'password-hash',
    });

    const response = await createTestApp().request('/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'Test Browser B' },
      body: JSON.stringify({ username: 'test-b2', password: 'test-password-123' }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.api_key).toMatch(/^t3xs_/);
    expect(storage.createSession).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        rawToken: body.data.api_key,
        userId: 'user_b',
        authMethod: 'local_password',
        userAgent: 'Test Browser B',
        expiresAt: expect.any(Date),
      })
    );
  });

  it('revokes the authenticated browser session on logout', async () => {
    storage.revokeSession.mockResolvedValue({ id: 'sess_browser' });
    const principal: RequestPrincipal = {
      subject: { kind: 'human', principal_id: 'user_a' },
      actor: { kind: 'human', id: 'user:user_a' },
      delegator: null,
      workspaceOwner: { kind: 'human', principal_id: 'user_a' },
      userId: 'user_a',
      accountId: null,
      sessionId: 'sess_browser',
      credential: { kind: 'session', id: 'sess_browser', projectId: null, namespaceId: null },
      scopes: [],
      ingress: 'http',
    };

    const response = await createTestApp(principal).request('/v1/auth/logout', {
      method: 'POST',
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: { logged_out: true } });
    expect(storage.revokeSession).toHaveBeenCalledWith(expect.anything(), 'sess_browser', 'user_a');
    expect(realtime.disconnectSession).toHaveBeenCalledWith('sess_browser');
  });
});
