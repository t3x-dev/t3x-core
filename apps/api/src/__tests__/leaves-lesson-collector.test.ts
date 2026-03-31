/**
 * Leaves Lesson Collector Wiring Tests
 *
 * Integration tests verifying that the POST /v1/leaves/:id/generate endpoint
 * correctly calls collectLessons with historical leaves and passes the
 * resulting lessons to generateWithFallback.
 */

import type { AnyDB } from '@t3x-dev/storage';
import { createCommit, createLeaf, insertProject, updateLeaf } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

// biome-ignore lint/suspicious/noExplicitAny: test helper
type ApiResponse = any;

// Hoist the mocks so they can be referenced in vi.mock factories
const { mockGenerateLeafOutput, mockIsGenerationConfigured, mockCollectLessonsFromAssertions } = vi.hoisted(
  () => ({
    mockGenerateLeafOutput: vi.fn(),
    mockIsGenerationConfigured: vi.fn(),
    mockCollectLessonsFromAssertions: vi.fn(),
  })
);

// Mock the database module
let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// Mock @t3x-dev/core — replace collectLessons with a spy while keeping everything else
vi.mock('@t3x-dev/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@t3x-dev/core')>();
  return {
    ...actual,
    generateLeafOutput: mockGenerateLeafOutput,
    isGenerationConfigured: mockIsGenerationConfigured,
    collectLessonsFromAssertions: mockCollectLessonsFromAssertions,
  };
});

// Mock provider-registry — generateWithFallback delegates to the mocked generateLeafOutput
const { mockGenerateWithFallback } = vi.hoisted(() => ({
  mockGenerateWithFallback: vi.fn(),
}));

vi.mock('../lib/provider-registry', () => ({
  generateWithFallback: mockGenerateWithFallback,
  getLLMProvider: vi.fn(() => Promise.resolve({ id: 'mock', generate: vi.fn() })),
  getProviderRegistry: vi.fn(),
}));

// Mock webhook dispatcher
vi.mock('../lib/webhook-dispatcher', () => ({
  webhookDispatcher: { dispatch: vi.fn() },
}));

// Mock embedder
vi.mock('../lib/embedder', () => ({
  getEmbedder: vi.fn(() => null),
  isSemanticValidationConfigured: vi.fn(() => false),
}));

// Import routes after all mocks are registered
import { leavesRoutes } from '../routes/leaves.openapi';

