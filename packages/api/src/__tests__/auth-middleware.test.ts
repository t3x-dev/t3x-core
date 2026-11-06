/**
 * Auth Middleware Tests
 *
 * Tests the API key authentication middleware for Hono.
 *
 * Behavior:
 * - AUTH_DISABLED=true env var skips authentication
 * - Whitelisted paths bypass authentication
 * - Valid API key passes through
 * - Invalid/missing key returns 401
 */

import type { ApiKey } from '@t3x-dev/core';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the db module
vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve({})),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// Mock @t3x-dev/storage — the auth middleware dynamically imports this
vi.mock('@t3x-dev/storage', () => ({
  findActiveSessionByToken: vi.fn(),
  findApiKeyByValue: vi.fn(),
  touchSessionLastSeen: vi.fn(() => Promise.resolve()),
  touchLastUsed: vi.fn(() => Promise.resolve()),
}));

import {
  findActiveSessionByToken,
  findApiKeyByValue,
  touchLastUsed,
  touchSessionLastSeen,
} from '@t3x-dev/storage';
import { authMiddleware } from '../middleware/auth';
import type { AppEnv } from '../types';

const mockFindApiKeyByValue = vi.mocked(findApiKeyByValue);
const mockFindActiveSessionByToken = vi.mocked(findActiveSessionByToken);
const mockTouchLastUsed = vi.mocked(touchLastUsed);
const mockTouchSessionLastSeen = vi.mocked(touchSessionLastSeen);

/**
 * Creates a test Hono app with the auth middleware applied.
 * The /health route is expected to be public (bypasses auth).
 */
function apiKey(overrides: Partial<ApiKey> = {}): ApiKey {
  return {
    id: 'ak_test123',
    key_prefix: 't3xk_tes',
    key_hash: 'abc123hash',
    name: 'Test Key',
    user_id: null,
    project_id: null,
    namespace_id: null,
    principal_kind: 'human',
    credential_kind: 'api_key',
    delegator_user_id: null,
    transition_scopes: [],
    expires_at: null,
    created_at: new Date().toISOString(),
    last_used_at: null,
    revoked_at: null,
    revocation_reason: null,
    ...overrides,
  };
}

function createTestApp() {
  const app = new Hono<AppEnv>();
  app.use('*', authMiddleware);

  // Protected route
  app.get('/api/v1/projects', (c) =>
    c.json({ success: true, data: [], principal: c.get('requestPrincipal') ?? null })
  );
  // Public routes
  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.get('/api/docs', (c) => c.json({ docs: true }));
  app.get('/api/openapi.json', (c) => c.json({ openapi: '3.0' }));
  app.get('/api/v1/deployment/capabilities', (c) => c.json({ version: 1 }));
  app.get('/api/v1/share/:token', (c) => c.json({ shared: true }));
  app.post('/api/v1/runs/ingest', (c) =>
    c.json({ ingested: true, principal: c.get('requestPrincipal') ?? null })
  );
  app.get('/api/v1/runs/by-runner-id/:id', (c) =>
    c.json({ run: c.req.param('id'), principal: c.get('requestPrincipal') ?? null })
  );

  return app;
}

