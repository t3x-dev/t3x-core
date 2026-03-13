/**
 * Drafts Extract Route Tests
 *
 * Tests for POST /v1/drafts/:id/extract endpoint.
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

// Mock generation functions (needed by drafts route)
const { mockGenerateLeafOutput, mockIsGenerationConfigured } = vi.hoisted(() => ({
  mockGenerateLeafOutput: vi.fn(),
  mockIsGenerationConfigured: vi.fn(),
}));

vi.mock('@t3x-dev/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@t3x-dev/core')>();
  return {
    ...actual,
    generateLeafOutput: mockGenerateLeafOutput,
    isGenerationConfigured: mockIsGenerationConfigured,
  };
});

import { draftsRoutes } from '../routes/drafts.openapi';

describe('Drafts Extract', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let testConversationId: string;
  const app = new Hono();
  app.route('/', draftsRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    const project = await insertProject(mockDB, testData.project({ name: 'Draft Extract Test' }));
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
      content: 'I prefer budget-friendly travel options with good food.',
    });
  });

  afterAll(async () => {
    await cleanup?.();
  });

  function setupMockLLM() {
    const mockLlmResponse = JSON.stringify([
      {
        text: 'The user prefers budget-friendly travel options.',
        confidence: 0.9,
        quote: 'budget-friendly travel options',
        turn_index: 0,
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
  }

  it('extracts sentences and adds to draft', async () => {
    setupMockLLM();

    const draft = await insertDraftV3(mockDB, {
      project_id: testProjectId,
      title: 'Extract Test Draft',
    });

    const res = await app.request(`/v1/drafts/${draft.id}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: testConversationId,
      }),
    });

    expect(res.status).toBe(200);
    const body: ApiResponse = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.added_count).toBeGreaterThan(0);
    expect(body.data.draft.sentences.length).toBe(body.data.added_count);
  });

  it('returns 404 for non-existent draft', async () => {
    setupMockLLM();

    const res = await app.request('/v1/drafts/draft_nonexistent/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: testConversationId,
      }),
    });

    expect(res.status).toBe(404);
    const body: ApiResponse = await res.json();
    expect(body.success).toBe(false);
  });

  it('succeeds for editing draft', async () => {
    setupMockLLM();

    const draft = await insertDraftV3(mockDB, {
      project_id: testProjectId,
      title: 'Editing Draft',
    });

    const res = await app.request(`/v1/drafts/${draft.id}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: testConversationId,
      }),
    });

    // Draft is in 'editing' state, so extraction should succeed
    expect(res.status).toBe(200);
    const body: ApiResponse = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns 503 when LLM not configured', async () => {
    const allProvidersError = new Error('No providers available');
    allProvidersError.name = 'AllProvidersFailedError';

    mockGetProviderRegistry.mockResolvedValue({
      tryWithFallback: vi.fn().mockRejectedValue(allProvidersError),
    });

    const draft = await insertDraftV3(mockDB, {
      project_id: testProjectId,
      title: 'No LLM Draft',
    });

    const res = await app.request(`/v1/drafts/${draft.id}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: testConversationId,
      }),
    });

    expect(res.status).toBe(503);
    const body: ApiResponse = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('LLM_NOT_CONFIGURED');
  });
});
