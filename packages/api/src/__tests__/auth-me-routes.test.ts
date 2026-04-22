/**
 * Auth Me Routes Tests
 *
 * Integration tests for user profile endpoints.
 *
 * Endpoints tested:
 * - GET   /v1/auth/me  — Get current user + linked accounts
 * - PATCH /v1/auth/me  — Update profile (name, avatar_url)
 */

import { type AnyDB, createAccount, createUser } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB } from './setup';

/**
 * SQL to create users & accounts tables (V4 schema).
 * These are not included in the shared CREATE_TABLES_SQL used by the test setup.
 */
const CREATE_AUTH_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  name TEXT,
  avatar_url TEXT,
  username TEXT UNIQUE,
  password_hash TEXT,
  default_provider TEXT,
  default_model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_provider ON accounts(provider, provider_account_id);
`;

// biome-ignore lint/suspicious/noExplicitAny: test helper
type ApiResponse = any;

// Mock the database module before importing routes
let mockDB: AnyDB;
// biome-ignore lint/suspicious/noExplicitAny: test helper
let testSql: any;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// Import routes after mocking
import { authMeRoutes } from '../routes/auth-me.openapi';

describe('Auth Me Routes', () => {
  let cleanup: () => Promise<void>;
  let testUserId: string;

  // App with fake auth middleware that injects apiKey context
  function createAppWithAuth(userId: string | null) {
    const app = new Hono();
    app.use('*', async (c, next) => {
      if (userId) {
        // biome-ignore lint/suspicious/noExplicitAny: test mock access
        (c as any).set('apiKey', {
          user_id: userId,
          id: 'ak_test',
          key_prefix: 'test',
          key_hash: '',
          name: 'test',
          project_id: null,
          created_at: '',
          last_used_at: null,
          revoked_at: null,
        });
      }
      await next();
    });
    app.route('/', authMeRoutes);
    return app;
  }

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    testSql = setup.sql;
    cleanup = setup.cleanup;

    // Create auth tables (not included in the shared CREATE_TABLES_SQL)
    await testSql.unsafe(CREATE_AUTH_TABLES_SQL);

    // Create a test user
    const user = await createUser(mockDB, {
      name: 'Test User',
      email: 'test@example.com',
      avatar_url: 'https://example.com/avatar.png',
    });
    testUserId = user.id;

    // Link a GitHub account
    await createAccount(mockDB, {
      user_id: testUserId,
      provider: 'github',
      provider_account_id: '12345',
    });

    // Link a Google account
    await createAccount(mockDB, {
      user_id: testUserId,
      provider: 'google',
      provider_account_id: '67890',
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  // ============================================================
  // GET /v1/auth/me
  // ============================================================

  describe('GET /v1/auth/me', () => {
    it('returns user profile with linked accounts', async () => {
      const app = createAppWithAuth(testUserId);
      const res = await app.request('/v1/auth/me');

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(testUserId);
      expect(data.data.name).toBe('Test User');
      expect(data.data.email).toBe('test@example.com');
      expect(data.data.avatar_url).toBe('https://example.com/avatar.png');
      expect(data.data.default_provider).toBeNull();
      expect(data.data.default_model).toBeNull();

      // Verify linked_accounts
      expect(Array.isArray(data.data.linked_accounts)).toBe(true);
      expect(data.data.linked_accounts.length).toBe(2);

      const github = data.data.linked_accounts.find((a: ApiResponse) => a.provider === 'github');
      expect(github).toBeDefined();
      expect(github.provider_account_id).toBe('12345');
      expect(github.created_at).toBeDefined();

      const google = data.data.linked_accounts.find((a: ApiResponse) => a.provider === 'google');
      expect(google).toBeDefined();
      expect(google.provider_account_id).toBe('67890');
    });

    it('returns 401 when not authenticated', async () => {
      const app = createAppWithAuth(null);
      const res = await app.request('/v1/auth/me');

      expect(res.status).toBe(401);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 for non-existent user', async () => {
      const app = createAppWithAuth('user_nonexistent');
      const res = await app.request('/v1/auth/me');

      expect(res.status).toBe(401);
    });
  });

  // ============================================================
  // PATCH /v1/auth/me
  // ============================================================

  describe('PATCH /v1/auth/me', () => {
    it('updates name successfully', async () => {
      const app = createAppWithAuth(testUserId);
      const res = await app.request('/v1/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Name' }),
      });

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Updated Name');
      expect(data.data.id).toBe(testUserId);
      expect(data.data.email).toBe('test@example.com');
    });

    it('updates avatar_url successfully', async () => {
      const app = createAppWithAuth(testUserId);
      const res = await app.request('/v1/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar_url: 'https://example.com/new-avatar.png' }),
      });

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.avatar_url).toBe('https://example.com/new-avatar.png');
    });

    it('updates both name and avatar_url', async () => {
      const app = createAppWithAuth(testUserId);
      const res = await app.request('/v1/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Both Updated', avatar_url: 'https://example.com/both.png' }),
      });

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Both Updated');
      expect(data.data.avatar_url).toBe('https://example.com/both.png');
    });

    it('updates default provider and model successfully', async () => {
      const app = createAppWithAuth(testUserId);
      const res = await app.request('/v1/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_provider: 'openai', default_model: 'gpt-5.4' }),
      });

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.default_provider).toBe('openai');
      expect(data.data.default_model).toBe('gpt-5.4');
    });

    it('rejects unknown default model', async () => {
      const app = createAppWithAuth(testUserId);
      const res = await app.request('/v1/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_model: 'not-a-real-model' }),
      });

      expect(res.status).toBe(400);
      const data: ApiResponse = await res.json();
      expect(data.error.code).toBe('INVALID_MODEL');
    });

    it('rejects mismatched provider/model pairs', async () => {
      const app = createAppWithAuth(testUserId);
      const res = await app.request('/v1/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          default_provider: 'anthropic',
          default_model: 'gpt-5.4',
        }),
      });

      expect(res.status).toBe(400);
      const data: ApiResponse = await res.json();
      expect(data.error.code).toBe('MODEL_PROVIDER_MISMATCH');
    });

    it('returns 401 when not authenticated', async () => {
      const app = createAppWithAuth(null);
      const res = await app.request('/v1/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Should Fail' }),
      });

      expect(res.status).toBe(401);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 400 when no fields provided', async () => {
      const app = createAppWithAuth(testUserId);
      const res = await app.request('/v1/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });

    it('does not expose linked_accounts in update response', async () => {
      const app = createAppWithAuth(testUserId);
      const res = await app.request('/v1/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Check Response Shape' }),
      });

      const data: ApiResponse = await res.json();
      expect(data.data).not.toHaveProperty('linked_accounts');
    });
  });
});
