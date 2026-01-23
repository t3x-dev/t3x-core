/**
 * Pins Storage Tests
 *
 * Tests all pin CRUD operations and verifies database effects.
 * Pins mark items as selected for commit sources and conversation context.
 *
 * @see docs/specification/semantic-layer-architecture.md
 */

import type { PGlite } from '@electric-sql/pglite';
import type { CreatePinInput, PinType } from '@t3x/core';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { createLeaf } from '../queries/leaves';
import { createCommitV4 } from '../queries/commits-v4';
import {
  createPin,
  deletePin,
  deletePinByRef,
  findPinById,
  findPinByRef,
  findPinsByProject,
  findPinsByType,
  getPinsByIds,
  updatePinAssertions,
} from '../queries/pins';
import { insertProject } from '../queries/projects';
import { insertConversation } from '../queries/conversations';
import { pins } from '../schema-v4';
import { createTestDB, testData } from './setup';

describe('Pins Storage', () => {
  let db: AnyDB;
  let _client: PGlite;
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let testConversationId: string;
  let testLeafId: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    _client = setup.client;
    cleanup = setup.cleanup;

    // Create a test project
    const project = await insertProject(
      db,
      testData.project({ name: 'Pins Test Project' })
    );
    testProjectId = project.projectId;

    // Create a test conversation (for conversation pins)
    const conversation = await insertConversation(
      db,
      testData.conversation(testProjectId, { title: 'Test Conversation' })
    );
    testConversationId = conversation.conversationId;

    // Create a test commit and leaf (for leaf pins)
    const commit = await createCommitV4(db, {
      parents: [],
      author: { type: 'human', name: 'Test Author' },
      sentences: [{ id: 's_1', text: 'Test sentence' }],
      project_id: testProjectId,
    });

    const leaf = await createLeaf(db, {
      commit_hash: commit.hash,
      type: 'tweet',
      project_id: testProjectId,
    });
    testLeafId = leaf.id;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('createPin', () => {
    it('creates a conversation pin with all required fields', async () => {
      const input: CreatePinInput = {
        project_id: testProjectId,
        type: 'conversation',
        ref_id: testConversationId,
      };

      const result = await createPin(db, input);

      expect(result).toBeDefined();
      expect(result.id).toMatch(/^pin_/);
      expect(result.project_id).toBe(testProjectId);
      expect(result.type).toBe('conversation');
      expect(result.ref_id).toBe(testConversationId);
      expect(result.pinned_at).toBeDefined();
      expect(result.selected_assertion_ids).toBeUndefined();
      expect(result.pinned_by).toBeUndefined();
    });

    it('creates a leaf pin with selected_assertion_ids', async () => {
      const input: CreatePinInput = {
        project_id: testProjectId,
        type: 'leaf',
        ref_id: testLeafId,
        selected_assertion_ids: ['ast_123', 'ast_456'],
      };

      const result = await createPin(db, input);

      expect(result.type).toBe('leaf');
      expect(result.ref_id).toBe(testLeafId);
      expect(result.selected_assertion_ids).toEqual(['ast_123', 'ast_456']);
    });

    it('creates a pin with pinned_by', async () => {
      const input: CreatePinInput = {
        project_id: testProjectId,
        type: 'conversation',
        ref_id: 'conv_unique_1',
        pinned_by: 'user_123',
      };

      const result = await createPin(db, input);

      expect(result.pinned_by).toBe('user_123');
    });

    it('stores the pin in the database', async () => {
      const input: CreatePinInput = {
        project_id: testProjectId,
        type: 'conversation',
        ref_id: 'conv_unique_2',
      };

      const result = await createPin(db, input);

      // Verify database effect
      const rows = await db
        .select()
        .from(pins)
        .where(eq(pins.id, result.id));

      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(result.id);
      expect(rows[0].type).toBe('conversation');
    });

    it('throws error when pinning same item twice (unique constraint)', async () => {
      const input: CreatePinInput = {
        project_id: testProjectId,
        type: 'conversation',
        ref_id: 'conv_duplicate_test',
      };

      // First pin should succeed
      await createPin(db, input);

      // Second pin with same project/type/ref should fail
      await expect(createPin(db, input)).rejects.toThrow();
    });
  });

  describe('findPinById', () => {
    it('returns the pin when it exists', async () => {
      const created = await createPin(db, {
        project_id: testProjectId,
        type: 'conversation',
        ref_id: 'conv_find_test',
        pinned_by: 'user_finder',
      });

      const found = await findPinById(db, created.id);

      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.pinned_by).toBe('user_finder');
    });

    it('returns null when pin does not exist', async () => {
      const found = await findPinById(db, 'pin_nonexistent');

      expect(found).toBeNull();
    });
  });

  describe('findPinsByProject', () => {
    it('returns pins for a specific project', async () => {
      // Create a new project to avoid pollution from other tests
      const project = await insertProject(
        db,
        testData.project({ name: 'Project Pins Test' })
      );

      await createPin(db, {
        project_id: project.projectId,
        type: 'conversation',
        ref_id: 'conv_proj_1',
      });

      await createPin(db, {
        project_id: project.projectId,
        type: 'leaf',
        ref_id: 'leaf_proj_1',
      });

      const results = await findPinsByProject(db, project.projectId);

      expect(results).toHaveLength(2);
      expect(results.every((p) => p.project_id === project.projectId)).toBe(true);
    });

    it('orders by pinnedAt descending', async () => {
      const project = await insertProject(
        db,
        testData.project({ name: 'Order Pins Test' })
      );

      await createPin(db, {
        project_id: project.projectId,
        type: 'conversation',
        ref_id: 'conv_order_1',
      });

      await new Promise((r) => setTimeout(r, 10));

      await createPin(db, {
        project_id: project.projectId,
        type: 'conversation',
        ref_id: 'conv_order_2',
      });

      const results = await findPinsByProject(db, project.projectId);

      expect(results[0].ref_id).toBe('conv_order_2'); // Newer first
      expect(results[1].ref_id).toBe('conv_order_1');
    });

    it('respects limit option', async () => {
      const project = await insertProject(
        db,
        testData.project({ name: 'Limit Pins Test' })
      );

      for (let i = 0; i < 5; i++) {
        await createPin(db, {
          project_id: project.projectId,
          type: 'conversation',
          ref_id: `conv_limit_${i}`,
        });
      }

      const results = await findPinsByProject(db, project.projectId, { limit: 2 });

      expect(results).toHaveLength(2);
    });

    it('returns empty array when no pins exist', async () => {
      const project = await insertProject(
        db,
        testData.project({ name: 'Empty Pins Test' })
      );

      const results = await findPinsByProject(db, project.projectId);

      expect(results).toHaveLength(0);
    });
  });

  describe('findPinByRef', () => {
    it('finds a pin by project, type, and ref_id', async () => {
      const project = await insertProject(
        db,
        testData.project({ name: 'FindByRef Test' })
      );

      const created = await createPin(db, {
        project_id: project.projectId,
        type: 'leaf',
        ref_id: 'leaf_ref_test',
        pinned_by: 'user_ref',
      });

      const found = await findPinByRef(
        db,
        project.projectId,
        'leaf',
        'leaf_ref_test'
      );

      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.pinned_by).toBe('user_ref');
    });

    it('returns null when pin does not exist', async () => {
      const found = await findPinByRef(
        db,
        testProjectId,
        'leaf',
        'nonexistent_ref'
      );

      expect(found).toBeNull();
    });

    it('distinguishes between pin types', async () => {
      const project = await insertProject(
        db,
        testData.project({ name: 'Type Distinguish Test' })
      );

      // Create a conversation pin
      await createPin(db, {
        project_id: project.projectId,
        type: 'conversation',
        ref_id: 'shared_ref',
      });

      // Create a leaf pin with the same ref_id
      await createPin(db, {
        project_id: project.projectId,
        type: 'leaf',
        ref_id: 'shared_ref',
      });

      const convPin = await findPinByRef(db, project.projectId, 'conversation', 'shared_ref');
      const leafPin = await findPinByRef(db, project.projectId, 'leaf', 'shared_ref');

      expect(convPin).toBeDefined();
      expect(leafPin).toBeDefined();
      expect(convPin!.id).not.toBe(leafPin!.id);
      expect(convPin!.type).toBe('conversation');
      expect(leafPin!.type).toBe('leaf');
    });
  });

  describe('updatePinAssertions', () => {
    it('updates selected assertion IDs', async () => {
      const created = await createPin(db, {
        project_id: testProjectId,
        type: 'leaf',
        ref_id: 'leaf_update_test',
      });

      const updated = await updatePinAssertions(db, created.id, ['ast_new1', 'ast_new2']);

      expect(updated).toBeDefined();
      expect(updated!.selected_assertion_ids).toEqual(['ast_new1', 'ast_new2']);
    });

    it('clears assertion IDs when undefined is passed', async () => {
      const created = await createPin(db, {
        project_id: testProjectId,
        type: 'leaf',
        ref_id: 'leaf_clear_test',
        selected_assertion_ids: ['ast_original'],
      });

      const updated = await updatePinAssertions(db, created.id, undefined);

      expect(updated).toBeDefined();
      expect(updated!.selected_assertion_ids).toBeUndefined();
    });

    it('returns null when pin does not exist', async () => {
      const updated = await updatePinAssertions(db, 'pin_nonexistent', ['ast_1']);

      expect(updated).toBeNull();
    });
  });

  describe('deletePin', () => {
    it('deletes a pin by ID', async () => {
      const created = await createPin(db, {
        project_id: testProjectId,
        type: 'conversation',
        ref_id: 'conv_delete_test',
      });

      const deleted = await deletePin(db, created.id);
      expect(deleted).toBe(true);

      const found = await findPinById(db, created.id);
      expect(found).toBeNull();
    });

    it('returns false when pin does not exist', async () => {
      const deleted = await deletePin(db, 'pin_nonexistent');
      expect(deleted).toBe(false);
    });
  });

  describe('deletePinByRef', () => {
    it('deletes a pin by project, type, and ref_id', async () => {
      const project = await insertProject(
        db,
        testData.project({ name: 'DeleteByRef Test' })
      );

      const created = await createPin(db, {
        project_id: project.projectId,
        type: 'leaf',
        ref_id: 'leaf_delete_ref_test',
      });

      const deleted = await deletePinByRef(
        db,
        project.projectId,
        'leaf',
        'leaf_delete_ref_test'
      );

      expect(deleted).toBe(true);

      const found = await findPinById(db, created.id);
      expect(found).toBeNull();
    });

    it('returns false when pin does not exist', async () => {
      const deleted = await deletePinByRef(
        db,
        testProjectId,
        'conversation',
        'nonexistent_ref'
      );

      expect(deleted).toBe(false);
    });
  });

  describe('getPinsByIds', () => {
    it('returns multiple pins in single query', async () => {
      const project = await insertProject(
        db,
        testData.project({ name: 'Batch Pins Test' })
      );

      const pin1 = await createPin(db, {
        project_id: project.projectId,
        type: 'conversation',
        ref_id: 'conv_batch_1',
      });

      const pin2 = await createPin(db, {
        project_id: project.projectId,
        type: 'leaf',
        ref_id: 'leaf_batch_1',
      });

      const results = await getPinsByIds(db, [pin1.id, pin2.id]);

      expect(results).toHaveLength(2);
      const ids = results.map((p) => p.id);
      expect(ids).toContain(pin1.id);
      expect(ids).toContain(pin2.id);
    });

    it('returns empty array for empty input', async () => {
      const results = await getPinsByIds(db, []);
      expect(results).toHaveLength(0);
    });

    it('returns only existing pins when some IDs are invalid', async () => {
      const created = await createPin(db, {
        project_id: testProjectId,
        type: 'conversation',
        ref_id: 'conv_partial_batch',
      });

      const results = await getPinsByIds(db, [
        created.id,
        'pin_nonexistent1',
        'pin_nonexistent2',
      ]);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(created.id);
    });

    it('preserves input order', async () => {
      const project = await insertProject(
        db,
        testData.project({ name: 'Order Batch Test' })
      );

      const pin1 = await createPin(db, {
        project_id: project.projectId,
        type: 'conversation',
        ref_id: 'conv_order_batch_1',
      });

      const pin2 = await createPin(db, {
        project_id: project.projectId,
        type: 'conversation',
        ref_id: 'conv_order_batch_2',
      });

      const pin3 = await createPin(db, {
        project_id: project.projectId,
        type: 'conversation',
        ref_id: 'conv_order_batch_3',
      });

      // Request in specific order: 3, 1, 2
      const results = await getPinsByIds(db, [pin3.id, pin1.id, pin2.id]);

      expect(results).toHaveLength(3);
      expect(results[0].id).toBe(pin3.id);
      expect(results[1].id).toBe(pin1.id);
      expect(results[2].id).toBe(pin2.id);
    });
  });

  describe('findPinsByType', () => {
    it('returns only conversation pins', async () => {
      const project = await insertProject(
        db,
        testData.project({ name: 'Type Filter Test' })
      );

      await createPin(db, {
        project_id: project.projectId,
        type: 'conversation',
        ref_id: 'conv_type_1',
      });

      await createPin(db, {
        project_id: project.projectId,
        type: 'conversation',
        ref_id: 'conv_type_2',
      });

      await createPin(db, {
        project_id: project.projectId,
        type: 'leaf',
        ref_id: 'leaf_type_1',
      });

      const results = await findPinsByType(db, project.projectId, 'conversation');

      expect(results).toHaveLength(2);
      expect(results.every((p) => p.type === 'conversation')).toBe(true);
    });

    it('returns only leaf pins', async () => {
      const project = await insertProject(
        db,
        testData.project({ name: 'Leaf Filter Test' })
      );

      await createPin(db, {
        project_id: project.projectId,
        type: 'conversation',
        ref_id: 'conv_leaf_filter',
      });

      await createPin(db, {
        project_id: project.projectId,
        type: 'leaf',
        ref_id: 'leaf_leaf_filter_1',
      });

      await createPin(db, {
        project_id: project.projectId,
        type: 'leaf',
        ref_id: 'leaf_leaf_filter_2',
      });

      const results = await findPinsByType(db, project.projectId, 'leaf');

      expect(results).toHaveLength(2);
      expect(results.every((p) => p.type === 'leaf')).toBe(true);
    });
  });

  describe('output format', () => {
    it('uses snake_case for all fields (matches V4 type contract)', async () => {
      const created = await createPin(db, {
        project_id: testProjectId,
        type: 'leaf',
        ref_id: 'leaf_format_test',
        selected_assertion_ids: ['ast_1'],
        pinned_by: 'user_format',
      });

      // Verify snake_case keys exist
      expect(created).toHaveProperty('project_id');
      expect(created).toHaveProperty('ref_id');
      expect(created).toHaveProperty('pinned_at');
      expect(created).toHaveProperty('pinned_by');
      expect(created).toHaveProperty('selected_assertion_ids');

      // Verify camelCase keys don't exist
      expect(created).not.toHaveProperty('projectId');
      expect(created).not.toHaveProperty('refId');
      expect(created).not.toHaveProperty('pinnedAt');
      expect(created).not.toHaveProperty('pinnedBy');
      expect(created).not.toHaveProperty('selectedAssertionIds');
    });

    it('converts pinned_at to ISO string', async () => {
      const created = await createPin(db, {
        project_id: testProjectId,
        type: 'conversation',
        ref_id: 'conv_iso_test',
      });

      expect(created.pinned_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('pin types', () => {
    it.each(['conversation', 'leaf'] as const)('supports pin type: %s', async (type) => {
      const project = await insertProject(
        db,
        testData.project({ name: `Pin Type ${type} Test` })
      );

      const created = await createPin(db, {
        project_id: project.projectId,
        type,
        ref_id: `ref_${type}_type_test`,
      });

      expect(created.type).toBe(type);

      const found = await findPinById(db, created.id);
      expect(found!.type).toBe(type);
    });
  });
});
