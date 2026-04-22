/**
 * Extraction Style API Tests
 *
 * Tests for extraction_style on projects and default_extraction_style on users.
 */

import type { AnyDB } from '@t3x-dev/storage';
import { createUser, deleteProject, findProjects, insertProject } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

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
import { projectRoutes } from '../routes/projects.openapi';

/**
 * SQL to create users & accounts tables (V4 schema).
 * These may not be included in the shared CREATE_TABLES_SQL used by the test setup.
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
  default_extraction_style JSONB,
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

const VALID_STYLE = {
  granularity: 'balanced',
  quote_length: 'contextual',
  update_stance: 'conservative',
  tier3: 'extract',
};

describe('Extraction Style API', () => {
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    testSql = setup.sql;
    cleanup = setup.cleanup;

    // Ensure auth tables exist
    await testSql.unsafe(CREATE_AUTH_TABLES_SQL);
  });

  afterAll(async () => {
    await cleanup();
  });

  // ============================================================
  // Project extraction_style tests
  // ============================================================

  describe('Project extraction_style', () => {
    const app = new Hono();
    app.route('/', projectRoutes);

    beforeEach(async () => {
      // Clean up projects before each test
      const existingProjects = await findProjects(mockDB, {});
      for (const project of existingProjects) {
        await deleteProject(mockDB, project.projectId);
      }
    });

    it('PUT project with extraction_style -> GET returns it', async () => {
      const project = await insertProject(mockDB, testData.project({ name: 'Style Test' }));

      // PUT to set extraction_style
      const putRes = await app.request(`/v1/projects/${project.projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extraction_style: VALID_STYLE }),
      });

      expect(putRes.status).toBe(200);
      const putData: ApiResponse = await putRes.json();
      expect(putData.success).toBe(true);
      expect(putData.data.extraction_style).toEqual(VALID_STYLE);

      // GET to verify persistence
      const getRes = await app.request(`/v1/projects/${project.projectId}`);
      expect(getRes.status).toBe(200);

      const getData: ApiResponse = await getRes.json();
      expect(getData.success).toBe(true);
      expect(getData.data.extraction_style).toEqual(VALID_STYLE);
    });

    it('PUT project with extraction_style: null -> clears override', async () => {
      const project = await insertProject(mockDB, testData.project({ name: 'Clear Style' }));

      // Set a style first
      await app.request(`/v1/projects/${project.projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extraction_style: VALID_STYLE }),
      });

      // Clear it by setting to null
      const putRes = await app.request(`/v1/projects/${project.projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extraction_style: null }),
      });

      expect(putRes.status).toBe(200);
      const putData: ApiResponse = await putRes.json();
      expect(putData.success).toBe(true);
      expect(putData.data.extraction_style).toBeNull();

      // Verify via GET
      const getRes = await app.request(`/v1/projects/${project.projectId}`);
      const getData: ApiResponse = await getRes.json();
      expect(getData.data.extraction_style).toBeNull();
    });

    it('PUT project with invalid extraction_style -> returns 400', async () => {
      const project = await insertProject(mockDB, testData.project({ name: 'Invalid Style' }));

      const putRes = await app.request(`/v1/projects/${project.projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          extraction_style: {
            granularity: 'invalid_value',
            quote_length: 'contextual',
            update_stance: 'conservative',
            tier3: 'extract',
          },
        }),
      });

      expect(putRes.status).toBe(400);
    });
  });

  // ============================================================
  // User default_extraction_style tests
  // ============================================================

  describe('User default_extraction_style', () => {
    let testUserId: string;

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
      const user = await createUser(mockDB, {
        name: 'Style Test User',
        email: 'style-test@example.com',
        avatar_url: 'https://example.com/avatar.png',
      });
      testUserId = user.id;
    });

    it('PATCH /auth/me with default_extraction_style -> returns it', async () => {
      const app = createAppWithAuth(testUserId);
      const res = await app.request('/v1/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          default_extraction_style: VALID_STYLE,
        }),
      });

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.default_extraction_style).toEqual(VALID_STYLE);
    });

    it('PATCH /auth/me with only default_extraction_style (no name/avatar) -> succeeds', async () => {
      const app = createAppWithAuth(testUserId);
      const style = {
        granularity: 'concise' as const,
        quote_length: 'minimal' as const,
        update_stance: 'aggressive' as const,
        tier3: 'skip' as const,
      };

      const res = await app.request('/v1/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_extraction_style: style }),
      });

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.default_extraction_style).toEqual(style);
    });

    it('GET /auth/me returns default_extraction_style', async () => {
      const app = createAppWithAuth(testUserId);

      // First set a style
      await app.request('/v1/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_extraction_style: VALID_STYLE }),
      });

      // Then GET and verify
      const res = await app.request('/v1/auth/me');
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.default_extraction_style).toEqual(VALID_STYLE);
    });

    it('PATCH /auth/me with default_extraction_style: null -> clears it', async () => {
      const app = createAppWithAuth(testUserId);

      // Set then clear
      await app.request('/v1/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_extraction_style: VALID_STYLE }),
      });

      const res = await app.request('/v1/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_extraction_style: null }),
      });

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.default_extraction_style).toBeNull();
    });
  });
});
