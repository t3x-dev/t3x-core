/**
 * Conversation Context Route Tests
 *
 * Integration tests for Conversation Context API endpoints.
 */

import type { AnyDB } from '@t3x-dev/storage';
import {
  createCommit,
  createLeaf,
  createPin,
  ensureMainBranch,
  insertConversation,
  insertProject,
  setConversationContext,
  updateBranchHead,
  updateLeafAssertions,
  updateLeafRunnerAssertions,
} from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildConversationContextManifest } from '../lib/context-manifest';
import { setupTestDB, testData } from './setup';

// biome-ignore lint/suspicious/noExplicitAny: test helper
type ApiResponse = any;

// Mock the database module before importing routes
let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// Import routes after mocking
import { conversationRoutes } from '../routes/conversations.openapi';

describe('Conversation Context Routes', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let testConversationId: string;
  const app = new Hono();
  app.route('/', conversationRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    // Create a test project
    const project = await insertProject(mockDB, testData.project({ name: 'Context Test Project' }));
    testProjectId = project.projectId;

    // Create a test conversation
    const conversation = await insertConversation(mockDB, {
      projectId: testProjectId,
      title: 'Test Conversation for Context',
    });
    testConversationId = conversation.conversationId;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('GET /v1/conversations/:id/context', () => {
    it('returns null for conversation with no custom context', async () => {
      const res = await app.request(`/v1/conversations/${testConversationId}/context`);
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      // No custom context configured = null (using default)
      expect(data.data).toBeNull();
    });

    it('returns 404 for non-existent conversation', async () => {
      const res = await app.request('/v1/conversations/conv_nonexistent/context');
      expect(res.status).toBe(404);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('NOT_FOUND');
    });
  });

  describe('PUT /v1/conversations/:id/context', () => {
    it('sets context with specific pin IDs', async () => {
      const pinIds = ['pin_test1', 'pin_test2'];
      const res = await app.request(`/v1/conversations/${testConversationId}/context`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selected_pin_ids: pinIds,
        }),
      });

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.conversation_id).toBe(testConversationId);
      expect(data.data.selected_pin_ids).toEqual(pinIds);
      expect(data.data.updated_at).toBeDefined();
    });

    it('sets context with empty pin IDs (fresh start)', async () => {
      const res = await app.request(`/v1/conversations/${testConversationId}/context`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selected_pin_ids: [],
        }),
      });

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.selected_pin_ids).toEqual([]);
    });

    it('sets context with null (use all pins)', async () => {
      const res = await app.request(`/v1/conversations/${testConversationId}/context`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selected_pin_ids: null,
        }),
      });

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.selected_pin_ids).toBeNull();
    });

    it('returns 400 for missing selected_pin_ids', async () => {
      const res = await app.request(`/v1/conversations/${testConversationId}/context`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_REQUEST');
    });

    it('returns 404 for non-existent conversation', async () => {
      const res = await app.request('/v1/conversations/conv_nonexistent/context', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selected_pin_ids: ['pin_test'],
        }),
      });

      expect(res.status).toBe(404);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('NOT_FOUND');
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await app.request(`/v1/conversations/${testConversationId}/context`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json',
      });

      expect(res.status).toBe(400);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_JSON');
    });
  });

  describe('GET /v1/conversations/:id/context after PUT', () => {
    let contextTestConvId: string;

    beforeAll(async () => {
      // Create a separate conversation for this test
      const conversation = await insertConversation(mockDB, {
        projectId: testProjectId,
        title: 'Context Get After Put Test',
      });
      contextTestConvId = conversation.conversationId;
    });

    it('returns previously set context', async () => {
      const pinIds = ['pin_gettest1', 'pin_gettest2', 'pin_gettest3'];

      // Set context
      await app.request(`/v1/conversations/${contextTestConvId}/context`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selected_pin_ids: pinIds,
        }),
      });

      // Get context
      const res = await app.request(`/v1/conversations/${contextTestConvId}/context`);
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.conversation_id).toBe(contextTestConvId);
      expect(data.data.selected_pin_ids).toEqual(pinIds);
    });
  });

  describe('buildConversationContextManifest', () => {
    it('uses the conversation parent commit as baseline and marks selected leaf feedback', async () => {
      const project = await insertProject(
        mockDB,
        testData.project({ name: 'Manifest Builder Test Project' })
      );
      const sourceConversation = await insertConversation(mockDB, {
        projectId: project.projectId,
        title: 'Parent Source Conversation',
      });

      const parentCommit = await createCommit(mockDB, {
        project_id: project.projectId,
        author: { type: 'human', id: 'user_test', name: 'Test User' },
        message: 'Parent knowledge',
        content: {
          trees: [
            {
              key: 'launch_plan',
              slots: { goal: 'ship context manifest' },
              children: [],
            },
          ],
          relations: [],
        },
        sources: [
          {
            type: 'conversation',
            id: sourceConversation.conversationId,
            title: 'Parent Source Conversation',
          },
        ],
      });

      const conversation = await insertConversation(mockDB, {
        projectId: project.projectId,
        title: 'Manifest Conversation',
        parentCommitHash: parentCommit.hash,
      });

      const leaf = await createLeaf(mockDB, {
        project_id: project.projectId,
        commit_hash: parentCommit.hash,
        type: 'article',
        title: 'Launch Review',
      });
      await updateLeafAssertions(mockDB, leaf.id, [
        {
          id: 'ast_keep',
          constraint_id: 'cst_keep',
          passed: true,
          details: 'Kept feedback',
          lesson: 'Keep the launch goal explicit.',
        },
        {
          id: 'ast_skip',
          constraint_id: 'cst_skip',
          passed: false,
          details: 'Skipped feedback',
          lesson: 'This lesson should not be selected.',
        },
      ]);

      const leafPin = await createPin(mockDB, {
        project_id: project.projectId,
        type: 'leaf',
        ref_id: leaf.id,
        selected_assertion_ids: ['ast_keep'],
      });
      await setConversationContext(mockDB, conversation.conversationId, [leafPin.id]);

      const manifest = await buildConversationContextManifest(mockDB, conversation.conversationId);

      expect(manifest.baseline).toMatchObject({
        source: 'parent_commit',
        commit_hash: parentCommit.hash,
        branch: 'main',
        message: 'Parent knowledge',
        content: parentCommit.content,
        node_count: 1,
        relation_count: 0,
        source_conversation_id: sourceConversation.conversationId,
      });
      expect(manifest.references).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            pin_id: leafPin.id,
            type: 'leaf',
            id: leaf.id,
            title: 'Launch Review',
            included: true,
          }),
        ])
      );
      expect(manifest.feedback).toEqual([
        expect.objectContaining({
          type: expect.stringMatching(/^(leaf|runner)_assertion$/),
          id: 'ast_keep',
          pin_id: leafPin.id,
          parent_ref_id: leaf.id,
          included: true,
          lesson: 'Keep the launch goal explicit.',
        }),
        expect.objectContaining({
          type: expect.stringMatching(/^(leaf|runner)_assertion$/),
          id: 'ast_skip',
          pin_id: leafPin.id,
          parent_ref_id: leaf.id,
          included: false,
          lesson: 'This lesson should not be selected.',
        }),
      ]);
      expect(manifest.source_items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: parentCommit.hash,
            kind: 'baseline',
            role: 'baseline',
            title: 'Baseline inherited',
            pinned: false,
            pinnable: false,
            included: true,
            readonly: true,
          }),
          expect.objectContaining({
            id: leaf.id,
            kind: 'leaf',
            role: 'evidence',
            title: 'Launch Review',
            pin_id: leafPin.id,
            pinned: true,
            pinnable: true,
            included: true,
          }),
          expect.objectContaining({
            id: 'ast_keep',
            kind: 'lesson',
            role: 'guidance',
            title: 'Keep the launch goal explicit.',
            parent_source_id: leaf.id,
            pin_id: leafPin.id,
            pinned: false,
            pinnable: false,
            included: true,
          }),
        ])
      );
      expect(manifest.chat_context_text).toContain('launch_plan:');
      expect(manifest.chat_context_text).toContain('goal: ship context manifest');
      expect(manifest.chat_context_text).toContain('Keep the launch goal explicit.');
      expect(manifest.chat_context_text).not.toContain('This lesson should not be selected.');
      expect(manifest.extraction_context_text).toContain('not source evidence');
      expect(manifest.extraction_context_text).toContain('Keep the launch goal explicit.');
      expect(manifest.extraction_context_text).not.toContain('This lesson should not be selected.');
      expect(manifest.extraction_context_text).not.toContain('launch_plan:');
    });

    it('does not include leaf feedback in extraction context unless assertions are selected', async () => {
      const project = await insertProject(
        mockDB,
        testData.project({ name: 'Manifest Unselected Feedback Test Project' })
      );
      const parentCommit = await createCommit(mockDB, {
        project_id: project.projectId,
        author: { type: 'human', id: 'user_test', name: 'Test User' },
        content: {
          trees: [{ key: 'baseline', slots: { goal: 'keep extraction clean' }, children: [] }],
          relations: [],
        },
      });
      const conversation = await insertConversation(mockDB, {
        projectId: project.projectId,
        title: 'Manifest Unselected Feedback Conversation',
        parentCommitHash: parentCommit.hash,
      });
      const leaf = await createLeaf(mockDB, {
        project_id: project.projectId,
        commit_hash: parentCommit.hash,
        type: 'article',
        title: 'Unselected Lessons',
      });
      await updateLeafAssertions(mockDB, leaf.id, [
        {
          id: 'ast_unselected',
          constraint_id: 'cst_unselected',
          passed: true,
          details: 'No explicit selection',
          lesson: 'Do not leak this lesson without explicit selection.',
        },
      ]);
      const leafPin = await createPin(mockDB, {
        project_id: project.projectId,
        type: 'leaf',
        ref_id: leaf.id,
      });
      await setConversationContext(mockDB, conversation.conversationId, [leafPin.id]);

      const manifest = await buildConversationContextManifest(mockDB, conversation.conversationId);

      expect(manifest.feedback).toEqual([
        expect.objectContaining({
          id: 'ast_unselected',
          parent_ref_id: leaf.id,
          pin_id: leafPin.id,
          included: false,
          lesson: 'Do not leak this lesson without explicit selection.',
        }),
      ]);
      expect(manifest.extraction_context_text).not.toContain(
        'Do not leak this lesson without explicit selection.'
      );
      expect(manifest.chat_context_text).not.toContain(
        'Do not leak this lesson without explicit selection.'
      );
    });

    it('keeps assertion selection separate from effective inclusion', async () => {
      const project = await insertProject(
        mockDB,
        testData.project({ name: 'Manifest Selection State Test Project' })
      );
      const parentCommit = await createCommit(mockDB, {
        project_id: project.projectId,
        author: { type: 'human', id: 'user_test', name: 'Test User' },
        content: {
          trees: [
            {
              key: 'baseline',
              slots: { goal: 'separate selected and included' },
              children: [],
            },
          ],
          relations: [],
        },
      });
      const conversation = await insertConversation(mockDB, {
        projectId: project.projectId,
        title: 'Manifest Selection State Conversation',
        parentCommitHash: parentCommit.hash,
      });
      const leaf = await createLeaf(mockDB, {
        project_id: project.projectId,
        commit_hash: parentCommit.hash,
        type: 'article',
        title: 'Selected But Inactive Lessons',
      });
      await updateLeafAssertions(mockDB, leaf.id, [
        {
          id: 'ast_selected_inactive',
          constraint_id: 'cst_selected_inactive',
          passed: true,
          details: 'Selected but inactive',
          lesson: 'This lesson is selected but inactive.',
        },
      ]);
      const leafPin = await createPin(mockDB, {
        project_id: project.projectId,
        type: 'leaf',
        ref_id: leaf.id,
        selected_assertion_ids: ['ast_selected_inactive'],
      });
      await setConversationContext(mockDB, conversation.conversationId, []);

      const manifest = await buildConversationContextManifest(mockDB, conversation.conversationId);

      expect(manifest.references).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            pin_id: leafPin.id,
            included: false,
          }),
        ])
      );
      expect(manifest.feedback).toEqual([
        expect.objectContaining({
          id: 'ast_selected_inactive',
          pin_id: leafPin.id,
          selected: true,
          included: false,
        }),
      ]);
      expect(manifest.extraction_context_text).not.toContain(
        'This lesson is selected but inactive.'
      );
    });

    it('does not fall back to local assertions when runner assertions are empty', async () => {
      const project = await insertProject(
        mockDB,
        testData.project({ name: 'Manifest Empty Runner Feedback Test Project' })
      );
      const parentCommit = await createCommit(mockDB, {
        project_id: project.projectId,
        author: { type: 'human', id: 'user_test', name: 'Test User' },
        content: {
          trees: [
            { key: 'baseline', slots: { goal: 'honor empty runner feedback' }, children: [] },
          ],
          relations: [],
        },
      });
      const conversation = await insertConversation(mockDB, {
        projectId: project.projectId,
        title: 'Manifest Empty Runner Feedback Conversation',
        parentCommitHash: parentCommit.hash,
      });
      const leaf = await createLeaf(mockDB, {
        project_id: project.projectId,
        commit_hash: parentCommit.hash,
        type: 'article',
        title: 'Empty Runner Lessons',
      });
      await updateLeafAssertions(mockDB, leaf.id, [
        {
          id: 'ast_local',
          constraint_id: 'cst_local',
          passed: true,
          details: 'Local feedback',
          lesson: 'Local lesson must not appear when runner assertions are empty.',
        },
      ]);
      await updateLeafRunnerAssertions(mockDB, leaf.id, []);
      const leafPin = await createPin(mockDB, {
        project_id: project.projectId,
        type: 'leaf',
        ref_id: leaf.id,
        selected_assertion_ids: ['ast_local'],
      });
      await setConversationContext(mockDB, conversation.conversationId, [leafPin.id]);

      const manifest = await buildConversationContextManifest(mockDB, conversation.conversationId);

      expect(manifest.feedback).toEqual([]);
      expect(manifest.extraction_context_text).not.toContain(
        'Local lesson must not appear when runner assertions are empty.'
      );
      expect(manifest.chat_context_text).not.toContain(
        'Local lesson must not appear when runner assertions are empty.'
      );
    });

    it('includes references beyond the default project pin query limit', async () => {
      const project = await insertProject(
        mockDB,
        testData.project({ name: 'Manifest Pin Limit Test Project' })
      );
      const conversation = await insertConversation(mockDB, {
        projectId: project.projectId,
        title: 'Manifest Pin Limit Conversation',
      });

      for (let index = 0; index < 101; index += 1) {
        const pinnedConversation = await insertConversation(mockDB, {
          projectId: project.projectId,
          title: `Pinned Conversation ${index}`,
        });
        await createPin(mockDB, {
          project_id: project.projectId,
          type: 'conversation',
          ref_id: pinnedConversation.conversationId,
        });
      }

      const manifest = await buildConversationContextManifest(mockDB, conversation.conversationId);

      expect(manifest.references).toHaveLength(101);
    });
  });

  describe('GET /v1/conversations/:id/context-manifest', () => {
    it('returns structured context manifest with parent baseline and selected leaf feedback', async () => {
      const project = await insertProject(
        mockDB,
        testData.project({ name: 'Manifest Route Test Project' })
      );
      const parentCommit = await createCommit(mockDB, {
        project_id: project.projectId,
        author: { type: 'human', id: 'user_test', name: 'Test User' },
        message: 'Route parent knowledge',
        content: {
          trees: [
            {
              key: 'route_plan',
              slots: { goal: 'serve a structured context manifest' },
              children: [],
            },
          ],
          relations: [],
        },
      });
      const conversation = await insertConversation(mockDB, {
        projectId: project.projectId,
        title: 'Manifest Route Conversation',
        parentCommitHash: parentCommit.hash,
      });
      const leaf = await createLeaf(mockDB, {
        project_id: project.projectId,
        commit_hash: parentCommit.hash,
        type: 'article',
        title: 'Route Feedback',
      });
      await updateLeafAssertions(mockDB, leaf.id, [
        {
          id: 'ast_route_keep',
          constraint_id: 'cst_route_keep',
          passed: true,
          details: 'Selected route feedback',
          lesson: 'Keep route manifest feedback explicit.',
        },
        {
          id: 'ast_route_skip',
          constraint_id: 'cst_route_skip',
          passed: false,
          details: 'Unselected route feedback',
          lesson: 'Do not include unselected route feedback.',
        },
      ]);
      const leafPin = await createPin(mockDB, {
        project_id: project.projectId,
        type: 'leaf',
        ref_id: leaf.id,
        selected_assertion_ids: ['ast_route_keep'],
      });
      await setConversationContext(mockDB, conversation.conversationId, [leafPin.id]);

      const res = await app.request(
        `/v1/conversations/${conversation.conversationId}/context-manifest`
      );
      expect(res.status).toBe(200);

      const body: ApiResponse = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toMatchObject({
        conversation_id: conversation.conversationId,
        project_id: project.projectId,
        baseline: {
          source: 'parent_commit',
          commit_hash: parentCommit.hash,
          branch: 'main',
          message: 'Route parent knowledge',
          content: parentCommit.content,
          node_count: 1,
          relation_count: 0,
        },
      });
      expect(body.data.references).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            pin_id: leafPin.id,
            type: 'leaf',
            id: leaf.id,
            title: 'Route Feedback',
            included: true,
          }),
        ])
      );
      expect(body.data.feedback).toEqual([
        expect.objectContaining({
          id: 'ast_route_keep',
          parent_ref_id: leaf.id,
          pin_id: leafPin.id,
          included: true,
          lesson: 'Keep route manifest feedback explicit.',
        }),
        expect.objectContaining({
          id: 'ast_route_skip',
          parent_ref_id: leaf.id,
          pin_id: leafPin.id,
          included: false,
          lesson: 'Do not include unselected route feedback.',
        }),
      ]);
      expect(body.data.chat_context_text).toContain('route_plan:');
      expect(body.data.chat_context_text).toContain('goal: serve a structured context manifest');
      expect(body.data.chat_context_text).toContain('Keep route manifest feedback explicit.');
      expect(body.data.chat_context_text).not.toContain(
        'Do not include unselected route feedback.'
      );
      expect(body.data.extraction_context_text).toContain('Keep route manifest feedback explicit.');
      expect(body.data.token_estimate).toBeGreaterThan(0);
      expect(Array.isArray(body.data.sources)).toBe(true);
    });

    it('returns 404 for non-existent conversation', async () => {
      const res = await app.request('/v1/conversations/conv_nonexistent/context-manifest');
      expect(res.status).toBe(404);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /v1/conversations/:id/memory', () => {
    it('returns built context with empty pins', async () => {
      const res = await app.request(`/v1/conversations/${testConversationId}/memory`);
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('text');
      expect(data.data).toHaveProperty('token_estimate');
      expect(data.data).toHaveProperty('sources');
      expect(typeof data.data.text).toBe('string');
      expect(typeof data.data.token_estimate).toBe('number');
      expect(Array.isArray(data.data.sources)).toBe(true);
    });

    it('returns 404 for non-existent conversation', async () => {
      const res = await app.request('/v1/conversations/conv_nonexistent/memory');
      expect(res.status).toBe(404);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('NOT_FOUND');
    });

    it('returns manifest chat context text from parent baseline and selected feedback', async () => {
      const project = await insertProject(
        mockDB,
        testData.project({ name: 'Memory Manifest Route Test Project' })
      );
      await ensureMainBranch(mockDB, project.projectId);
      const parentCommit = await createCommit(mockDB, {
        project_id: project.projectId,
        author: { type: 'human', id: 'user_test', name: 'Test User' },
        message: 'Memory parent knowledge',
        content: {
          trees: [
            {
              key: 'parent_baseline',
              slots: { goal: 'prefer conversation parent context' },
              children: [],
            },
          ],
          relations: [],
        },
      });
      const branchHeadCommit = await createCommit(mockDB, {
        project_id: project.projectId,
        author: { type: 'human', id: 'user_test', name: 'Test User' },
        message: 'Unrelated branch head',
        content: {
          trees: [
            {
              key: 'branch_head_fallback',
              slots: { goal: 'this should not appear in memory' },
              children: [],
            },
          ],
          relations: [],
        },
      });
      await updateBranchHead(mockDB, project.projectId, 'main', branchHeadCommit.hash);
      const conversation = await insertConversation(mockDB, {
        projectId: project.projectId,
        title: 'Memory Manifest Conversation',
        parentCommitHash: parentCommit.hash,
      });
      const leaf = await createLeaf(mockDB, {
        project_id: project.projectId,
        commit_hash: parentCommit.hash,
        type: 'article',
        title: 'Memory Feedback',
      });
      await updateLeafAssertions(mockDB, leaf.id, [
        {
          id: 'ast_memory_keep',
          constraint_id: 'cst_memory_keep',
          passed: true,
          details: 'Selected memory feedback',
          lesson: 'Memory endpoint must include selected feedback.',
        },
      ]);
      const leafPin = await createPin(mockDB, {
        project_id: project.projectId,
        type: 'leaf',
        ref_id: leaf.id,
        selected_assertion_ids: ['ast_memory_keep'],
      });
      await setConversationContext(mockDB, conversation.conversationId, [leafPin.id]);

      const manifest = await buildConversationContextManifest(mockDB, conversation.conversationId);
      const res = await app.request(`/v1/conversations/${conversation.conversationId}/memory`);
      expect(res.status).toBe(200);

      const body: ApiResponse = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual({
        text: manifest.chat_context_text,
        token_estimate: manifest.token_estimate,
        sources: manifest.sources,
      });
      expect(body.data.text).toContain('parent_baseline:');
      expect(body.data.text).toContain('Memory endpoint must include selected feedback.');
      expect(body.data.text).not.toContain('branch_head_fallback:');
      expect(body.data.text).not.toContain('this should not appear in memory');
    });
  });

  describe('GET /v1/conversations/:id/context-export', () => {
    it('returns JSON format by default', async () => {
      const res = await app.request(`/v1/conversations/${testConversationId}/context-export`);
      expect(res.status).toBe(200);

      // Check headers
      expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
      expect(res.headers.get('Content-Disposition')).toContain('attachment');
      expect(res.headers.get('Content-Disposition')).toContain('.json');

      // Check body is valid JSON
      const data = await res.json();
      expect(data).toHaveProperty('metadata');
      expect(data).toHaveProperty('context');
      expect(data.metadata.format).toBe('json');
      expect(data.metadata.conversation_id).toBe(testConversationId);
    });

    it('returns JSON format with ?format=json', async () => {
      const res = await app.request(
        `/v1/conversations/${testConversationId}/context-export?format=json`
      );
      expect(res.status).toBe(200);

      expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8');

      const data = await res.json();
      expect(data.metadata.format).toBe('json');
    });

    it('returns Markdown format with ?format=markdown', async () => {
      const res = await app.request(
        `/v1/conversations/${testConversationId}/context-export?format=markdown`
      );
      expect(res.status).toBe(200);

      // Check headers
      expect(res.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
      expect(res.headers.get('Content-Disposition')).toContain('attachment');
      expect(res.headers.get('Content-Disposition')).toContain('.md');

      // Check body is markdown
      const text = await res.text();
      expect(text).toContain('# Context Export');
      expect(text).toContain('**Conversation ID:**');
      expect(text).toContain('**Token estimate:**');
      expect(text).toContain('## Sources');
    });

    it('returns 404 for non-existent conversation', async () => {
      const res = await app.request('/v1/conversations/conv_nonexistent/context-export');
      expect(res.status).toBe(404);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('NOT_FOUND');
    });

    it('includes correct filename in Content-Disposition', async () => {
      const res = await app.request(`/v1/conversations/${testConversationId}/context-export`);
      expect(res.status).toBe(200);

      const disposition = res.headers.get('Content-Disposition');
      expect(disposition).toContain(`filename="${testConversationId}-context.json"`);
    });

    it('includes correct filename for markdown format', async () => {
      const res = await app.request(
        `/v1/conversations/${testConversationId}/context-export?format=markdown`
      );
      expect(res.status).toBe(200);

      const disposition = res.headers.get('Content-Disposition');
      expect(disposition).toContain(`filename="${testConversationId}-context.md"`);
    });

    it('JSON export includes context with text, token_estimate, and sources', async () => {
      const res = await app.request(`/v1/conversations/${testConversationId}/context-export`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.context).toHaveProperty('text');
      expect(data.context).toHaveProperty('token_estimate');
      expect(data.context).toHaveProperty('sources');
      expect(typeof data.context.text).toBe('string');
      expect(typeof data.context.token_estimate).toBe('number');
      expect(Array.isArray(data.context.sources)).toBe(true);
    });

    it('exports with metadata including exported_at timestamp', async () => {
      const res = await app.request(`/v1/conversations/${testConversationId}/context-export`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.metadata.exported_at).toBeDefined();
      // Check it's a valid ISO date string
      const exportedAt = new Date(data.metadata.exported_at);
      expect(exportedAt.toISOString()).toBe(data.metadata.exported_at);
    });

    it('exports context from parent baseline instead of branch head fallback', async () => {
      const project = await insertProject(
        mockDB,
        testData.project({ name: 'Context Export Parent Baseline Project' })
      );
      await ensureMainBranch(mockDB, project.projectId);
      const parentCommit = await createCommit(mockDB, {
        project_id: project.projectId,
        author: { type: 'human', id: 'user_test', name: 'Test User' },
        message: 'Export parent knowledge',
        content: {
          trees: [
            {
              key: 'parent_baseline',
              slots: { goal: 'export conversation parent context' },
              children: [],
            },
          ],
          relations: [],
        },
      });
      const branchHeadCommit = await createCommit(mockDB, {
        project_id: project.projectId,
        author: { type: 'human', id: 'user_test', name: 'Test User' },
        message: 'Unrelated export branch head',
        content: {
          trees: [
            {
              key: 'branch_head_fallback',
              slots: { goal: 'this should not appear in export' },
              children: [],
            },
          ],
          relations: [],
        },
      });
      await updateBranchHead(mockDB, project.projectId, 'main', branchHeadCommit.hash);
      const conversation = await insertConversation(mockDB, {
        projectId: project.projectId,
        title: 'Context Export Parent Baseline Conversation',
        parentCommitHash: parentCommit.hash,
      });

      const res = await app.request(
        `/v1/conversations/${conversation.conversationId}/context-export?format=json`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.context.text).toContain('parent_baseline:');
      expect(body.context.text).toContain('goal: export conversation parent context');
      expect(body.context.text).not.toContain('branch_head_fallback:');
      expect(body.context.text).not.toContain('this should not appear in export');
    });
  });
});
