/**
 * Suggest Constraints Route Tests
 *
 * Tests for POST /v1/leaves/:id/suggest-constraints endpoint.
 */

import { insertProject } from '@t3x-dev/storage';
import type { PGLiteDB } from '@t3x-dev/storage/pglite';
import { createCommitV4, createLeaf } from '@t3x-dev/storage/pglite';
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
  generateWithFallback: vi.fn(),
  getLLMProvider: vi.fn(),
}));

// Mock generation functions (needed by leaves route)
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

// Mock embedder (needed by leaves route)
vi.mock('../lib/embedder', () => ({
  getEmbedder: vi.fn().mockResolvedValue(null),
  isSemanticValidationConfigured: vi.fn().mockReturnValue(false),
}));

// Mock webhook dispatcher
vi.mock('../lib/webhook-dispatcher', () => ({
  webhookDispatcher: {
    dispatch: vi.fn(),
  },
}));

import { leavesRoutes } from '../routes/leaves.openapi';

describe('Suggest Constraints', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let testCommitHash: string;
  let testLeafId: string;
  const app = new Hono();
  app.route('/', leavesRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    const project = await insertProject(
      mockDB,
      testData.project({ name: 'Suggest Constraints Test' })
    );
    testProjectId = project.projectId;

    // Create a commit with sentences
    const commit = await createCommitV4(mockDB, {
      author: { type: 'human', name: 'test' },
      sentences: [
        { id: 's_test001', text: 'The user prefers budget-friendly travel.', confidence: 0.9 },
        { id: 's_test002', text: 'The user wants to visit Japan in spring.', confidence: 0.95 },
      ],
      project_id: testProjectId,
      message: 'Test commit for suggestion',
      branch: 'main',
    });
    testCommitHash = commit.hash;

    // Create a leaf
    const leaf = await createLeaf(mockDB, {
      commit_hash: testCommitHash,
      type: 'tweet',
      title: 'Test Tweet',
      project_id: testProjectId,
    });
    testLeafId = leaf.id;
  });

  afterAll(async () => {
    await cleanup?.();
  });

  function setupMockLLM() {
    const mockLlmResponse = JSON.stringify([
      {
        type: 'require',
        match_mode: 'semantic',
        value: 'budget-friendly travel',
        reason: 'Core user preference',
        confidence: 0.95,
      },
      {
        type: 'exclude',
        match_mode: 'exact',
        value: 'luxury resort',
        reason: 'Contradicts budget preference',
        confidence: 0.8,
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

  it('suggests constraints for a leaf', async () => {
    setupMockLLM();

    const res = await app.request(`/v1/leaves/${testLeafId}/suggest-constraints`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const body: ApiResponse = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.suggestions.length).toBeGreaterThan(0);
    expect(body.data.constraints.length).toBeGreaterThan(0);
    expect(body.data.constraints[0].id).toMatch(/^cst_/);
    expect(body.data.model).toBe('test-provider');
  });

  it('returns 404 for non-existent leaf', async () => {
    setupMockLLM();

    const res = await app.request('/v1/leaves/leaf_nonexistent/suggest-constraints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(404);
    const body: ApiResponse = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 503 when LLM not configured', async () => {
    const allProvidersError = new Error('No providers available');
    allProvidersError.name = 'AllProvidersFailedError';

    mockGetProviderRegistry.mockResolvedValue({
      tryWithFallback: vi.fn().mockRejectedValue(allProvidersError),
    });

    const res = await app.request(`/v1/leaves/${testLeafId}/suggest-constraints`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(503);
    const body: ApiResponse = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('LLM_NOT_CONFIGURED');
  });

  it('passes max_suggestions option', async () => {
    setupMockLLM();

    const res = await app.request(`/v1/leaves/${testLeafId}/suggest-constraints`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_suggestions: 5 }),
    });

    expect(res.status).toBe(200);
    const body: ApiResponse = await res.json();
    expect(body.success).toBe(true);
  });
});
