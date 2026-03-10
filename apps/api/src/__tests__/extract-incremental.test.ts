/**
 * Incremental Extraction Route Tests
 *
 * Integration tests for POST /v1/extract/incremental endpoint.
 */

import { insertConversation, insertProject, insertTurn } from '@t3x-dev/storage';
import type { PGLiteDB } from '@t3x-dev/storage/pglite';
import { insertDraftV3 } from '@t3x-dev/storage/pglite';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

// biome-ignore lint/suspicious/noExplicitAny: test helper
type ApiResponse = any;

let mockDB: PGLiteDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// Mock provider registry
const { mockGetProviderRegistry } = vi.hoisted(() => ({
  mockGetProviderRegistry: vi.fn(),
}));

vi.mock('../lib/provider-registry', () => ({
  getProviderRegistry: mockGetProviderRegistry,
}));

import { extractRoutes } from '../routes/extract.openapi';

describe('POST /v1/extract/incremental', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let testConversationId: string;
  let testDraftId: string;
  let turnHash1: string;
  let turnHash2: string;
  const app = new Hono();
  app.route('/', extractRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    const project = await insertProject(
      mockDB,
      testData.project({ name: 'Incremental Extract Test' })
    );
    testProjectId = project.projectId;

    const conv = await insertConversation(
      mockDB,
      testData.conversation(testProjectId, { title: 'Test Conv' })
    );
    testConversationId = conv.conversationId;

    const turn1 = await insertTurn(mockDB, {
      projectId: testProjectId,
      conversationId: testConversationId,
      role: 'user',
      content: 'I love dark mode and use it everywhere.',
    });
    turnHash1 = turn1.turnHash;

    const turn2 = await insertTurn(mockDB, {
      projectId: testProjectId,
      conversationId: testConversationId,
      role: 'assistant',
      content: 'Dark mode reduces eye strain and saves battery on OLED screens.',
    });
    turnHash2 = turn2.turnHash;

    const draft = await insertDraftV3(mockDB, {
      project_id: testProjectId,
      title: 'Incremental test draft',
    });
    testDraftId = draft.id;
  });

  afterAll(async () => {
    await cleanup?.();
  });

  it('extracts new points and splits by confidence', async () => {
    // LLM returns JSON with two proposals: one high-confidence direct, one low-confidence implicit
    const llmResponse = JSON.stringify([
      {
        type: 'new',
        text: 'User prefers dark mode.',
        confidence: 0.95,
        inference_type: 'direct',
        reasoning: 'Directly stated preference',
        evidence: [
          {
            conversation_id: testConversationId,
            turn_hash: turnHash1,
            quoted_text: 'love dark mode',
            role: 'primary',
            relevance: 'stated',
          },
        ],
      },
      {
        type: 'new',
        text: 'User cares about screen health.',
        confidence: 0.55,
        inference_type: 'implicit',
        reasoning: 'Inferred from dark mode preference',
        evidence: [
          {
            conversation_id: testConversationId,
            turn_hash: turnHash2,
            quoted_text: 'reduces eye strain',
            role: 'primary',
            relevance: 'inferred',
          },
        ],
      },
    ]);

    mockGetProviderRegistry.mockResolvedValue({
      tryWithFallback: vi
        .fn()
        .mockImplementation(async (_role: string, fn: (provider: unknown) => Promise<unknown>) => {
          const mockProvider = {
            id: 'test-provider',
            generate: vi.fn().mockResolvedValue(llmResponse),
            resolveConflict: vi.fn(),
          };
          return fn(mockProvider);
        }),
    });

    const res = await app.request('/v1/extract/incremental', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: testProjectId,
        conversation_id: testConversationId,
        draft_id: testDraftId,
      }),
    });

    expect(res.status).toBe(200);
    const data: ApiResponse = await res.json();
    expect(data.success).toBe(true);

    // High-confidence direct → ready zone
    expect(data.data.ready_points.length).toBeGreaterThanOrEqual(1);
    const readyPoint = data.data.ready_points[0];
    expect(readyPoint.zone).toBe('ready');
    expect(readyPoint.text).toBe('User prefers dark mode.');

    // Implicit → review zone (implicit always goes to review)
    expect(data.data.review_points.length).toBeGreaterThanOrEqual(1);
    const reviewPoint = data.data.review_points[0];
    expect(reviewPoint.zone).toBe('review');

    // Cursor updated
    expect(data.data.cursor).toBeDefined();
    expect(data.data.cursor.cursors[testConversationId]).toBeDefined();

    // Stats present
    expect(data.data.stats).toBeDefined();
    expect(data.data.stats.proposals).toBeGreaterThanOrEqual(2);
  });

  it('returns 404 for non-existent draft', async () => {
    const res = await app.request('/v1/extract/incremental', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: testProjectId,
        conversation_id: testConversationId,
        draft_id: 'draft_nonexistent',
      }),
    });

    const data: ApiResponse = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('NOT_FOUND');
  });

  it('rejects hallucinated proposals with non-existent turn_hash', async () => {
    const llmResponse = JSON.stringify([
      {
        type: 'new',
        text: 'Hallucinated fact.',
        confidence: 0.9,
        inference_type: 'direct',
        reasoning: 'Made up',
        evidence: [
          {
            conversation_id: testConversationId,
            turn_hash: 'sha256:nonexistent_turn',
            quoted_text: 'does not exist',
            role: 'primary',
            relevance: 'stated',
          },
        ],
      },
    ]);

    mockGetProviderRegistry.mockResolvedValue({
      tryWithFallback: vi
        .fn()
        .mockImplementation(async (_role: string, fn: (provider: unknown) => Promise<unknown>) => {
          const mockProvider = {
            id: 'test-provider',
            generate: vi.fn().mockResolvedValue(llmResponse),
            resolveConflict: vi.fn(),
          };
          return fn(mockProvider);
        }),
    });

    const res = await app.request('/v1/extract/incremental', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: testProjectId,
        conversation_id: testConversationId,
        draft_id: testDraftId,
      }),
    });

    expect(res.status).toBe(200);
    const data: ApiResponse = await res.json();
    expect(data.success).toBe(true);
    // The hallucinated proposal should be rejected
    expect(data.data.stats.rejected).toBeGreaterThanOrEqual(1);
    // No points should land in ready or review
    expect(data.data.ready_points.length + data.data.review_points.length).toBe(0);
  });
});
