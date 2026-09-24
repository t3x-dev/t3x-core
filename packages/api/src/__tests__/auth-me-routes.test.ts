/**
 * Auth Me Routes Tests
 *
 * Integration tests for user profile endpoints.
 *
 * Endpoints tested:
 * - GET   /v1/auth/me  — Get current user + linked accounts
 * - PATCH /v1/auth/me  — Update profile (name, avatar_url)
 */

import { type AnyDB, createAccount, createApiKey, createUser } from '@t3x-dev/storage';
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

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  project_id TEXT REFERENCES projects(project_id) ON DELETE CASCADE,
  user_id TEXT,
  principal_kind TEXT NOT NULL DEFAULT 'human',
  transition_scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
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
  function createAppWithAuth(userId: string | null, apiKeyId = 'ak_test') {
    const app = new Hono();
    app.use('*', async (c, next) => {
      if (userId) {
        // biome-ignore lint/suspicious/noExplicitAny: test mock access
        (c as any).set('apiKey', {
          user_id: userId,
          id: apiKeyId,
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

  describe('personal model preferences', () => {
    it('persists quick switcher preferences and updates the runtime account default', async () => {
      const app = createAppWithAuth(testUserId);
      const preferences = {
        compose_default: 'gpt-5.4',
        fallback_model: 'claude-sonnet-4-6',
        quick_switcher: [
          { model: 'gpt-5.4', visible: true },
          { model: 'claude-sonnet-4-6', visible: true },
          { model: 'gemini-2.5-pro', visible: false },
        ],
      };

      const putRes = await app.request('/v1/auth/me/model-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preferences),
      });
      expect(putRes.status).toBe(200);

      const getRes = await app.request('/v1/auth/me/model-preferences');
      const getJson: ApiResponse = await getRes.json();
      expect(getJson.data.compose_default).toBe('gpt-5.4');
      expect(getJson.data.quick_switcher).toEqual(
        preferences.quick_switcher.map((item) => ({ ...item, available: true }))
      );

      const meRes = await app.request('/v1/auth/me');
      const meJson: ApiResponse = await meRes.json();
      expect(meJson.data.default_provider).toBe('openai');
      expect(meJson.data.default_model).toBe('gpt-5.4');
    });

    it('rejects duplicate quick switcher models', async () => {
      const app = createAppWithAuth(testUserId);
      const res = await app.request('/v1/auth/me/model-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          compose_default: 'gpt-5.4',
          fallback_model: null,
          quick_switcher: [
            { model: 'gpt-5.4', visible: true },
            { model: 'gpt-5.4', visible: false },
          ],
        }),
      });

      expect(res.status).toBe(400);
      const json: ApiResponse = await res.json();
      expect(json.error.code).toBe('INVALID_MODEL_PREFERENCES');
    });
  });

  describe('profile settings', () => {
    it('persists personal details and returns real session credentials', async () => {
      const currentSession = await createApiKey(mockDB, {
        name: `session:${testUserId}`,
        userId: testUserId,
        keyValue: `t3x-profile-current-${Date.now()}`,
      });
      const app = createAppWithAuth(testUserId, currentSession.id);

      const patchRes = await app.request('/v1/auth/me/profile-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Jordan Diaz', timezone: 'America/Los_Angeles' }),
      });
      expect(patchRes.status).toBe(200);
      const patchJson: ApiResponse = await patchRes.json();
      expect(patchJson.data.name).toBe('Jordan Diaz');
      expect(patchJson.data.timezone).toBe('America/Los_Angeles');
      expect(patchJson.data.sessions).toContainEqual(
        expect.objectContaining({ id: currentSession.id, current: true })
      );

      const getRes = await app.request('/v1/auth/me/profile-settings');
      const getJson: ApiResponse = await getRes.json();
      expect(getJson.data.timezone).toBe('America/Los_Angeles');
    });

    it('revokes another owned session', async () => {
      const otherSession = await createApiKey(mockDB, {
        name: `session:${testUserId}`,
        userId: testUserId,
        keyValue: `t3x-profile-other-${Date.now()}`,
      });
      const app = createAppWithAuth(testUserId);
      const res = await app.request(`/v1/auth/me/profile-settings/sessions/${otherSession.id}`, {
        method: 'DELETE',
      });
      expect(res.status).toBe(200);

      const getRes = await app.request('/v1/auth/me/profile-settings');
      const getJson: ApiResponse = await getRes.json();
      expect(
        getJson.data.sessions.some((session: ApiResponse) => session.id === otherSession.id)
      ).toBe(false);
    });
  });
});
