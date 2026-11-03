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

import {
  type AnyDB,
  findApiKeyById,
  insertPersonalNamespace,
  insertProject,
} from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

/**
 * SQL to create the api_keys table (defined in schema-frames.ts but not
 * in CREATE_TABLES_SQL used by the test setup).
 */
const CREATE_API_KEYS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  project_id TEXT REFERENCES projects(project_id) ON DELETE CASCADE,
  namespace_id TEXT REFERENCES namespaces(namespace_id) ON DELETE CASCADE,
  user_id TEXT,
  principal_kind TEXT NOT NULL DEFAULT 'human',
  credential_kind TEXT NOT NULL DEFAULT 'api_key',
  delegator_user_id TEXT,
  transition_scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  CHECK (principal_kind IN ('human', 'agent', 'service')),
  CHECK (credential_kind IN ('api_key', 'pat', 'mcp', 'agent', 'service')),
  CHECK (project_id IS NULL OR namespace_id IS NULL),
  CHECK (principal_kind = 'human' OR project_id IS NOT NULL),
  CHECK (jsonb_typeof(transition_scopes) = 'array'),
  CHECK (transition_scopes <@ '["transition:propose","transition:inspect","transition:verify","transition:statement:issue","transition:decide:accept","transition:decide:override","transition:decide:reject","transition:commit:create","transition:ref:advance"]'::jsonb),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revocation_reason TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_project ON api_keys(project_id);
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
import { apiKeysRoutes } from '../routes/api-keys.openapi';

