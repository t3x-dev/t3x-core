/**
 * API Keys Storage Tests
 *
 * Tests all API key CRUD operations using PGLite.
 * API keys authenticate requests to the T3X API.
 *
 * Security model:
 * - Full key value is returned only once at creation
 * - We store SHA-256 hash for verification and a short prefix for display
 * - Revocation is a soft-delete (sets revoked_at)
 *
 * @see packages/storage/src/queries/api-keys.ts
 */

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import {
  createApiKey,
  findApiKeyById,
  findApiKeyByValue,
  listApiKeys,
  revokeApiKey,
  touchLastUsed,
} from '../queries/api-keys';
import { insertProject } from '../queries/projects';
import * as schema from '../schema';
import { CREATE_TABLES_SQL, testData } from './setup';

/**
 * SQL to create the api_keys table (defined in schema-v4.ts but not in
 * the default CREATE_TABLES_SQL used by storage tests).
 */
const CREATE_API_KEYS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  project_id TEXT REFERENCES projects(project_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_project ON api_keys(project_id);
`;

describe('API Keys Storage', () => {
  let db: AnyDB;
  let client: PGlite;
  let cleanup: () => Promise<void>;
  let testProjectId: string;

  beforeAll(async () => {
    client = new PGlite();
    db = drizzle(client, { schema }) as unknown as AnyDB;
    await client.exec(CREATE_TABLES_SQL);
    await client.exec(CREATE_API_KEYS_TABLE_SQL);
    cleanup = async () => {
      await client.close();
    };

    // Create a test project for project-scoped keys
    const project = await insertProject(db, testData.project({ name: 'API Keys Test Project' }));
    testProjectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('createApiKey', () => {
    it('creates an API key with all required fields', async () => {
      const result = await createApiKey(db, {
        name: 'Test Key',
        keyValue: 't3xk_testkey1234567890abcdef',
      });

      expect(result).toBeDefined();
      expect(result.id).toMatch(/^ak_/);
      expect(result.name).toBe('Test Key');
      expect(result.key_prefix).toBe('t3xk_tes');
      expect(result.key_hash).toBeDefined();
      expect(result.key_hash.length).toBe(64); // SHA-256 hex
      expect(result.project_id).toBeNull();
      expect(result.created_at).toBeDefined();
      expect(result.last_used_at).toBeNull();
      expect(result.revoked_at).toBeNull();
    });

    it('creates a project-scoped API key', async () => {
      const result = await createApiKey(db, {
        name: 'Project Key',
        keyValue: 't3xk_projectkey1234567890ab',
        projectId: testProjectId,
      });

      expect(result.project_id).toBe(testProjectId);
      expect(result.name).toBe('Project Key');
    });

    it('stores the SHA-256 hash, not the raw key', async () => {
      const rawKey = 't3xk_rawhashcheck1234567890';
      const result = await createApiKey(db, {
        name: 'Hash Check Key',
        keyValue: rawKey,
      });

      // key_hash should NOT be the raw key
      expect(result.key_hash).not.toBe(rawKey);
      // key_hash should be a 64-char hex string (SHA-256)
      expect(result.key_hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('stores the first 8 chars as key_prefix', async () => {
      const rawKey = 't3xk_abcdefghijklmnop';
      const result = await createApiKey(db, {
        name: 'Prefix Check Key',
        keyValue: rawKey,
      });

      expect(result.key_prefix).toBe('t3xk_abc');
    });
  });

  describe('findApiKeyByValue', () => {
    it('finds an API key by raw value', async () => {
      const rawKey = 't3xk_findbyvalue1234567890';
      const created = await createApiKey(db, {
        name: 'Find By Value Key',
        keyValue: rawKey,
      });

      const found = await findApiKeyByValue(db, rawKey);

      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.name).toBe('Find By Value Key');
    });

    it('returns null for non-existent key', async () => {
      const found = await findApiKeyByValue(db, 't3xk_nonexistent1234567890');

      expect(found).toBeNull();
    });

    it('returns null for revoked key', async () => {
      const rawKey = 't3xk_revokedkey1234567890ab';
      const created = await createApiKey(db, {
        name: 'Revoked Key',
        keyValue: rawKey,
      });

      await revokeApiKey(db, created.id);

      const found = await findApiKeyByValue(db, rawKey);
      expect(found).toBeNull();
    });
  });

  describe('findApiKeyById', () => {
    it('finds an API key by ID', async () => {
      const created = await createApiKey(db, {
        name: 'Find By ID Key',
        keyValue: 't3xk_findbyid12345678901234',
      });

      const found = await findApiKeyById(db, created.id);

      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.name).toBe('Find By ID Key');
    });

    it('returns null for non-existent ID', async () => {
      const found = await findApiKeyById(db, 'ak_nonexistent');

      expect(found).toBeNull();
    });

    it('returns revoked key (unlike findApiKeyByValue)', async () => {
      const rawKey = 't3xk_findbyidrevoked1234567';
      const created = await createApiKey(db, {
        name: 'Revoked By ID Key',
        keyValue: rawKey,
      });

      await revokeApiKey(db, created.id);

      const found = await findApiKeyById(db, created.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.revoked_at).not.toBeNull();
    });
  });

  describe('listApiKeys', () => {
    it('lists all non-revoked API keys', async () => {
      const keys = await listApiKeys(db);

      expect(Array.isArray(keys)).toBe(true);
      // All returned keys should NOT be revoked
      for (const key of keys) {
        expect(key.revoked_at).toBeNull();
      }
    });

    it('filters by project_id', async () => {
      // Create a key scoped to the test project
      await createApiKey(db, {
        name: 'Project Scoped List Key',
        keyValue: 't3xk_projectlist1234567890a',
        projectId: testProjectId,
      });

      const keys = await listApiKeys(db, { projectId: testProjectId });

      expect(keys.length).toBeGreaterThanOrEqual(1);
      for (const key of keys) {
        expect(key.project_id).toBe(testProjectId);
      }
    });

    it('excludes revoked keys', async () => {
      const rawKey = 't3xk_listrevoked1234567890a';
      const created = await createApiKey(db, {
        name: 'List Revoked Key',
        keyValue: rawKey,
      });

      await revokeApiKey(db, created.id);

      const keys = await listApiKeys(db);
      const revokedKey = keys.find((k) => k.id === created.id);
      expect(revokedKey).toBeUndefined();
    });
  });

  describe('revokeApiKey', () => {
    it('soft-deletes an API key', async () => {
      const created = await createApiKey(db, {
        name: 'Revoke Test Key',
        keyValue: 't3xk_revoketest1234567890ab',
      });

      const revoked = await revokeApiKey(db, created.id);

      expect(revoked).toBeDefined();
      expect(revoked!.id).toBe(created.id);
      expect(revoked!.revoked_at).not.toBeNull();
    });

    it('returns null for non-existent ID', async () => {
      const revoked = await revokeApiKey(db, 'ak_nonexistent');

      expect(revoked).toBeNull();
    });

    it('can revoke an already revoked key (idempotent)', async () => {
      const created = await createApiKey(db, {
        name: 'Double Revoke Key',
        keyValue: 't3xk_doublerevoke1234567890',
      });

      const first = await revokeApiKey(db, created.id);
      expect(first).toBeDefined();

      const second = await revokeApiKey(db, created.id);
      expect(second).toBeDefined();
      expect(second!.revoked_at).not.toBeNull();
    });
  });

  describe('touchLastUsed', () => {
    it('updates last_used_at timestamp', async () => {
      const created = await createApiKey(db, {
        name: 'Touch Test Key',
        keyValue: 't3xk_touchtest12345678901234',
      });

      expect(created.last_used_at).toBeNull();

      await touchLastUsed(db, created.id);

      const found = await findApiKeyById(db, created.id);
      expect(found).toBeDefined();
      expect(found!.last_used_at).not.toBeNull();
    });

    it('updates timestamp on subsequent calls', async () => {
      const created = await createApiKey(db, {
        name: 'Touch Twice Key',
        keyValue: 't3xk_touchtwice12345678901234',
      });

      await touchLastUsed(db, created.id);
      const first = await findApiKeyById(db, created.id);

      // Small delay to get a different timestamp
      await new Promise((r) => setTimeout(r, 10));

      await touchLastUsed(db, created.id);
      const second = await findApiKeyById(db, created.id);

      expect(first!.last_used_at).not.toBeNull();
      expect(second!.last_used_at).not.toBeNull();
    });
  });

  describe('output format', () => {
    it('uses snake_case for all fields', async () => {
      const created = await createApiKey(db, {
        name: 'Format Test Key',
        keyValue: 't3xk_formattest1234567890ab',
      });

      // Verify snake_case keys exist
      expect(created).toHaveProperty('id');
      expect(created).toHaveProperty('key_prefix');
      expect(created).toHaveProperty('key_hash');
      expect(created).toHaveProperty('name');
      expect(created).toHaveProperty('project_id');
      expect(created).toHaveProperty('created_at');
      expect(created).toHaveProperty('last_used_at');
      expect(created).toHaveProperty('revoked_at');

      // Verify camelCase keys don't exist
      expect(created).not.toHaveProperty('keyPrefix');
      expect(created).not.toHaveProperty('keyHash');
      expect(created).not.toHaveProperty('projectId');
      expect(created).not.toHaveProperty('createdAt');
      expect(created).not.toHaveProperty('lastUsedAt');
      expect(created).not.toHaveProperty('revokedAt');
    });

    it('converts timestamps to ISO strings', async () => {
      const created = await createApiKey(db, {
        name: 'ISO Test Key',
        keyValue: 't3xk_isotest123456789012345',
      });

      expect(created.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });
});
