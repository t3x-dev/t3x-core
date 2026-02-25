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

import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the db module
vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve({})),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// Mock @t3x/storage — the auth middleware dynamically imports this
vi.mock('@t3x/storage', () => ({
  findApiKeyByValue: vi.fn(),
  touchLastUsed: vi.fn(() => Promise.resolve()),
}));

import { findApiKeyByValue, touchLastUsed } from '@t3x/storage';
import { authMiddleware } from '../middleware/auth';

const mockFindApiKeyByValue = vi.mocked(findApiKeyByValue);
const mockTouchLastUsed = vi.mocked(touchLastUsed);

/**
 * Creates a test Hono app with the auth middleware applied.
 * The /health route is expected to be public (bypasses auth).
 */
function createTestApp() {
  const app = new Hono();
  app.use('*', authMiddleware);

  // Protected route
  app.get('/api/v1/projects', (c) => c.json({ success: true, data: [] }));
  // Public routes
  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.get('/api/docs', (c) => c.json({ docs: true }));
  app.get('/api/openapi.json', (c) => c.json({ openapi: '3.0' }));
  app.get('/api/v1/share/:token', (c) => c.json({ shared: true }));

  return app;
}

describe('Auth Middleware', () => {
  const originalEnv = process.env.AUTH_DISABLED;
  let app: Hono;

  beforeEach(() => {
    app = createTestApp();
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original env
    if (originalEnv !== undefined) {
      process.env.AUTH_DISABLED = originalEnv;
    } else {
      delete process.env.AUTH_DISABLED;
    }
  });

  describe('AUTH_DISABLED=true', () => {
    it('skips auth entirely when AUTH_DISABLED=true', async () => {
      process.env.AUTH_DISABLED = 'true';

      const res = await app.request('/api/v1/projects');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      // Should NOT call findApiKeyByValue
      expect(mockFindApiKeyByValue).not.toHaveBeenCalled();
    });
  });

  describe('public paths', () => {
    it('bypasses auth for /health', async () => {
      delete process.env.AUTH_DISABLED;

      const res = await app.request('/health');

      expect(res.status).toBe(200);
      expect(mockFindApiKeyByValue).not.toHaveBeenCalled();
    });

    it('bypasses auth for /api/docs', async () => {
      delete process.env.AUTH_DISABLED;

      const res = await app.request('/api/docs');

      expect(res.status).toBe(200);
      expect(mockFindApiKeyByValue).not.toHaveBeenCalled();
    });

    it('bypasses auth for /api/openapi.json', async () => {
      delete process.env.AUTH_DISABLED;

      const res = await app.request('/api/openapi.json');

      expect(res.status).toBe(200);
      expect(mockFindApiKeyByValue).not.toHaveBeenCalled();
    });

    it('bypasses auth for GET /api/v1/share/:token', async () => {
      delete process.env.AUTH_DISABLED;

      const res = await app.request('/api/v1/share/abc123');

      expect(res.status).toBe(200);
      expect(mockFindApiKeyByValue).not.toHaveBeenCalled();
    });
  });

  describe('missing Authorization header', () => {
    it('returns 401 when no Authorization header', async () => {
      delete process.env.AUTH_DISABLED;

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
      delete process.env.AUTH_DISABLED;

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
      delete process.env.AUTH_DISABLED;

      const res = await app.request('/api/v1/projects', {
        headers: {
          Authorization: 'Bearer ',
        },
      });

      expect(res.status).toBe(401);
    });
  });

  describe('valid API key', () => {
    it('passes through with valid API key', async () => {
      delete process.env.AUTH_DISABLED;

      const mockApiKey = {
        id: 'ak_test123',
        key_prefix: 't3xk_tes',
        key_hash: 'abc123hash',
        name: 'Test Key',
        project_id: null,
        created_at: new Date().toISOString(),
        last_used_at: null,
        revoked_at: null,
      };

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
      delete process.env.AUTH_DISABLED;

      const mockApiKey = {
        id: 'ak_extract123',
        key_prefix: 't3xk_ext',
        key_hash: 'def456hash',
        name: 'Extract Key',
        project_id: null,
        created_at: new Date().toISOString(),
        last_used_at: null,
        revoked_at: null,
      };

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
      delete process.env.AUTH_DISABLED;

      const mockApiKey = {
        id: 'ak_touch123',
        key_prefix: 't3xk_tou',
        key_hash: 'ghi789hash',
        name: 'Touch Key',
        project_id: null,
        created_at: new Date().toISOString(),
        last_used_at: null,
        revoked_at: null,
      };

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

  describe('invalid API key', () => {
    it('returns 401 for invalid API key', async () => {
      delete process.env.AUTH_DISABLED;

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
      delete process.env.AUTH_DISABLED;

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