describe('API Key Routes', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let testNamespaceId: string;
  const app = new Hono();
  app.route('/', apiKeysRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    testSql = setup.sql;
    cleanup = setup.cleanup;

    // Create api_keys table (not included in the shared CREATE_TABLES_SQL)
    await testSql.unsafe(CREATE_API_KEYS_TABLE_SQL);

    // Create a canonically namespaced test project.
    const namespace = await insertPersonalNamespace(mockDB, {
      slug: 'api-key-route-owner',
      ownerUserId: 'user_api_key_route_owner',
    });
    testNamespaceId = namespace.namespaceId;
    const project = await insertProject(mockDB, {
      ...testData.project({ name: 'API Keys Route Test' }),
      namespaceId: namespace.namespaceId,
    });
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
      expect(data.data.namespace_id).toBeNull();
      expect(data.data.principal_kind).toBe('human');
      expect(data.data.credential_kind).toBe('api_key');
      expect(data.data.transition_scopes).toEqual([]);
      expect(data.data.expires_at).toBeNull();
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

    it('creates a project-scoped agent credential with explicit scopes', async () => {
      const res = await app.request('/v1/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Device Agent',
          project_id: testProjectId,
          principal_kind: 'agent',
          transition_scopes: ['transition:propose', 'transition:inspect'],
        }),
      });

      expect(res.status).toBe(201);
      const data: ApiResponse = await res.json();
      expect(data.data).toMatchObject({
        principal_kind: 'agent',
        project_id: testProjectId,
        transition_scopes: ['transition:inspect', 'transition:propose'],
      });
    });

    it('creates an expiring project-scoped MCP credential', async () => {
      const expiresAt = '2030-01-01T00:00:00.000Z';
      const res = await app.request('/v1/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'MCP Service',
          project_id: testProjectId,
          principal_kind: 'service',
          credential_kind: 'mcp',
          expires_at: expiresAt,
          transition_scopes: ['transition:inspect'],
        }),
      });

      expect(res.status).toBe(201);
      const data: ApiResponse = await res.json();
      expect(data.data).toMatchObject({
        project_id: testProjectId,
        namespace_id: null,
        principal_kind: 'service',
        credential_kind: 'mcp',
        expires_at: expiresAt,
      });
    });

    it('binds a browser-created MCP credential to its human owner and delegator', async () => {
      const sessionApp = new Hono();
      sessionApp.use('*', async (c, next) => {
        c.set('requestPrincipal', {
          subject: { kind: 'human', principal_id: 'user_api_key_route_owner' },
          actor: { kind: 'human', id: 'user:user_api_key_route_owner' },
          delegator: null,
          workspaceOwner: { kind: 'human', principal_id: 'user_api_key_route_owner' },
          userId: 'user_api_key_route_owner',
          accountId: null,
          sessionId: 'sess_owner',
          credential: { kind: 'session', id: 'sess_owner', projectId: null, namespaceId: null },
          scopes: [],
          ingress: 'http',
        });
        await next();
      });
      sessionApp.route('/', apiKeysRoutes);

      const res = await sessionApp.request('/v1/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Owned MCP',
          project_id: testProjectId,
          principal_kind: 'service',
          credential_kind: 'mcp',
        }),
      });

      expect(res.status).toBe(201);
      const data: ApiResponse = await res.json();
      expect(data.data.delegator_user_id).toBe('user_api_key_route_owner');
      await expect(findApiKeyById(mockDB, data.data.id)).resolves.toMatchObject({
        user_id: 'user_api_key_route_owner',
        delegator_user_id: 'user_api_key_route_owner',
      });
    });

    it('creates a namespace-scoped human PAT', async () => {
      const res = await app.request('/v1/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Namespace PAT',
          namespace_id: testNamespaceId,
          credential_kind: 'pat',
        }),
      });

      expect(res.status).toBe(201);
      const data: ApiResponse = await res.json();
      expect(data.data).toMatchObject({
        project_id: null,
        namespace_id: testNamespaceId,
        principal_kind: 'human',
        credential_kind: 'pat',
      });
    });

    it('rejects every unscoped machine credential', async () => {
      const res = await app.request('/v1/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Unsafe Agent',
          principal_kind: 'agent',
          transition_scopes: ['transition:inspect'],
        }),
      });

      expect(res.status).toBe(400);
      const data: ApiResponse = await res.json();
      expect(data.error.code).toBe('INVALID_REQUEST');
    });

    it('rejects a credential with both project and namespace scope', async () => {
      const res = await app.request('/v1/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Ambiguous scope',
          project_id: testProjectId,
          namespace_id: testNamespaceId,
        }),
      });

      expect(res.status).toBe(400);
    });

    it('rejects unknown scopes and caller-supplied authority fields', async () => {
      const unknownScope = await app.request('/v1/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Unknown Scope',
          transition_scopes: ['transition:admin'],
        }),
      });
      expect(unknownScope.status).toBe(400);

      const suppliedActor = await app.request('/v1/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Spoofed Actor',
          actor: { kind: 'service', id: 'service:root' },
        }),
      });
      expect(suppliedActor.status).toBe(400);
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

    it('does not let agent credentials administer API keys', async () => {
      const agentApp = new Hono();
      agentApp.use('*', async (c, next) => {
        c.set('apiKey', {
          id: 'ak_agent_admin_attempt',
          key_prefix: 't3xk_age',
          key_hash: 'hash',
          name: 'Agent',
          project_id: testProjectId,
          user_id: null,
          principal_kind: 'agent',
          transition_scopes: ['transition:inspect'],
          created_at: new Date().toISOString(),
          last_used_at: null,
          revoked_at: null,
        });
        await next();
      });
      agentApp.route('/', apiKeysRoutes);

      const res = await agentApp.request('/v1/api-keys');
      expect(res.status).toBe(403);
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
      expect(data.data.revocation_reason).toBe('manual');
    });

    it('records an explicit revocation reason', async () => {
      const createRes = await app.request('/v1/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Rotated Key' }),
      });
      const createData: ApiResponse = await createRes.json();

      const res = await app.request(`/v1/api-keys/${createData.data.id}?reason=rotated`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);
      expect((await res.json()).data.revocation_reason).toBe('rotated');
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
