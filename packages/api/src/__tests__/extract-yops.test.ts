/**
 * Tests for POST /v1/extract-yops
 *
 * These tests cover the request validation layer and 404 handling.
 * LLM-dependent paths (actual extraction) are covered by e2e tests
 * that mock the endpoint via page.route().
 */

import { buildYOpsPrompt } from '@t3x-dev/core';
import type { AnyDB } from '@t3x-dev/storage';
import { insertConversation, insertProject } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

// Mock the database module before importing routes
let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// Import routes after mocking
import { extractYopsRoutes } from '../routes/extract-yops.openapi';

const app = new Hono();
app.route('/', extractYopsRoutes);

describe('POST /v1/extract-yops', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let testConversationId: string;

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    const project = await insertProject(mockDB, testData.project({ name: 'ExtractYops Test' }));
    testProjectId = project.projectId;

    const conversation = await insertConversation(mockDB, testData.conversation(testProjectId));
    testConversationId = conversation.conversationId;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('returns 400 for empty conversation_id', async () => {
    const res = await app.request('/v1/extract-yops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: '', turns: [] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_REQUEST');
  });

  it('returns 400 for missing conversation_id', async () => {
    const res = await app.request('/v1/extract-yops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ turns: [] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 404 for unknown conversation', async () => {
    const res = await app.request('/v1/extract-yops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: 'conv_does_not_exist',
        turns: [{ turn_hash: 'sha256:aabbcc', content: 'hello world' }],
      }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('CONVERSATION_NOT_FOUND');
  });

  it('returns 200 with empty ops for empty turns', async () => {
    const res = await app.request('/v1/extract-yops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: testConversationId,
        turns: [],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.ops).toEqual([]);
  });

  it('accepts optional failing_ops field', async () => {
    // With a real conversation but turns that would trigger LLM — the LLM call will
    // fail (no API key in test env), so we only verify the request is accepted up to
    // the extraction step (not a 400 from schema validation).
    const res = await app.request('/v1/extract-yops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: testConversationId,
        turns: [{ turn_hash: 'sha256:aabbcc', content: 'I prefer Tokyo for the trip' }],
        failing_ops: [
          {
            op: { set: { path: 'trip/destination', value: 'Tokyo' } },
            opIndex: 0,
            reason: 'unverifiable_quote',
            detail: 'Quote not found in turn content',
          },
        ],
      }),
    });
    // Either 500 (LLM not configured / call failed) or some other non-400 status
    // We specifically want NOT 400 — that would indicate request schema rejection
    expect(res.status).not.toBe(400);
    const body = await res.json();
    // If 500, error code should be EXTRACTION_FAILED (not INVALID_REQUEST)
    if (!body.success) {
      expect(body.error.code).not.toBe('INVALID_REQUEST');
    }
  });

  it('builds prompt with SOURCE_CONTRACT for incremental mode', () => {
    // Verify that a non-empty snapshot triggers incremental mode, which includes
    // SOURCE_CONTRACT (requiring the LLM to emit per-op `source` fields).
    const snapshot = {
      trees: [{ key: '_root', slots: {}, children: [] }],
      relations: [],
    };
    const turns = [{ turn_hash: 'sha256:t1', role: 'user' as const, content: 'test' }];
    const result = buildYOpsPrompt({ turns, snapshot, processedTurnCount: 0 });
    const fullPrompt = `${result.systemPrompt}\n${result.userPrompt}`;
    expect(fullPrompt).toContain('source');
    expect(fullPrompt.toLowerCase()).toContain('verbatim');
  });
});