describe('POST /v1/leaves/:id/generate — lesson collector wiring', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let testCommitHash: string;
  const app = new Hono();
  app.route('/', leavesRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    // Create a test project
    const project = await insertProject(
      mockDB,
      testData.project({ name: 'Lesson Collector Test Project' })
    );
    testProjectId = project.projectId;

    // Create a test commit
    const commit = await createCommit(mockDB, {
      author: { type: 'human', name: 'Test User' },
      content: {
        trees: [
          { key: 's_lc1', slots: { text: 'User prefers concise responses' }, children: [] },
          { key: 's_lc2', slots: { text: 'User likes bullet points' }, children: [] },
        ],
        relations: [],
      } as any,
      project_id: testProjectId,
      branch: 'main',
      message: 'Commit for lesson collector tests',
    });
    testCommitHash = commit.hash;
  });

  beforeEach(() => {
    mockGenerateLeafOutput.mockReset();
    mockIsGenerationConfigured.mockReset();
    mockCollectLessonsFromAssertions.mockReset();
    mockGenerateWithFallback.mockReset();

    // Default: generation is configured
    mockIsGenerationConfigured.mockReturnValue(true);
  });

  afterAll(async () => {
    await cleanup();
  });

  it('calls collectLessons with historical leaves from the same commit', async () => {
    // Create a historical leaf on the same commit with a failed assertion + lesson
    const historicalLeaf = await createLeaf(mockDB, {
      commit_hash: testCommitHash,
      type: 'tweet',
      title: 'Historical Tweet',
      project_id: testProjectId,
    });
    await updateLeaf(mockDB, historicalLeaf.id, {
      assertions: [
        {
          id: 'ast_hist1',
          constraint_id: 'cst_hist1',
          passed: false,
          details: 'Missing keyword',
          lesson: 'Always include the main keyword in the first sentence',
        },
      ],
    });

    // Create the target leaf to generate
    const targetLeaf = await createLeaf(mockDB, {
      commit_hash: testCommitHash,
      type: 'tweet',
      title: 'Target Tweet',
      project_id: testProjectId,
    });

    // collectLessons returns lessons extracted from historical leaves
    mockCollectLessonsFromAssertions.mockReturnValue(['Always include the main keyword in the first sentence']);

    // generateWithFallback returns a successful result
    mockGenerateWithFallback.mockResolvedValue({
      output: 'Generated tweet with lessons applied',
      model: 'test-model',
      usage: { inputTokens: 100, outputTokens: 20 },
      prompt: { system: 'sys', user: 'usr' },
    });

    const res = await app.request(`/v1/leaves/${targetLeaf.id}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);

    // collectLessons should have been called with the array of all leaves on this commit
    expect(mockCollectLessonsFromAssertions).toHaveBeenCalledTimes(1);
    const callArg = mockCollectLessonsFromAssertions.mock.calls[0][0];
    expect(Array.isArray(callArg)).toBe(true);
    // The array should contain leaves from this commit (at least the two we created)
    expect(callArg.length).toBeGreaterThanOrEqual(2);
    const ids = callArg.map((l: ApiResponse) => l.id);
    expect(ids).toContain(historicalLeaf.id);
    expect(ids).toContain(targetLeaf.id);
  });

  it('passes collected lessons to generateWithFallback when lessons exist', async () => {
    // Create the target leaf
    const leaf = await createLeaf(mockDB, {
      commit_hash: testCommitHash,
      type: 'email',
      title: 'Email with Lessons',
      project_id: testProjectId,
    });

    // collectLessons returns multiple lessons
    const fakeLessons = [
      'Do not exceed 280 characters for tweets',
      'Always include a call-to-action',
    ];
    mockCollectLessonsFromAssertions.mockReturnValue(fakeLessons);

    mockGenerateWithFallback.mockResolvedValue({
      output: 'Generated email output',
      model: 'test-model',
      usage: { inputTokens: 200, outputTokens: 50 },
      prompt: { system: 'sys', user: 'usr' },
    });

    const res = await app.request(`/v1/leaves/${leaf.id}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);

    // generateWithFallback should receive the lessons array
    expect(mockGenerateWithFallback).toHaveBeenCalledTimes(1);
    expect(mockGenerateWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        lessons: fakeLessons,
      })
    );
  });

  it('passes undefined for lessons when collectLessons returns empty array', async () => {
    // Create the target leaf
    const leaf = await createLeaf(mockDB, {
      commit_hash: testCommitHash,
      type: 'article',
      title: 'Article No Lessons',
      project_id: testProjectId,
    });

    // collectLessons returns empty — no failed assertions with lessons
    mockCollectLessonsFromAssertions.mockReturnValue([]);

    mockGenerateWithFallback.mockResolvedValue({
      output: 'Generated article output',
      model: 'test-model',
      usage: { inputTokens: 150, outputTokens: 30 },
      prompt: { system: 'sys', user: 'usr' },
    });

    const res = await app.request(`/v1/leaves/${leaf.id}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);

    // When lessons is empty, the endpoint passes undefined (not [])
    expect(mockGenerateWithFallback).toHaveBeenCalledTimes(1);
    expect(mockGenerateWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        lessons: undefined,
      })
    );
  });

  it('generates successfully when no other historical leaves exist', async () => {
    // Create a fresh commit with no sibling leaves
    const freshCommit = await createCommit(mockDB, {
      author: { type: 'human', name: 'Test User' },
      content: {
        trees: [
          { key: 's_fresh1', slots: { text: 'A brand new sentence' }, children: [] },
        ],
        relations: [],
      } as any,
      project_id: testProjectId,
      branch: 'main',
      message: 'Isolated commit for lesson test',
    });

    // Create a single leaf on this commit — no siblings
    const leaf = await createLeaf(mockDB, {
      commit_hash: freshCommit.hash,
      type: 'slack',
      title: 'Solo Leaf',
      project_id: testProjectId,
    });

    // collectLessons returns empty for a single leaf with no failed assertions
    mockCollectLessonsFromAssertions.mockReturnValue([]);

    mockGenerateWithFallback.mockResolvedValue({
      output: 'Generated solo output',
      model: 'test-model',
      usage: { inputTokens: 80, outputTokens: 15 },
      prompt: { system: 'sys', user: 'usr' },
    });

    const res = await app.request(`/v1/leaves/${leaf.id}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);

    const data: ApiResponse = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.output).toBe('Generated solo output');

    // collectLessons was still called (with the array containing just this one leaf)
    expect(mockCollectLessonsFromAssertions).toHaveBeenCalledTimes(1);
    const callArg = mockCollectLessonsFromAssertions.mock.calls[0][0];
    expect(callArg).toHaveLength(1);
    expect(callArg[0].id).toBe(leaf.id);

    // lessons should be undefined since collectLessons returned []
    expect(mockGenerateWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        lessons: undefined,
      })
    );
  });

  it('forwards commit and leaf alongside lessons to generateWithFallback', async () => {
    const leaf = await createLeaf(mockDB, {
      commit_hash: testCommitHash,
      type: 'weibo',
      title: 'Weibo with Context',
      // biome-ignore lint/suspicious/noExplicitAny: test type cast
      constraints: [{ type: 'require', match_mode: 'exact', value: 'concise' }] as any,
      project_id: testProjectId,
    });

    const fakeLessons = ['Keep it under 140 characters'];
    mockCollectLessonsFromAssertions.mockReturnValue(fakeLessons);

    mockGenerateWithFallback.mockResolvedValue({
      output: 'Concise weibo post',
      model: 'test-model',
      usage: { inputTokens: 120, outputTokens: 18 },
      prompt: { system: 'sys', user: 'usr' },
    });

    const res = await app.request(`/v1/leaves/${leaf.id}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);

    // Verify all three key fields are passed together
    expect(mockGenerateWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        knowledge: expect.objectContaining({ trees: expect.any(Array) }),
        leaf: expect.objectContaining({ id: leaf.id }),
        lessons: fakeLessons,
      })
    );
  });
});
