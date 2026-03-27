/**
 * Leaves Validate Route Tests
 *
 * Integration tests for POST /v1/leaves/:id/validate endpoint.
 */

import type { AnyDB } from '@t3x-dev/storage';
import { createCommit, insertProject } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

// biome-ignore lint/suspicious/noExplicitAny: test helper
type ApiResponse = any;

// Mock the database module
let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// Mock @t3x-dev/core keeping all actual exports (validation functions needed)
// This ensures validateConstraintsExactOnly is available when routes are imported
vi.mock('@t3x-dev/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@t3x-dev/core')>();
  return {
    ...actual,
    // Explicitly export validation function to ensure it's available
    validateConstraintsExactOnly: actual.validateConstraintsExactOnly,
    validateConstraints: actual.validateConstraints,
    generateAssertionId: actual.generateAssertionId,
  };
});

// Import routes after mocking db
import { leavesRoutes } from '../routes/leaves.openapi';

describe('POST /v1/leaves/:id/validate', () => {
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
      testData.project({ name: 'Validate Test Project' })
    );
    testProjectId = project.projectId;

    // Create a test commit
    const commit = await createCommit(mockDB, {
      author: { type: 'human', name: 'Test User' },
      content: {
        trees: [
          { key: 's_1', slots: { text: 'User budget is $5,000' }, children: [] },
          { key: 's_2', slots: { text: 'User prefers premium quality' }, children: [] },
        ],
        relations: [],
      } as any,
      project_id: testProjectId,
      branch: 'main',
      message: 'Test commit for validation',
    });
    testCommitHash = commit.hash;
  });

  afterAll(async () => {
    await cleanup();
  });

  // Helper to create a leaf with output
  async function createLeafWithOutput(options: {
    constraints?: Array<{ type: string; match_mode: string; value: string; reason?: string }>;
    output?: string;
  }) {
    // Create leaf
    const createRes = await app.request('/v1/leaves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commit_hash: testCommitHash,
        type: 'email',
        title: 'Test Email',
        constraints: options.constraints ?? [],
        project_id: testProjectId,
      }),
    });
    const createData: ApiResponse = await createRes.json();
    const leafId = createData.data.id;

    // Update leaf with output if provided
    if (options.output) {
      await app.request(`/v1/leaves/${leafId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // We need to set output via generate mock or direct DB update
          // For now, use the PATCH endpoint which doesn't support output
          // Let's use a workaround: generate endpoint with mock
        }),
      });

      // Directly update the leaf output in DB for testing
      const { updateLeafOutput } = await import('@t3x-dev/storage');
      await updateLeafOutput(mockDB, leafId, options.output);
    }

    return leafId;
  }

  it('validates constraints successfully', async () => {
    const leafId = await createLeafWithOutput({
      constraints: [
        { type: 'require', match_mode: 'exact', value: '$5,000' },
        { type: 'exclude', match_mode: 'exact', value: 'competitor' },
      ],
      output: 'Your budget of $5,000 allows for premium options.',
    });

    const res = await app.request(`/v1/leaves/${leafId}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);

    const data: ApiResponse = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.validation.all_passed).toBe(true);
    expect(data.data.validation.passed_count).toBe(2);
    expect(data.data.validation.failed_count).toBe(0);
  });

  it('saves assertions to leaf', async () => {
    const leafId = await createLeafWithOutput({
      constraints: [{ type: 'require', match_mode: 'exact', value: 'budget' }],
      output: 'Your budget is confirmed.',
    });

    await app.request(`/v1/leaves/${leafId}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    // Verify assertions were saved by fetching the leaf
    const getRes = await app.request(`/v1/leaves/${leafId}`);
    const getData: ApiResponse = await getRes.json();

    expect(getData.data.assertions).not.toBeNull();
    expect(getData.data.assertions.length).toBe(1);
    expect(getData.data.assertions[0].passed).toBe(true);
  });

  it('returns validation summary', async () => {
    const leafId = await createLeafWithOutput({
      constraints: [
        { type: 'require', match_mode: 'exact', value: 'found' },
        { type: 'require', match_mode: 'exact', value: 'missing' },
      ],
      output: 'This text contains found but not the other word.',
    });

    const res = await app.request(`/v1/leaves/${leafId}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);

    const data: ApiResponse = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.validation).toEqual({
      all_passed: false,
      passed_count: 1,
      failed_count: 1,
    });
  });

  it('returns 400 when no output to validate', async () => {
    // Create leaf without output
    const createRes = await app.request('/v1/leaves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commit_hash: testCommitHash,
        type: 'tweet',
        title: 'No Output Leaf',
        constraints: [{ type: 'require', match_mode: 'exact', value: 'test' }],
        project_id: testProjectId,
      }),
    });
    const createData: ApiResponse = await createRes.json();
    const leafId = createData.data.id;

    const res = await app.request(`/v1/leaves/${leafId}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);

    const data: ApiResponse = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('NO_OUTPUT');
  });

  it('returns 404 for non-existent leaf', async () => {
    const res = await app.request('/v1/leaves/leaf_nonexistent/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(404);

    const data: ApiResponse = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('LEAF_NOT_FOUND');
  });

  it('handles leaf with no constraints', async () => {
    const leafId = await createLeafWithOutput({
      constraints: [],
      output: 'Some output text without any constraints to check.',
    });

    const res = await app.request(`/v1/leaves/${leafId}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);

    const data: ApiResponse = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.validation).toEqual({
      all_passed: true,
      passed_count: 0,
      failed_count: 0,
    });
    // Leaf should not have assertions array when no constraints
    expect(data.data.leaf.assertions).toBeNull();
  });

  it('assertion IDs have ast_ prefix', async () => {
    const leafId = await createLeafWithOutput({
      constraints: [
        { type: 'require', match_mode: 'exact', value: 'hello' },
        { type: 'exclude', match_mode: 'exact', value: 'goodbye' },
      ],
      output: 'hello world',
    });

    const res = await app.request(`/v1/leaves/${leafId}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);

    const data: ApiResponse = await res.json();
    expect(data.data.leaf.assertions).not.toBeNull();
    expect(data.data.leaf.assertions.length).toBe(2);

    // All assertion IDs should have ast_ prefix
    for (const assertion of data.data.leaf.assertions) {
      expect(assertion.id).toMatch(/^ast_/);
    }
  });

  it('returns complete leaf object in response', async () => {
    const leafId = await createLeafWithOutput({
      constraints: [{ type: 'require', match_mode: 'exact', value: 'test' }],
      output: 'test content',
    });

    const res = await app.request(`/v1/leaves/${leafId}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);

    const data: ApiResponse = await res.json();
    // Verify leaf object has all expected fields
    expect(data.data.leaf).toMatchObject({
      id: leafId,
      commit_hash: testCommitHash,
      type: 'email',
      project_id: testProjectId,
      output: 'test content',
    });
    expect(data.data.leaf.assertions).not.toBeNull();
  });

  it('validates exclude constraint - passes when value not found', async () => {
    const leafId = await createLeafWithOutput({
      constraints: [
        { type: 'exclude', match_mode: 'exact', value: 'competitor', reason: 'Policy' },
      ],
      output: 'Our product is the best choice for you.',
    });

    const res = await app.request(`/v1/leaves/${leafId}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);

    const data: ApiResponse = await res.json();
    expect(data.data.validation.all_passed).toBe(true);
    expect(data.data.leaf.assertions[0].passed).toBe(true);
  });

  it('validates exclude constraint - fails when value found', async () => {
    const leafId = await createLeafWithOutput({
      constraints: [
        { type: 'exclude', match_mode: 'exact', value: 'competitor', reason: 'Policy' },
      ],
      output: 'Unlike our competitor, we offer better service.',
    });

    const res = await app.request(`/v1/leaves/${leafId}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);

    const data: ApiResponse = await res.json();
    expect(data.data.validation.all_passed).toBe(false);
    expect(data.data.leaf.assertions[0].passed).toBe(false);
  });
});