describe('Auth Middleware', () => {
  const originalEnv = process.env.AUTH_DISABLED;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAllowProductionAuthDisabled = process.env.T3X_ALLOW_AUTH_DISABLED_IN_PRODUCTION;
  const originalRunnerServiceToken = process.env.RUNNER_SERVICE_TOKEN;
  let app: Hono<AppEnv>;

  beforeEach(() => {
    app = createTestApp();
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original env
    if (originalEnv !== undefined) {
      process.env.AUTH_DISABLED = originalEnv;
    } else {
      process.env.AUTH_DISABLED = 'false';
    }
    if (originalNodeEnv !== undefined) {
      process.env.NODE_ENV = originalNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }
    if (originalAllowProductionAuthDisabled !== undefined) {
      process.env.T3X_ALLOW_AUTH_DISABLED_IN_PRODUCTION = originalAllowProductionAuthDisabled;
    } else {
      delete process.env.T3X_ALLOW_AUTH_DISABLED_IN_PRODUCTION;
    }
    if (originalRunnerServiceToken !== undefined) {
      process.env.RUNNER_SERVICE_TOKEN = originalRunnerServiceToken;
    } else {
      delete process.env.RUNNER_SERVICE_TOKEN;
    }
  });

  describe('Runner service routes', () => {
    it('enforces service auth even when human auth is disabled', async () => {
      process.env.AUTH_DISABLED = 'true';
      process.env.RUNNER_SERVICE_TOKEN = 'runner-test-secret';

      expect((await app.request('/api/v1/runs/ingest', { method: 'POST' })).status).toBe(401);
      const authenticated = await app.request('/api/v1/runs/ingest', {
        method: 'POST',
        headers: { Authorization: 'Bearer runner-test-secret' },
      });
      expect(authenticated.status).toBe(200);
      expect((await authenticated.json()).principal).toMatchObject({
        subject: { kind: 'service', principal_id: 'service:runner' },
        actor: { kind: 'service', id: 'service:runner' },
        ingress: 'runner',
      });
    });

    it('does not treat the Runner token as a general API key', async () => {
      process.env.AUTH_DISABLED = 'false';
      process.env.RUNNER_SERVICE_TOKEN = 'runner-test-secret';
      mockFindApiKeyByValue.mockResolvedValueOnce(null);

      const res = await app.request('/api/v1/projects', {
        headers: { Authorization: 'Bearer runner-test-secret' },
      });
      expect(res.status).toBe(401);
    });

    it('fails closed when service auth is not configured', async () => {
      process.env.AUTH_DISABLED = 'true';
      delete process.env.RUNNER_SERVICE_TOKEN;
      delete process.env.RUNNER_SECRET;
      const res = await app.request('/api/v1/runs/by-runner-id/runner_1');
      expect(res.status).toBe(503);
    });
  });

  describe('AUTH_DISABLED=true', () => {
    it('skips auth entirely when AUTH_DISABLED=true', async () => {
      process.env.AUTH_DISABLED = 'true';

      const res = await app.request('/api/v1/projects');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.principal).toMatchObject({
        subject: { kind: 'human', principal_id: 'local-user' },
        actor: { kind: 'human', id: 'human:local-user' },
        ingress: 'local',
      });

      // Should NOT call findApiKeyByValue
      expect(mockFindApiKeyByValue).not.toHaveBeenCalled();
    });

    it('requires an explicit production opt-in when NODE_ENV=production', async () => {
      process.env.AUTH_DISABLED = 'true';
      process.env.NODE_ENV = 'production';
      delete process.env.T3X_ALLOW_AUTH_DISABLED_IN_PRODUCTION;

      const blocked = await app.request('/api/v1/projects');
      expect(blocked.status).toBe(401);

      process.env.T3X_ALLOW_AUTH_DISABLED_IN_PRODUCTION = 'true';
      const allowed = await app.request('/api/v1/projects');

      expect(allowed.status).toBe(200);
      expect(mockFindApiKeyByValue).not.toHaveBeenCalled();
    });
  });

  describe('AUTH_DISABLED not set', () => {
    it('enforces auth when AUTH_DISABLED is not set (secure default)', async () => {
      delete process.env.AUTH_DISABLED;

      const res = await app.request('/api/v1/projects');

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('public paths', () => {
    it('bypasses auth for /health', async () => {
      process.env.AUTH_DISABLED = 'false';

      const res = await app.request('/health');

      expect(res.status).toBe(200);
      expect(mockFindApiKeyByValue).not.toHaveBeenCalled();
    });

    it('bypasses auth for /api/docs', async () => {
      process.env.AUTH_DISABLED = 'false';

      const res = await app.request('/api/docs');

      expect(res.status).toBe(200);
      expect(mockFindApiKeyByValue).not.toHaveBeenCalled();
    });

    it('bypasses auth for /api/openapi.json', async () => {
      process.env.AUTH_DISABLED = 'false';

      const res = await app.request('/api/openapi.json');

      expect(res.status).toBe(200);
      expect(mockFindApiKeyByValue).not.toHaveBeenCalled();
    });

    it('bypasses auth for public deployment capabilities', async () => {
      process.env.AUTH_DISABLED = 'false';

      const res = await app.request('/api/v1/deployment/capabilities');

      expect(res.status).toBe(200);
      expect(mockFindApiKeyByValue).not.toHaveBeenCalled();
    });

    it('bypasses auth for GET /api/v1/share/:token', async () => {
      process.env.AUTH_DISABLED = 'false';

      const res = await app.request('/api/v1/share/abc123');

      expect(res.status).toBe(200);
      expect(mockFindApiKeyByValue).not.toHaveBeenCalled();
    });
  });

  describe('missing Authorization header', () => {
    it('returns 401 when no Authorization header', async () => {
      process.env.AUTH_DISABLED = 'false';

      const res = await app.request('/api/v1/projects');

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('UNAUTHORIZED');
      expect(data.error.message).toContain('Missing Authorization header');
    });
  });

  describe('invalid Authorization header format', () => {
    it('returns 401 for malformed Authorization header', async () => {
      process.env.AUTH_DISABLED = 'false';

      const res = await app.request('/api/v1/projects', {
        headers: {
          Authorization: 'Basic dXNlcjpwYXNz',
        },
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('UNAUTHORIZED');
      expect(data.error.message).toContain('Invalid Authorization header format');
    });

    it('returns 401 for empty Bearer token', async () => {
      process.env.AUTH_DISABLED = 'false';

      const res = await app.request('/api/v1/projects', {
        headers: {
          Authorization: 'Bearer ',
        },
      });

      expect(res.status).toBe(401);
    });
  });

  describe('valid API key', () => {
    it('sets the complete server-derived principal', async () => {
      process.env.AUTH_DISABLED = 'false';
      mockFindApiKeyByValue.mockResolvedValueOnce(
        apiKey({
          id: 'ak_service',
          user_id: 'user_a',
          project_id: 'proj_a',
          principal_kind: 'service',
          credential_kind: 'service',
          delegator_user_id: 'user_a',
          transition_scopes: ['transition:inspect'],
        })
      );

      const response = await app.request('/api/v1/projects', {
        headers: { Authorization: 'Bearer service-key' },
      });

      expect(response.status).toBe(200);
      expect((await response.json()).principal).toMatchObject({
        subject: { kind: 'service', principal_id: 'ak_service' },
        actor: { kind: 'service', id: 'service:api-key:ak_service' },
        delegator: { kind: 'human', id: 'user:user_a' },
        workspaceOwner: { kind: 'human', principal_id: 'user_a' },
        credential: { kind: 'service', id: 'ak_service', projectId: 'proj_a', namespaceId: null },
        scopes: ['transition:inspect'],
        ingress: 'http',
      });
    });

    it.each([
      'Actor',
      'Owner',
      'Role',
      'Namespace',
      'Scopes',
    ])('rejects the reserved X-T3X-%s identity override header', async (header) => {
      process.env.AUTH_DISABLED = 'false';
      mockFindApiKeyByValue.mockResolvedValueOnce(apiKey());

      const response = await app.request('/api/v1/projects', {
        headers: { Authorization: 'Bearer valid-key', [`X-T3X-${header}`]: 'forged' },
      });

      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe('INVALID_REQUEST');
    });

    it('passes through with valid API key', async () => {
      process.env.AUTH_DISABLED = 'false';

      const mockApiKey = apiKey();

      mockFindApiKeyByValue.mockResolvedValueOnce(mockApiKey);

      const res = await app.request('/api/v1/projects', {
        headers: {
          Authorization: 'Bearer t3xk_testkey1234567890abcdef',
        },
      });

      expect(res.status).toBe(200);
      expect(mockFindApiKeyByValue).toHaveBeenCalledOnce();
    });

    it('extracts key value from Bearer token', async () => {
      process.env.AUTH_DISABLED = 'false';

      const mockApiKey = apiKey({
        id: 'ak_extract123',
        key_prefix: 't3xk_ext',
        key_hash: 'def456hash',
        name: 'Extract Key',
      });

      mockFindApiKeyByValue.mockResolvedValueOnce(mockApiKey);

      await app.request('/api/v1/projects', {
        headers: {
          Authorization: 'Bearer my_specific_key_value',
        },
      });

      // The middleware should extract 'my_specific_key_value' from the header
      expect(mockFindApiKeyByValue).toHaveBeenCalledWith(
        expect.anything(), // db instance
        'my_specific_key_value'
      );
    });

    it('calls touchLastUsed after successful auth', async () => {
      process.env.AUTH_DISABLED = 'false';

      const mockApiKey = apiKey({
        id: 'ak_touch123',
        key_prefix: 't3xk_tou',
        key_hash: 'ghi789hash',
        name: 'Touch Key',
      });

      mockFindApiKeyByValue.mockResolvedValueOnce(mockApiKey);
      mockTouchLastUsed.mockResolvedValueOnce(undefined);

      await app.request('/api/v1/projects', {
        headers: {
          Authorization: 'Bearer t3xk_touchkey1234567890abcdef',
        },
      });

      // touchLastUsed is called in the background
      expect(mockTouchLastUsed).toHaveBeenCalledWith(
        expect.anything(), // db instance
        'ak_touch123'
      );
    });
  });

  describe('valid browser session', () => {
    it('sets a human RequestPrincipal and touches only the session', async () => {
      process.env.AUTH_DISABLED = 'false';
      mockFindActiveSessionByToken.mockResolvedValueOnce({
        id: 'sess_browser',
        token_hash: 'hash',
        user_id: 'user_a',
        auth_method: 'local_password',
        user_agent: 'Test Browser',
        created_at: '2026-11-02T00:00:00.000Z',
        last_seen_at: '2026-11-02T00:00:00.000Z',
        expires_at: '2026-12-02T00:00:00.000Z',
        revoked_at: null,
      });

      const response = await app.request('/api/v1/projects', {
        headers: { Authorization: 'Bearer t3xs_browser_token' },
      });

      expect(response.status).toBe(200);
      expect((await response.json()).principal).toMatchObject({
        subject: { kind: 'human', principal_id: 'user_a' },
        sessionId: 'sess_browser',
        credential: { kind: 'session', id: 'sess_browser', projectId: null, namespaceId: null },
        ingress: 'http',
      });
      expect(mockFindApiKeyByValue).not.toHaveBeenCalled();
      expect(mockTouchSessionLastSeen).toHaveBeenCalledWith(expect.anything(), 'sess_browser');
      expect(mockTouchLastUsed).not.toHaveBeenCalled();
    });
  });

  describe('invalid API key', () => {
    it('returns 401 for invalid API key', async () => {
      process.env.AUTH_DISABLED = 'false';

      mockFindApiKeyByValue.mockResolvedValueOnce(null);

      const res = await app.request('/api/v1/projects', {
        headers: {
          Authorization: 'Bearer t3xk_invalid_key_value',
        },
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('UNAUTHORIZED');
      expect(data.error.message).toContain('Invalid API key');
    });
  });

  describe('database error handling', () => {
    it('returns 500 when database lookup fails', async () => {
      process.env.AUTH_DISABLED = 'false';

      mockFindApiKeyByValue.mockRejectedValueOnce(new Error('DB connection failed'));

      const res = await app.request('/api/v1/projects', {
        headers: {
          Authorization: 'Bearer t3xk_dberror1234567890abcdef',
        },
      });

      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INTERNAL_ERROR');
    });
  });
});
