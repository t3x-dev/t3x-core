/**
 * Tree Answer Route Tests
 *
 * Integration tests for POST /v1/extract/trees/answer.
 *
 * The core extraction engine (runApiExtractionV2) is mocked so we can
 * exercise the route's orchestration logic — conversation lookup, drift
 * choice routing, post-drift turn filtering, relation appending, and
 * yops-log persistence — without running a real LLM.
 */

import type { AnyDB } from '@t3x-dev/storage';
import {
  insertConversation,
  insertProject,
  insertTurn,
  insertYOpsLogEntry,
  listTreesByConversation,
  listYOpsLogByConversation,
} from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

// biome-ignore lint/suspicious/noExplicitAny: test helper
type ApiResponse = any;

/**
 * Test helper — wraps a YOp with a HumanSource so the fixture row passes
 * the yops_log_source_required CHECK that landed in #867. The source is
 * deterministic; tests don't assert on it directly.
 */
const withSrc = (op: Record<string, unknown>, author = 'test') => ({
  ...op,
  source: { type: 'human' as const, author, at: '2026-04-25T00:00:00.000Z' },
});

let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

vi.mock('../lib/project-access', () => ({
  assertProjectAccess: vi.fn(() => Promise.resolve({ userId: 'user_test' })),
  getUserId: vi.fn(() => 'user_test'),
}));

const { mockRunApiExtractionV2 } = vi.hoisted(() => ({
  mockRunApiExtractionV2: vi.fn(),
}));

vi.mock('../lib/extraction-v2', () => ({
  runApiExtractionV2: mockRunApiExtractionV2,
}));

import { treeAnswerRoutes } from '../routes/tree-answer.openapi';

