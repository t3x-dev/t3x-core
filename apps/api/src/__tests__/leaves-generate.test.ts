/**
 * Leaves Generate Route Tests
 *
 * Integration tests for POST /v1/leaves/:id/generate endpoint.
 */

import type { AnyDB } from '@t3x-dev/storage';
import { createCommit, insertProject } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

// biome-ignore lint/suspicious/noExplicitAny: test helper
type ApiResponse = any;

// Hoist the mocks
const { mockGenerateLeafOutput, mockIsGenerationConfigured, MockGenerationError } = vi.hoisted(
  () => {
    // Create a mock GenerationError class
    class MockGenerationError extends Error {
      code: string;
      statusCode?: number;
      constructor(message: string, code: string, statusCode?: number) {
        super(message);
        this.name = 'GenerationError';
        this.code = code;
        this.statusCode = statusCode;
      }
    }
    return {
      mockGenerateLeafOutput: vi.fn(),
      mockIsGenerationConfigured: vi.fn(),
      MockGenerationError,
    };
  }
);

// Mock the database module
let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// Mock the @t3x-dev/core generation functions
// Use importOriginal to get LEAF_TYPES and other non-mocked exports
vi.mock('@t3x-dev/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@t3x-dev/core')>();
  return {
    ...actual,
    generateLeafOutput: mockGenerateLeafOutput,
    isGenerationConfigured: mockIsGenerationConfigured,
    GenerationError: MockGenerationError,
  };
});

// Mock provider-registry so generateWithFallback delegates to the mocked generateLeafOutput
vi.mock('../lib/provider-registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/provider-registry')>();
  return {
    ...actual,
    getLLMProvider: vi.fn(() => Promise.resolve({ id: 'mock', generate: vi.fn() })),
    generateWithFallback: vi.fn((options: Record<string, unknown>) =>
      mockGenerateLeafOutput(options)
    ),
  };
});

// Import routes after mocking
import { leavesRoutes } from '../routes/leaves.openapi';

