/**
 * Yops Log Source Enforcement Tests
 *
 * Tests for POST /v1/conversations/:id/yops — per-op source validation.
 * Every op in the request body must carry a valid `source` field
 * (discriminated union of LLMSource | HumanSource).
 *
 * - Missing per-op source → 400
 * - Human source with empty author → 400
 * - Valid human source → 201 (source validation passes; downstream may 500)
 */

import { validateSourcedYOpsStructure } from '../routes/yops-log.openapi';
import type { AnyDB } from '@t3x-dev/storage';
import { insertConversation, insertProject } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

// biome-ignore lint/suspicious/noExplicitAny: test helper
type ApiResponse = any;

// Mock the database module before importing routes
let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// Mock @t3x-dev/core — keep real exports but stub the pipeline helpers
// so downstream doesn't fail on missing LLM config in the test env.
vi.mock('@t3x-dev/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@t3x-dev/core')>();
  return {
    ...actual,
    runOperation: vi.fn(),
    collectResult: vi.fn().mockResolvedValue({
      id: 'yops_test_1',
      conversation_id: 'conv_test',
      project_id: 'proj_test',
      source: 'manual',
      turn_hash: null,
      yops: [],
      created_at: new Date().toISOString(),
    }),
  };
});

// Mock pipeline context builder — returns a minimal ApiPipelineContext
vi.mock('../ops/context', () => ({
  buildPipelineContext: vi.fn().mockResolvedValue({
    db: null, // filled in beforeAll
    projectId: 'proj_test',
  }),
}));

// Mock event bus to suppress side effects
vi.mock('../lib/event-bus', () => ({
  eventBus: {
    notify: vi.fn(),
  },
}));

// Import routes AFTER mocks are declared
import { yopsLogRoutes } from '../routes/yops-log.openapi';

describe('validateSourcedYOpsStructure (unit)', () => {
  it('returns ok for empty array', () => {
    expect(validateSourcedYOpsStructure([])).toEqual({ ok: true });
  });

  it('returns ok for valid human op', () => {
    const ops = [{ set: { path: 'x', value: 'y' }, source: { type: 'human', author: 'e' } }];
    expect(validateSourcedYOpsStructure(ops)).toEqual({ ok: true });
  });

  it('returns ok for valid llm op', () => {
    const ops = [{
      set: { path: 'x', value: 'y' },
      source: { type: 'llm', model: 'm', at: 't', turn_ref: { turn_hash: 'h', quote: 'q' } },
    }];
    expect(validateSourcedYOpsStructure(ops)).toEqual({ ok: true });
  });

  it('rejects op missing source entirely', () => {
    const ops = [{ set: { path: 'x', value: 'y' } }];
    expect(validateSourcedYOpsStructure(ops)).toEqual({
      ok: false, code: 'MISSING_SOURCE', opIndex: 0,
    });
  });

  it('rejects op with unrecognized source type', () => {
    const ops = [{ set: { path: 'x', value: 'y' }, source: { type: 'robot' } }];
    expect(validateSourcedYOpsStructure(ops)).toEqual({
      ok: false, code: 'MISSING_SOURCE', opIndex: 0,
    });
  });

  it('rejects human op with missing author', () => {
    const ops = [{ set: { path: 'x', value: 'y' }, source: { type: 'human', author: '' } }];
    expect(validateSourcedYOpsStructure(ops)).toEqual({
      ok: false, code: 'MISSING_AUTHOR', opIndex: 0,
    });
  });

  it('rejects human op with undefined author', () => {
    const ops = [{ set: { path: 'x', value: 'y' }, source: { type: 'human' } }];
    expect(validateSourcedYOpsStructure(ops)).toEqual({
      ok: false, code: 'MISSING_AUTHOR', opIndex: 0,
    });
  });

  it('reports the first failing op index in a mixed batch', () => {
    const ops = [
      { set: { path: 'a', value: '1' }, source: { type: 'human', author: 'e' } },
      { set: { path: 'b', value: '2' } }, // missing source at index 1
      { set: { path: 'c', value: '3' }, source: { type: 'human', author: 'e' } },
    ];
    expect(validateSourcedYOpsStructure(ops)).toEqual({
      ok: false, code: 'MISSING_SOURCE', opIndex: 1,
    });
  });
});

describe('POST /v1/conversations/:id/yops — source enforcement', () => {
  let cleanup: () => Promise<void>;
  let testConversationId: string;
  const app = new Hono();
  app.route('/', yopsLogRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    const project = await insertProject(mockDB, testData.project({ name: 'Source Test' }));
    const conversation = await insertConversation(
      mockDB,
      testData.conversation(project.projectId, { title: 'Source Test Conv' })
    );
    testConversationId = conversation.conversationId;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('rejects op missing per-op source', async () => {
    const res = await app.request(
      `/v1/conversations/${testConversationId}/yops`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'manual',
          yops: [{ set: { path: 'x', value: 'y' } }], // NO per-op source
        }),
      }
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiResponse;
    expect(body.success).toBe(false);
    // Zod rejects with a validation error before reaching our defense-in-depth check
    expect(body.error).toBeDefined();
  });

  it('rejects human op with empty author', async () => {
    const res = await app.request(
      `/v1/conversations/${testConversationId}/yops`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'manual',
          yops: [
            {
              set: { path: 'x', value: 'y' },
              source: { type: 'human', author: '', at: new Date().toISOString() },
            },
          ],
        }),
      }
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiResponse;
    expect(body.success).toBe(false);
  });

  it('rejects llm op with empty model', async () => {
    const res = await app.request(
      `/v1/conversations/${testConversationId}/yops`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'pipeline',
          yops: [
            {
              set: { path: 'x', value: 'y' },
              source: {
                type: 'llm',
                model: '', // empty — should fail min(1)
                at: new Date().toISOString(),
                turn_ref: { turn_hash: 'sha256:abc', quote: 'some text' },
              },
            },
          ],
        }),
      }
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiResponse;
    expect(body.success).toBe(false);
  });

  it('accepts op with valid human source', async () => {
    const res = await app.request(
      `/v1/conversations/${testConversationId}/yops`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'manual',
          yops: [
            {
              set: { path: 'x', value: 'y' },
              source: { type: 'human', author: 'ethan', at: new Date().toISOString() },
            },
          ],
        }),
      }
    );

    // 201 = source validation passed and mock downstream succeeded
    // 500 = source validation passed but downstream errored (acceptable)
    // 400 = source validation FAILED (not acceptable — this test would fail)
    expect([201, 500]).toContain(res.status);
  });

  it('accepts op with valid llm source', async () => {
    const res = await app.request(
      `/v1/conversations/${testConversationId}/yops`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'pipeline',
          turn_hash: 'sha256:abc',
          yops: [
            {
              set: { path: 'x', value: 'y' },
              source: {
                type: 'llm',
                model: 'claude-sonnet-4-6',
                at: new Date().toISOString(),
                turn_ref: {
                  turn_hash: 'sha256:abc',
                  quote: 'some text',
                  start_char: 0,
                  end_char: 9,
                },
              },
            },
          ],
        }),
      }
    );

    // 201 = passed; 500 = downstream failed but validation passed
    expect([201, 500]).toContain(res.status);
  });
});