describe('Tree Answer Routes', () => {
  let cleanup: () => Promise<void>;
  let projectId: string;
  const app = new Hono();
  app.route('/', treeAnswerRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    const project = await insertProject(mockDB, testData.project({ name: 'Tree Answer Project' }));
    projectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(() => {
    mockRunApiExtractionV2.mockReset();
  });

  // ── Conversation validation ──

  it('returns 404 when conversation does not exist', async () => {
    const res = await app.request('/v1/extract/trees/answer', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        conversation_id: 'conv_missing',
        answers: [{ question_id: 'q_1', drift_choice: 'keep_both_together' }],
      }),
    });

    expect(res.status).toBe(404);
    const body: ApiResponse = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('CONVERSATION_NOT_FOUND');
  });

  // ── Drift Choice 4: keep_both_together ──

  describe('drift_choice: keep_both_together', () => {
    it('invokes v2 with only post-drift turn hashes, appends a relate op, and persists the combined set', async () => {
      const conv = await insertConversation(mockDB, testData.conversation(projectId));

      // Seed the conversation with an extracted "old_topic" tree so the
      // currentSnapshot replay yields an oldRootId we can then relate to
      // the newly-extracted tree.
      const beforeTurn = await insertTurn(
        mockDB,
        testData.turn(projectId, conv.conversationId, { content: 'pre-drift' })
      );

      await insertYOpsLogEntry(mockDB, {
        conversationId: conv.conversationId,
        projectId,
        source: 'pipeline',
        yops: [
          withSrc({ define: { path: 'old_topic' } }),
          withSrc({ populate: { path: 'old_topic', values: { marker: 'pre' } } }),
        ],
        pipelineState: 'completed',
      });

      // Small wait so the next turn is strictly after the yops-log row
      await new Promise((r) => setTimeout(r, 10));

      const afterTurn = await insertTurn(
        mockDB,
        testData.turn(projectId, conv.conversationId, { content: 'drift material' })
      );

      // v2 returns an already-applied snapshot containing both the old and
      // the new root. The new tree's id must not overlap any id in the
      // current snapshot; using a generated id here is fine because the
      // handler only cares about set difference, not specific values.
      mockRunApiExtractionV2.mockResolvedValue({
        ok: true,
        mode: 'incremental',
        snapshot: {
          trees: [{ id: 'tree_new', key: 'new_topic', slots: {}, children: [] }],
          relations: [],
        },
        ops: [{ define: { path: 'new_topic' }, source: { type: 'llm' } }],
        lastTurnHash: afterTurn.turnHash,
      });

      const res = await app.request('/v1/extract/trees/answer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conv.conversationId,
          answers: [{ question_id: 'q_drift', drift_choice: 'keep_both_together' }],
          drift_context: { relation: 'causes', new_topic: 'new_topic' },
        }),
      });

      expect(res.status).toBe(200);
      const body: ApiResponse = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.applied).toBe(true);

      // v2 was invoked with the post-drift turn hash only
      expect(mockRunApiExtractionV2).toHaveBeenCalledTimes(1);
      const call = mockRunApiExtractionV2.mock.calls[0][0];
      expect(call.conversationId).toBe(conv.conversationId);
      expect(call.turnHashes).toEqual([afterTurn.turnHash]);
      expect(call.turnHashes).not.toContain(beforeTurn.turnHash);

      // The persisted yops-log entry contains the extraction op + relate op.
      // Don't assert specific ids on the relate — the oldRoot id is whatever
      // the replay generated; the contract we care about is that a relate op
      // of the correct type is appended.
      const persisted = await listYOpsLogByConversation(mockDB, conv.conversationId);
      const pipelineEntries = persisted.filter((r) => r.source === 'pipeline');
      const latest = pipelineEntries[pipelineEntries.length - 1];
      // biome-ignore lint/suspicious/noExplicitAny: generic yops shape
      const persistedYops = latest.yops as any[];
      expect(persistedYops.length).toBe(2);
      const relateOp = persistedYops.find((op) => 'relate' in op);
      expect(relateOp).toBeDefined();
      expect(relateOp.relate.type).toBe('causes');
      // flattenTrees identifies nodes by key; the relate op connects whatever
      // replay-derived old root to the newly-extracted root.
      expect(typeof relateOp.relate.from).toBe('string');
      expect(typeof relateOp.relate.to).toBe('string');
      expect(relateOp.relate.from).not.toBe(relateOp.relate.to);

      // Regression: the appended relate op MUST carry per-op source.
      // yops_log_source_required would otherwise reject the row in
      // production, even though the test's seed entries were sourced.
      expect(relateOp.source).toBeDefined();
      expect(relateOp.source.type).toBe('human');
      expect(relateOp.source.author).toBe('api:drift-keep-both-together');
      expect(typeof relateOp.source.at).toBe('string');

      // Materialised trees table is rebuilt in the same transaction as the
      // yops_log write — reads against `trees` should not lag the log.
      // Regression for the bug where tree-answer skipped syncYOpsToTrees:
      // the table was empty after a successful answer/collapse write because
      // syncYOpsToTrees was never called.
      const treeRows = await listTreesByConversation(mockDB, conv.conversationId);
      expect(treeRows.length).toBeGreaterThan(0);
      expect(treeRows.map((r) => r.type)).toContain('old_topic');
    });

    it('defaults the relation to "follows" when drift_context.relation is missing or invalid', async () => {
      const conv = await insertConversation(mockDB, testData.conversation(projectId));
      await insertTurn(
        mockDB,
        testData.turn(projectId, conv.conversationId, { content: 'pre-drift' })
      );

      // Seed prior extraction so there's an old root to relate from
      await insertYOpsLogEntry(mockDB, {
        conversationId: conv.conversationId,
        projectId,
        source: 'pipeline',
        yops: [withSrc({ define: { path: 'seed_topic' } })],
        pipelineState: 'completed',
      });

      await new Promise((r) => setTimeout(r, 10));
      const afterTurn = await insertTurn(
        mockDB,
        testData.turn(projectId, conv.conversationId, { content: 'drift content' })
      );

      mockRunApiExtractionV2.mockResolvedValue({
        ok: true,
        mode: 'incremental',
        snapshot: {
          trees: [{ id: 'tree_new', key: 'new', slots: {}, children: [] }],
          relations: [],
        },
        ops: [{ define: { path: 'new' }, source: { type: 'llm' } }],
        lastTurnHash: afterTurn.turnHash,
      });

      const res = await app.request('/v1/extract/trees/answer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conv.conversationId,
          answers: [{ question_id: 'q_drift', drift_choice: 'keep_both_together' }],
          drift_context: { relation: 'not_a_real_relation' },
        }),
      });

      expect(res.status).toBe(200);
      const persisted = await listYOpsLogByConversation(mockDB, conv.conversationId);
      const pipelineEntries = persisted.filter((r) => r.source === 'pipeline');
      const latest = pipelineEntries[pipelineEntries.length - 1];
      // biome-ignore lint/suspicious/noExplicitAny: generic yops shape
      const relateOp = (latest.yops as any[]).find((op) => 'relate' in op);
      expect(relateOp).toBeDefined();
      expect(relateOp.relate.type).toBe('follows');
    });

    it('surfaces v2 extraction failures via the EXTRACTION_FAILED error code', async () => {
      const conv = await insertConversation(mockDB, testData.conversation(projectId));
      await insertTurn(mockDB, testData.turn(projectId, conv.conversationId));

      mockRunApiExtractionV2.mockResolvedValue({
        ok: false,
        kind: 'failure',
        message: 'LLM returned malformed draft',
      });

      const res = await app.request('/v1/extract/trees/answer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conv.conversationId,
          answers: [{ question_id: 'q_drift', drift_choice: 'keep_both_together' }],
        }),
      });

      // EXTRACTION_FAILED is mapped to HTTP 500 by ErrorStatusCodes — this
      // mirrors the pre-migration behavior where the legacy Extractor error
      // path took the same code.
      expect(res.status).toBe(500);
      const body: ApiResponse = await res.json();
      expect(body.error.code).toBe('EXTRACTION_FAILED');
      expect(body.error.message).toContain('malformed');
    });

    it('rejects the request when all turns are already extracted (no post-drift turns)', async () => {
      const conv = await insertConversation(mockDB, testData.conversation(projectId));
      await insertTurn(mockDB, testData.turn(projectId, conv.conversationId));

      // All turns predate the yops-log entry (simulated by creating the entry
      // after the turns so every turn is <= lastExtractionTime)
      await new Promise((r) => setTimeout(r, 10));
      await insertYOpsLogEntry(mockDB, {
        conversationId: conv.conversationId,
        projectId,
        source: 'pipeline',
        yops: [withSrc({ define: { path: 'x' } })],
        pipelineState: 'completed',
      });

      const res = await app.request('/v1/extract/trees/answer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conv.conversationId,
          answers: [{ question_id: 'q_drift', drift_choice: 'keep_both_together' }],
        }),
      });

      expect(res.status).toBe(400);
      const body: ApiResponse = await res.json();
      expect(body.error.code).toBe('INVALID_REQUEST');
      expect(body.error.message).toContain('post-drift');
      expect(mockRunApiExtractionV2).not.toHaveBeenCalled();
    });
  });

  // ── Drift Choice 3: keep_both_separate ──

  describe('drift_choice: keep_both_separate', () => {
    it('creates a new project + conversation with the post-drift turns copied', async () => {
      const conv = await insertConversation(mockDB, testData.conversation(projectId));

      await insertTurn(
        mockDB,
        testData.turn(projectId, conv.conversationId, { content: 'pre-drift content' })
      );

      await insertYOpsLogEntry(mockDB, {
        conversationId: conv.conversationId,
        projectId,
        source: 'pipeline',
        yops: [withSrc({ define: { path: 'old_topic' } })],
        pipelineState: 'completed',
      });

      await new Promise((r) => setTimeout(r, 10));

      await insertTurn(
        mockDB,
        testData.turn(projectId, conv.conversationId, { content: 'post-drift content' })
      );

      const res = await app.request('/v1/extract/trees/answer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conv.conversationId,
          answers: [{ question_id: 'q_drift', drift_choice: 'keep_both_separate' }],
          drift_context: { new_topic: 'split_topic' },
        }),
      });

      expect(res.status).toBe(200);
      const body: ApiResponse = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.applied).toBe(true);
      expect(body.data.new_project_id).toMatch(/^proj_/);
      // v2 is not invoked for drift choice 3 — the frontend triggers extraction
      // in the new project separately.
      expect(mockRunApiExtractionV2).not.toHaveBeenCalled();
    });

    it('rejects when there are no post-drift turns to copy', async () => {
      const conv = await insertConversation(mockDB, testData.conversation(projectId));
      await insertTurn(mockDB, testData.turn(projectId, conv.conversationId));

      await new Promise((r) => setTimeout(r, 10));
      await insertYOpsLogEntry(mockDB, {
        conversationId: conv.conversationId,
        projectId,
        source: 'pipeline',
        yops: [withSrc({ define: { path: 'x' } })],
        pipelineState: 'completed',
      });

      const res = await app.request('/v1/extract/trees/answer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conv.conversationId,
          answers: [{ question_id: 'q_drift', drift_choice: 'keep_both_separate' }],
        }),
      });

      expect(res.status).toBe(400);
      const body: ApiResponse = await res.json();
      expect(body.error.code).toBe('INVALID_REQUEST');
      expect(body.error.message).toMatch(/post-drift turns/i);
    });
  });
});