describe('POST /v1/leaves/:id/generate', () => {
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

    // Create a test project
    const project = await insertProject(
      mockDB,
      testData.project({ name: 'Generate Test Project' })
    );
    testProjectId = project.projectId;

    // Create a test commit
    const commit = await createCommit(mockDB, {
      author: { type: 'human', name: 'Test User' },
      content: {
        frames: [
          { id: 's_1', text: 'User prefers dark mode' },
          { id: 's_2', text: 'User speaks English' },
        ].map((s) => ({
          id: s.id,
          type: 'legacy_sentence' as const,
          slots: { text: s.text },
          // biome-ignore lint/suspicious/noExplicitAny: test mock access
          confidence: (s as any).confidence ?? 1,
        })),
        relations: [],
      },
      project_id: testProjectId,
      branch: 'main',
      message: 'Test commit for generation',
    });
    testCommitHash = commit.hash;
  });

  beforeEach(async () => {
    // Reset mocks
    mockGenerateLeafOutput.mockReset();
    mockIsGenerationConfigured.mockReset();

    // Create a fresh test leaf for each test
    const res = await app.request('/v1/leaves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commit_hash: testCommitHash,
        type: 'tweet',
        title: 'Test Tweet',
        constraints: [{ type: 'require', match_mode: 'exact', value: 'dark mode' }],
        project_id: testProjectId,
      }),
    });
    const data: ApiResponse = await res.json();
    testLeafId = data.data.id;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('generates output successfully', async () => {
    mockIsGenerationConfigured.mockReturnValue(true);
    mockGenerateLeafOutput.mockResolvedValue({
      output: 'I love using dark mode! #DarkMode #Preferences',
      model: 'claude-sonnet-4-20250514',
      usage: {
        inputTokens: 150,
        outputTokens: 25,
      },
      prompt: {
        system: 'You are a content generation assistant...',
        user: 'Generate a tweet about dark mode preferences...',
      },
    });

    const res = await app.request(`/v1/leaves/${testLeafId}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);

    // Response format per contract (contracts.ts GenerateLeafOutputResponse)
    const data: ApiResponse = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.output).toBe('I love using dark mode! #DarkMode #Preferences');
    expect(data.data.generated_at).toBeDefined();
  });

  it('saves output and generated_at to leaf', async () => {
    mockIsGenerationConfigured.mockReturnValue(true);
    mockGenerateLeafOutput.mockResolvedValue({
      output: 'Generated content',
      model: 'claude-sonnet-4-20250514',
      usage: { inputTokens: 100, outputTokens: 20 },
      prompt: { system: 'system', user: 'user' },
    });

    await app.request(`/v1/leaves/${testLeafId}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    // Verify leaf was updated
    const getRes = await app.request(`/v1/leaves/${testLeafId}`);
    const getData: ApiResponse = await getRes.json();
    expect(getData.data.output).toBe('Generated content');
    expect(getData.data.generated_at).toBeDefined();
  });

  it('returns contract-compliant response format', async () => {
    mockIsGenerationConfigured.mockReturnValue(true);
    mockGenerateLeafOutput.mockResolvedValue({
      output: 'Test output',
      model: 'claude-opus-4-20250514',
      usage: { inputTokens: 200, outputTokens: 50 },
      prompt: { system: 'sys', user: 'usr' },
    });

    const res = await app.request(`/v1/leaves/${testLeafId}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    // Verify response matches GenerateLeafOutputResponse contract
    const data: ApiResponse = await res.json();
    expect(data.success).toBe(true);
    expect(data.data).toHaveProperty('output');
    expect(data.data).toHaveProperty('generated_at');
    expect(typeof data.data.output).toBe('string');
    expect(typeof data.data.generated_at).toBe('string');
  });

  it('calls generateLeafOutput with commit and leaf', async () => {
    mockIsGenerationConfigured.mockReturnValue(true);
    mockGenerateLeafOutput.mockResolvedValue({
      output: 'Generated output',
      model: 'claude-sonnet-4-20250514',
      usage: { inputTokens: 100, outputTokens: 20 },
      prompt: { system: 'sys', user: 'usr' },
    });

    const res = await app.request(`/v1/leaves/${testLeafId}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    // Verify generateLeafOutput was called with knowledge (SemanticContent) and leaf
    expect(mockGenerateLeafOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        knowledge: expect.objectContaining({ frames: expect.any(Array) }),
        leaf: expect.objectContaining({ id: testLeafId }),
      })
    );
  });

  it('returns 400 when generation not configured', async () => {
    mockIsGenerationConfigured.mockReturnValue(false);

    const res = await app.request(`/v1/leaves/${testLeafId}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);

    const data: ApiResponse = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('GENERATION_NOT_CONFIGURED');
  });

  it('returns 404 for non-existent leaf', async () => {
    mockIsGenerationConfigured.mockReturnValue(true);

    const res = await app.request('/v1/leaves/leaf_nonexistent/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(404);

    const data: ApiResponse = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('LEAF_NOT_FOUND');
  });

  it('returns 404 when source commit missing', async () => {
    mockIsGenerationConfigured.mockReturnValue(true);

    // Create a leaf with a non-existent commit hash
    const createRes = await app.request('/v1/leaves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commit_hash: 'sha256:nonexistent_commit_hash',
        type: 'tweet',
        project_id: testProjectId,
      }),
    });
    const createData: ApiResponse = await createRes.json();
    const orphanLeafId = createData.data.id;

    const res = await app.request(`/v1/leaves/${orphanLeafId}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(404);

    const data: ApiResponse = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('COMMIT_NOT_FOUND');
  });

  it('returns 429 for rate limit errors', async () => {
    mockIsGenerationConfigured.mockReturnValue(true);
    mockGenerateLeafOutput.mockRejectedValue(
      new MockGenerationError('Rate limit exceeded', 'RATE_LIMIT', 429)
    );

    const res = await app.request(`/v1/leaves/${testLeafId}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(429);

    const data: ApiResponse = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('RATE_LIMITED');
  });

  it('returns 500 for other generation errors', async () => {
    mockIsGenerationConfigured.mockReturnValue(true);
    mockGenerateLeafOutput.mockRejectedValue(
      new MockGenerationError('Unknown error', 'API_ERROR', 500)
    );

    const res = await app.request(`/v1/leaves/${testLeafId}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(500);

    const data: ApiResponse = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('GENERATION_FAILED');
  });
});
