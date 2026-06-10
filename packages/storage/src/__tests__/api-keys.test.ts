/**
 * API Keys Storage Tests
 *
 * Tests all API key CRUD operations.
 * API keys authenticate requests to the T3X API.
 *
 * Security model:
 * - Full key value is returned only once at creation
 * - We store SHA-256 hash for verification and a short prefix for display
 * - Revocation is a soft-delete (sets revoked_at)
 *
 * @see packages/storage/src/queries/api-keys.ts
 */

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
import { createTestDB, testData } from './setup';

const testApiKey = (suffix: string) => `t3xk_${suffix}`;

describe('API Keys Storage', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;
  let testProjectId: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;

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
        keyValue: testApiKey('testkey1234567890abcdef'),
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
        keyValue: testApiKey('projectkey1234567890ab'),
        projectId: testProjectId,
      });

      expect(result.project_id).toBe(testProjectId);
      expect(result.name).toBe('Project Key');
    });

    it('stores the SHA-256 hash, not the raw key', async () => {
      const rawKey = testApiKey('rawhashcheck1234567890');
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
      const rawKey = testApiKey('abcdefghijklmnop');
      const result = await createApiKey(db, {
        name: 'Prefix Check Key',
        keyValue: rawKey,
      });

      expect(result.key_prefix).toBe('t3xk_abc');
    });
  });

  describe('findApiKeyByValue', () => {
    it('finds an API key by raw value', async () => {
      const rawKey = testApiKey('findbyvalue1234567890');
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
      const found = await findApiKeyByValue(db, testApiKey('nonexistent1234567890'));

      expect(found).toBeNull();
    });

    it('returns null for revoked key', async () => {
      const rawKey = testApiKey('revokedkey1234567890ab');
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
        keyValue: testApiKey('findbyid12345678901234'),
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
      const rawKey = testApiKey('findbyidrevoked1234567');
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
        keyValue: testApiKey('projectlist1234567890a'),
        projectId: testProjectId,
      });

      const keys = await listApiKeys(db, { projectId: testProjectId });

      expect(keys.length).toBeGreaterThanOrEqual(1);
      for (const key of keys) {
        expect(key.project_id).toBe(testProjectId);
      }
    });

    it('excludes revoked keys', async () => {
      const rawKey = testApiKey('listrevoked1234567890a');
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
        keyValue: testApiKey('revoketest1234567890ab'),
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
        keyValue: testApiKey('doublerevoke1234567890'),
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
        keyValue: testApiKey('touchtest12345678901234'),
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
        keyValue: testApiKey('touchtwice12345678901234'),
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
        keyValue: testApiKey('formattest1234567890ab'),
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
        keyValue: testApiKey('isotest123456789012345'),
      });

      expect(created.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });
});
