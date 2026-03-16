/**
 * Share Link Route Tests
 *
 * Integration tests for Share Link API endpoints.
 */

import { createLeaf, insertProject } from '@t3x-dev/storage';
import type { AnyDB } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiResponse = any;

// Mock the database module before importing routes
let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// Import routes after mocking
import { shareRoutes } from '../routes/share.openapi';

describe('Share Routes', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let testLeafId: string;
  const app = new Hono();
  app.route('/', shareRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    // Create a test project
    const project = await insertProject(mockDB, testData.project({ name: 'Share Test Project' }));
    testProjectId = project.projectId;

    // Create a test leaf (share links currently support leaf entity type)
    const leaf = await createLeaf(mockDB, {
      commit_hash: 'sha256:test_commit_hash_for_share',
      type: 'tweet',
      title: 'Test Shareable Leaf',
      project_id: testProjectId,
    });
    testLeafId = leaf.id;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('POST /v1/share', () => {
    it('creates a share token when entity exists', async () => {
      const res = await app.request('/v1/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: 'leaf',
          entity_id: testLeafId,
        }),
      });

      expect(res.status).toBe(201);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.id).toMatch(/^share_/);
      expect(data.data.token).toBeDefined();
      expect(data.data.token.length).toBeGreaterThan(0);
      expect(data.data.entity_type).toBe('leaf');
      expect(data.data.entity_id).toBe(testLeafId);
      expect(data.data.project_id).toBe(testProjectId);
      expect(data.data.created_at).toBeDefined();
      expect(data.data.revoked_at).toBeNull();
    });

    it('returns 404 when entity not found', async () => {
      const res = await app.request('/v1/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: 'leaf',
          entity_id: 'leaf_nonexistent_id',
        }),
      });

      expect(res.status).toBe(404);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('SHARE_ENTITY_NOT_FOUND');
    });

    it('returns 400 for missing required fields', async () => {
      const res = await app.request('/v1/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: 'leaf',
          // missing entity_id
        }),
      });

      expect(res.status).toBe(400);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
    });

    it('returns 400 for empty entity_id', async () => {
      const res = await app.request('/v1/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: 'leaf',
          entity_id: '',
        }),
      });

      expect(res.status).toBe(400);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
    });
  });

  describe('GET /v1/share/:token', () => {
    let createdToken: string;

    beforeAll(async () => {
      // Create a share token to test with
      const res = await app.request('/v1/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: 'leaf',
          entity_id: testLeafId,
        }),
      });
      const data: ApiResponse = await res.json();
      createdToken = data.data.token;
    });

    it('resolves a valid share token', async () => {
      const res = await app.request(`/v1/share/${createdToken}`);

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.token_info).toBeDefined();
      expect(data.data.token_info.token).toBe(createdToken);
      expect(data.data.token_info.entity_type).toBe('leaf');
      expect(data.data.token_info.entity_id).toBe(testLeafId);
      expect(data.data.entity).toBeDefined();
      expect(data.data.entity.id).toBe(testLeafId);
      expect(data.data.entity.title).toBe('Test Shareable Leaf');
    });

    it('returns 404 for invalid token', async () => {
      const res = await app.request('/v1/share/invalid_token_value_here');

      expect(res.status).toBe(404);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('SHARE_TOKEN_NOT_FOUND');
    });

    it('returns 404 for revoked token', async () => {
      // Create a new share token
      const createRes = await app.request('/v1/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: 'leaf',
          entity_id: testLeafId,
        }),
      });
      const createData: ApiResponse = await createRes.json();
      const tokenValue = createData.data.token;
      const tokenId = createData.data.id;

      // Revoke it
      await app.request(`/v1/share/${tokenId}`, {
        method: 'DELETE',
      });

      // Try to resolve the revoked token
      const res = await app.request(`/v1/share/${tokenValue}`);

      expect(res.status).toBe(404);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('SHARE_TOKEN_NOT_FOUND');
    });
  });

  describe('DELETE /v1/share/:id', () => {
    it('revokes a share token', async () => {
      // Create a share token
      const createRes = await app.request('/v1/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: 'leaf',
          entity_id: testLeafId,
        }),
      });
      const createData: ApiResponse = await createRes.json();
      const tokenId = createData.data.id;

      // Revoke it
      const res = await app.request(`/v1/share/${tokenId}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(tokenId);
      expect(data.data.revoked_at).not.toBeNull();
    });

    it('returns 404 for non-existent id', async () => {
      const res = await app.request('/v1/share/share_nonexistent_id', {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('SHARE_TOKEN_NOT_FOUND');
    });
  });

  describe('GET /v1/share/entity/:type/:id', () => {
    let entityLeafId: string;

    beforeAll(async () => {
      // Create a leaf specifically for list tests
      const leaf = await createLeaf(mockDB, {
        commit_hash: 'sha256:test_commit_hash_for_share',
        type: 'email',
        title: 'List Test Leaf',
        project_id: testProjectId,
      });
      entityLeafId = leaf.id;

      // Create multiple share tokens for this leaf
      for (let i = 0; i < 3; i++) {
        await app.request('/v1/share', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entity_type: 'leaf',
            entity_id: entityLeafId,
          }),
        });
      }
    });

    it('lists share tokens for an entity', async () => {
      const res = await app.request(`/v1/share/entity/leaf/${entityLeafId}`);

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBe(3);
      expect(data.data.every((t: ApiResponse) => t.entity_id === entityLeafId)).toBe(true);
      expect(data.data.every((t: ApiResponse) => t.entity_type === 'leaf')).toBe(true);
    });

    it('returns empty array for entity with no tokens', async () => {
      const res = await app.request('/v1/share/entity/leaf/leaf_no_tokens');

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toEqual([]);
    });

    it('excludes revoked tokens from list', async () => {
      // Create a leaf with known tokens
      const leaf = await createLeaf(mockDB, {
        commit_hash: 'sha256:test_commit_hash_for_share',
        type: 'article',
        title: 'Revoke List Test Leaf',
        project_id: testProjectId,
      });

      // Create 2 tokens
      const res1 = await app.request('/v1/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: 'leaf',
          entity_id: leaf.id,
        }),
      });
      const data1: ApiResponse = await res1.json();

      await app.request('/v1/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: 'leaf',
          entity_id: leaf.id,
        }),
      });

      // Revoke first token
      await app.request(`/v1/share/${data1.data.id}`, {
        method: 'DELETE',
      });

      // List should show only 1
      const listRes = await app.request(`/v1/share/entity/leaf/${leaf.id}`);
      const listData: ApiResponse = await listRes.json();

      expect(listData.success).toBe(true);
      expect(listData.data).toHaveLength(1);
      expect(listData.data[0].id).not.toBe(data1.data.id);
    });
  });
});
