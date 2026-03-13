/**
 * API Key Routes Tests
 *
 * Integration tests for API key management endpoints.
 *
 * Endpoints tested:
 * - POST   /v1/api-keys     — Create a new API key
 * - GET    /v1/api-keys     — List API keys
 * - DELETE /v1/api-keys/:id — Revoke an API key
 */

import { insertProject } from '@t3x-dev/storage';
import { getPGLiteClient, type PGLiteDB } from '@t3x-dev/storage/pglite';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

/**
 * SQL to create the api_keys table (defined in schema-v4.ts but not
 * in the PGLite adapter's initializeSchema).
 */
const CREATE_API_KEYS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  project_id TEXT REFERENCES projects(project_id) ON DELETE CASCADE,
  user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_project ON api_keys(project_id);
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiResponse = any;

// Mock the database module before importing routes
let mockDB: PGLiteDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// Import routes after mocking
import { apiKeysRoutes } from '../routes/api-keys.openapi';

describe('API Key Routes', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  const app = new Hono();
  app.route('/', apiKeysRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    // Create api_keys table (not included in PGLite adapter's initializeSchema)
    const client = getPGLiteClient();
    await client.exec(CREATE_API_KEYS_TABLE_SQL);

    // Create a test project
    const project = await insertProject(mockDB, testData.project({ name: 'API Keys Route Test' }));
    testProjectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('POST /v1/api-keys', () => {
    it('creates a new API key', async () => {
      const res = await app.request('/v1/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'My Test API Key',
        }),
      });

      expect(res.status).toBe(201);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.id).toMatch(/^ak_/);
      expect(data.data.key).toMatch(/^t3xk_/);
      expect(data.data.key_prefix).toBeDefined();
      expect(data.data.name).toBe('My Test API Key');
      expect(data.data.project_id).toBeNull();
      expect(data.data.created_at).toBeDefined();
    });

    it('creates a project-scoped API key', async () => {
      const res = await app.request('/v1/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Project Scoped Key',
          project_id: testProjectId,
        }),
      });

      expect(res.status).toBe(201);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.project_id).toBe(testProjectId);
    });

    it('returns the full key value only at creation', async () => {
      const res = await app.request('/v1/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Full Key Value Test',
        }),
      });

      const data: ApiResponse = await res.json();
      expect(data.data.key).toBeDefined();
      expect(data.data.key.length).toBeGreaterThan(8); // Full key, not just prefix

      // Verify the key_prefix is the start of the full key
      expect(data.data.key.startsWith(data.data.key_prefix)).toBe(true);
    });

    it('returns 400 for missing name', async () => {
      const res = await app.request('/v1/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
    });

    it('returns 400 for empty name', async () => {
      const res = await app.request('/v1/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '',
        }),
      });

      expect(res.status).toBe(400);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
    });
  });

  describe('GET /v1/api-keys', () => {
    it('lists all non-revoked API keys', async () => {
      // Create a key first
      await app.request('/v1/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'List Test Key' }),
      });

      const res = await app.request('/v1/api-keys');

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeGreaterThanOrEqual(1);

      // Verify the response does NOT include the full key value
      for (const key of data.data) {
        expect(key).not.toHaveProperty('key'); // Full key only shown at creation
        expect(key).toHaveProperty('key_prefix');
        expect(key).toHaveProperty('id');
        expect(key).toHaveProperty('name');
      }
    });

    it('filters by project_id', async () => {
      // Create a project-scoped key
      await app.request('/v1/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Project Filter Test Key',
          project_id: testProjectId,
        }),
      });

      const res = await app.request(`/v1/api-keys?project_id=${testProjectId}`);

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      for (const key of data.data) {
        expect(key.project_id).toBe(testProjectId);
      }
    });
  });

  describe('DELETE /v1/api-keys/:id', () => {
    it('revokes an API key', async () => {
      // Create a key first
      const createRes = await app.request('/v1/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Revoke Test Key' }),
      });
      const createData: ApiResponse = await createRes.json();
      const keyId = createData.data.id;

      // Revoke the key
      const res = await app.request(`/v1/api-keys/${keyId}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(keyId);
      expect(data.data.revoked_at).not.toBeNull();
    });

    it('returns 404 for non-existent API key', async () => {
      const res = await app.request('/v1/api-keys/ak_nonexistent123', {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('API_KEY_NOT_FOUND');
    });

    it('revoked key no longer appears in list', async () => {
      // Create a key
      const createRes = await app.request('/v1/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Revoke List Test Key' }),
      });
      const createData: ApiResponse = await createRes.json();
      const keyId = createData.data.id;

      // Revoke
      await app.request(`/v1/api-keys/${keyId}`, { method: 'DELETE' });

      // List
      const listRes = await app.request('/v1/api-keys');
      const listData: ApiResponse = await listRes.json();

      const revokedKey = listData.data.find((k: ApiResponse) => k.id === keyId);
      expect(revokedKey).toBeUndefined();
    });
  });
});
