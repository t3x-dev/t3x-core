/**
 * Pins Route Tests
 *
 * Integration tests for Pins CRUD API endpoints.
 */

import { createLeaf, insertConversation, insertProject } from '@t3x/storage';
import type { PGLiteDB } from '@t3x/storage/pglite';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiResponse = any;

// Mock the database module before importing routes
let mockDB: PGLiteDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// Import routes after mocking
import { pinsRoutes } from '../routes/pins.openapi';

describe('Pins Routes', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let testConversationId: string;
  let testLeafId: string;
  const app = new Hono();
  app.route('/', pinsRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    // Create a test project
    const project = await insertProject(mockDB, testData.project({ name: 'Pins Test Project' }));
    testProjectId = project.projectId;

    // Create a test conversation (for conversation pins)
    const conversation = await insertConversation(mockDB, {
      projectId: testProjectId,
      title: 'Test Conversation for Pins',
    });
    testConversationId = conversation.conversationId;

    // Create a test leaf (for leaf pins)
    const leaf = await createLeaf(mockDB, {
      commit_hash: 'sha256:test_commit_hash_for_pins',
      type: 'tweet',
      title: 'Test Leaf for Pins',
      project_id: testProjectId,
    });
    testLeafId = leaf.id;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('POST /v1/projects/:projectId/pins', () => {
    it('creates a conversation pin', async () => {
      const res = await app.request(`/v1/projects/${testProjectId}/pins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'conversation',
          ref_id: testConversationId,
        }),
      });

      expect(res.status).toBe(201);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.id).toMatch(/^pin_/);
      expect(data.data.project_id).toBe(testProjectId);
      expect(data.data.type).toBe('conversation');
      expect(data.data.ref_id).toBe(testConversationId);
      expect(data.data.selected_assertion_ids).toBeNull();
      expect(data.data.pinned_at).toBeDefined();
      expect(data.data.pinned_by).toBeNull();
    });

    it('creates a leaf pin with selected_assertion_ids', async () => {
      const assertionIds = ['ast_test1', 'ast_test2'];
      const res = await app.request(`/v1/projects/${testProjectId}/pins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'leaf',
          ref_id: testLeafId,
          selected_assertion_ids: assertionIds,
        }),
      });

      expect(res.status).toBe(201);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.id).toMatch(/^pin_/);
      expect(data.data.type).toBe('leaf');
      expect(data.data.ref_id).toBe(testLeafId);
      expect(data.data.selected_assertion_ids).toEqual(assertionIds);
    });

    it('returns 400 for missing required fields', async () => {
      const res = await app.request(`/v1/projects/${testProjectId}/pins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'conversation',
          // missing ref_id
        }),
      });

      expect(res.status).toBe(400);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
    });

    it('returns 400 for invalid type', async () => {
      const res = await app.request(`/v1/projects/${testProjectId}/pins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'invalid_type',
          ref_id: 'some_id',
        }),
      });

      expect(res.status).toBe(400);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
    });

    it('returns 409 for duplicate pin', async () => {
      // Create a unique ref_id for this test
      const uniqueRefId = `conv_duplicate_test_${Date.now()}`;

      // First create should succeed
      const res1 = await app.request(`/v1/projects/${testProjectId}/pins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'conversation',
          ref_id: uniqueRefId,
        }),
      });
      expect(res1.status).toBe(201);

      // Second create with same (project_id, type, ref_id) should fail with 409
      const res2 = await app.request(`/v1/projects/${testProjectId}/pins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'conversation',
          ref_id: uniqueRefId,
        }),
      });

      expect(res2.status).toBe(409);

      const data: ApiResponse = await res2.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('DUPLICATE_PIN');
    });
  });

  describe('GET /v1/projects/:projectId/pins', () => {
    const createdPinIds: string[] = [];

    beforeAll(async () => {
      // Create multiple pins for testing list/filter
      const pins = [
        { type: 'conversation', ref_id: `conv_list_test_1_${Date.now()}` },
        { type: 'conversation', ref_id: `conv_list_test_2_${Date.now()}` },
        { type: 'leaf', ref_id: `leaf_list_test_1_${Date.now()}` },
      ];

      for (const pin of pins) {
        const res = await app.request(`/v1/projects/${testProjectId}/pins`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pin),
        });
        const data: ApiResponse = await res.json();
        if (data.success) {
          createdPinIds.push(data.data.id);
        }
      }
    });

    it('returns all pins for project', async () => {
      const res = await app.request(`/v1/projects/${testProjectId}/pins`);
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeGreaterThanOrEqual(3);
    });

    it('filters by type', async () => {
      const res = await app.request(`/v1/projects/${testProjectId}/pins?type=conversation`);
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.every((pin: ApiResponse) => pin.type === 'conversation')).toBe(true);
    });

    it('filters by leaf type', async () => {
      const res = await app.request(`/v1/projects/${testProjectId}/pins?type=leaf`);
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.every((pin: ApiResponse) => pin.type === 'leaf')).toBe(true);
    });

    it('respects pagination', async () => {
      const res = await app.request(`/v1/projects/${testProjectId}/pins?limit=2&offset=0`);
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.length).toBeLessThanOrEqual(2);
    });

    it('returns empty array for project with no pins', async () => {
      // Create a new project with no pins
      const project = await insertProject(mockDB, testData.project({ name: 'Empty Pins Project' }));

      const res = await app.request(`/v1/projects/${project.projectId}/pins`);
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toEqual([]);
    });
  });

  describe('GET /v1/pins/:id', () => {
    let createdPinId: string;

    beforeAll(async () => {
      const res = await app.request(`/v1/projects/${testProjectId}/pins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'conversation',
          ref_id: `conv_get_test_${Date.now()}`,
        }),
      });
      const data: ApiResponse = await res.json();
      createdPinId = data.data.id;
    });

    it('returns pin by ID', async () => {
      const res = await app.request(`/v1/pins/${createdPinId}`);
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(createdPinId);
      expect(data.data.type).toBe('conversation');
    });

    it('returns 404 for non-existent pin', async () => {
      const res = await app.request('/v1/pins/pin_nonexistent123');
      expect(res.status).toBe(404);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('PIN_NOT_FOUND');
    });
  });

  describe('PATCH /v1/pins/:id/assertions', () => {
    let createdPinId: string;

    beforeAll(async () => {
      const res = await app.request(`/v1/projects/${testProjectId}/pins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'leaf',
          ref_id: `leaf_patch_test_${Date.now()}`,
          selected_assertion_ids: ['ast_original1'],
        }),
      });
      const data: ApiResponse = await res.json();
      createdPinId = data.data.id;
    });

    it('updates selected_assertion_ids', async () => {
      const newAssertionIds = ['ast_new1', 'ast_new2', 'ast_new3'];
      const res = await app.request(`/v1/pins/${createdPinId}/assertions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selected_assertion_ids: newAssertionIds,
        }),
      });

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(createdPinId);
      expect(data.data.selected_assertion_ids).toEqual(newAssertionIds);
    });

    it('can set empty assertion ids array', async () => {
      const res = await app.request(`/v1/pins/${createdPinId}/assertions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selected_assertion_ids: [],
        }),
      });

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.selected_assertion_ids).toEqual([]);
    });

    it('returns 404 for non-existent pin', async () => {
      const res = await app.request('/v1/pins/pin_nonexistent123/assertions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selected_assertion_ids: ['ast_test'],
        }),
      });

      expect(res.status).toBe(404);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('PIN_NOT_FOUND');
    });

    it('returns 400 for missing selected_assertion_ids', async () => {
      const res = await app.request(`/v1/pins/${createdPinId}/assertions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
    });
  });

  describe('DELETE /v1/pins/:id', () => {
    let createdPinId: string;

    beforeAll(async () => {
      const res = await app.request(`/v1/projects/${testProjectId}/pins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'conversation',
          ref_id: `conv_delete_test_${Date.now()}`,
        }),
      });
      const data: ApiResponse = await res.json();
      createdPinId = data.data.id;
    });

    it('deletes pin successfully', async () => {
      const res = await app.request(`/v1/pins/${createdPinId}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.deleted).toBe(true);
      expect(data.data.id).toBe(createdPinId);

      // Verify pin is deleted
      const getRes = await app.request(`/v1/pins/${createdPinId}`);
      expect(getRes.status).toBe(404);
    });

    it('returns 404 for non-existent pin', async () => {
      const res = await app.request('/v1/pins/pin_nonexistent123', {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('PIN_NOT_FOUND');
    });
  });
});
