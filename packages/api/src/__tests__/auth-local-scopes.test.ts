import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({
  createApiKey: vi.fn(),
  createLocalUser: vi.fn(),
  findUserByUsername: vi.fn(),
}));

vi.mock('@t3x-dev/storage', () => storage);
vi.mock('../lib/db', () => ({ getDB: vi.fn().mockResolvedValue({}) }));
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

const EXPECTED_SESSION_SCOPES = [
  'transition:inspect',
  'transition:propose',
  'transition:verify',
  'transition:decide:accept',
  'transition:decide:reject',
  'transition:commit:create',
  'transition:ref:advance',
];

function createTestApp() {
  const app = new Hono();
  app.route('/', authLocalRoutes);
  return app;
}

describe('local auth session scopes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('grants a registered Web session the ordinary Transition scopes', async () => {
    storage.findUserByUsername.mockResolvedValue(null);
    storage.createLocalUser.mockResolvedValue({
      id: 'user_a',
      name: 'Test A',
      username: 'test-a2',
    });

    const response = await createTestApp().request('/v1/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'test-a2', password: 'test-password-123' }),
    });

    expect(response.status).toBe(200);
    expect(storage.createApiKey).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ transitionScopes: EXPECTED_SESSION_SCOPES })
    );
  });

  it('grants a login Web session the same ordinary Transition scopes', async () => {
    storage.findUserByUsername.mockResolvedValue({
      id: 'user_b',
      name: 'Test B',
      username: 'test-b2',
      passwordHash: 'password-hash',
    });

    const response = await createTestApp().request('/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'test-b2', password: 'test-password-123' }),
    });

    expect(response.status).toBe(200);
    expect(storage.createApiKey).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ transitionScopes: EXPECTED_SESSION_SCOPES })
    );
  });
});
