/**
 * Extract Route Tests
 *
 * Tests for POST /v1/extract/sentences endpoint.
 */

import { insertConversation, insertProject, insertTurn } from '@t3x-dev/storage';
import type { AnyDB } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

// biome-ignore lint/suspicious/noExplicitAny: test helper
type ApiResponse = any;

let mockDB: AnyDB;

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

describe('Extract Routes', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let testConversationId: string;
  const app = new Hono();
  app.route('/', extractRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    // Create test project + conversation + turns
    const project = await insertProject(mockDB, testData.project({ name: 'Extract Test' }));
    testProjectId = project.projectId;

    const conv = await insertConversation(
      mockDB,
      testData.conversation(testProjectId, { title: 'Test Conv' })
    );
    testConversationId = conv.conversationId;

    await insertTurn(mockDB, {
      projectId: testProjectId,
      conversationId: testConversationId,
      role: 'user',
      content: 'I want to visit Japan next spring for cherry blossoms.',
    });

    await insertTurn(mockDB, {
      projectId: testProjectId,
      conversationId: testConversationId,
      role: 'assistant',
      content: 'March to April is the best time for cherry blossoms in Japan.',
    });
  });

  afterAll(async () => {
    await cleanup?.();
  });

  it('extracts sentences from conversation', async () => {
    const mockLlmResponse = JSON.stringify([
      {
        text: 'The user wants to visit Japan in spring for cherry blossoms.',
        confidence: 0.95,
        quote: 'visit Japan next spring for cherry blossoms',
        turn_index: 0,
      },
      {
        text: 'March to April is optimal for cherry blossom viewing in Japan.',
        confidence: 0.9,
        quote: 'March to April is the best time for cherry blossoms',
        turn_index: 1,
      },
    ]);

    mockGetProviderRegistry.mockResolvedValue({
      tryWithFallback: vi
        .fn()
        .mockImplementation(async (_role: string, fn: (provider: unknown) => Promise<unknown>) => {
          const mockProvider = {
            id: 'test-provider',
            generate: vi.fn().mockResolvedValue({ text: mockLlmResponse, usage: { inputTokens: 10, outputTokens: 5 } }),
            resolveConflict: vi.fn(),
          };
          return fn(mockProvider);
        }),
    });

    const res = await app.request('/v1/extract/sentences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: testProjectId,
        conversation_id: testConversationId,
      }),
    });

    expect(res.status).toBe(200);
    const body: ApiResponse = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.sentences.length).toBeGreaterThan(0);
    expect(body.data.model).toBe('test-provider');
    expect(body.data.stats.total_turns).toBe(2);
    expect(body.data.stats.extracted).toBeGreaterThan(0);
  });

  it('returns 404 for empty conversation', async () => {
    mockGetProviderRegistry.mockResolvedValue({
      tryWithFallback: vi.fn().mockResolvedValue({
        sentences: [],
        model: 'test',
      }),
    });

    const res = await app.request('/v1/extract/sentences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: testProjectId,
        conversation_id: 'conv_nonexistent',
      }),
    });

    expect(res.status).toBe(404);
    const body: ApiResponse = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('CONVERSATION_NOT_FOUND');
  });

  it('returns 503 when LLM not configured', async () => {
    const allProvidersError = new Error('No providers available');
    allProvidersError.name = 'AllProvidersFailedError';

    mockGetProviderRegistry.mockResolvedValue({
      tryWithFallback: vi.fn().mockRejectedValue(allProvidersError),
    });

    const res = await app.request('/v1/extract/sentences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: testProjectId,
        conversation_id: testConversationId,
      }),
    });

    expect(res.status).toBe(503);
    const body: ApiResponse = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('LLM_NOT_CONFIGURED');
  });

  it('returns 400 for missing required fields', async () => {
    const res = await app.request('/v1/extract/sentences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });
});
