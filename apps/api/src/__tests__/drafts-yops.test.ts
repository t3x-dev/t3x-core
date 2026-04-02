/**
 * Drafts YOps Route Tests
 *
 * Tests for POST /v1/drafts/:id/apply-yops endpoint.
 * - Normal apply YOps (set) — returns 200 with updated trees
 * - Draft not found — returns 404
 * - if_revision mismatch — returns 409
 * - Draft already committed — returns 400
 */

import type { AnyDB } from '@t3x-dev/storage';
import { commitDraft, insertDraft, insertProject, updateDraft } from '@t3x-dev/storage';
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

// Partial mock of @t3x-dev/core — keep real exports (applyYOps, YOpSchema, etc.)
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

// Import routes after mocking
import { draftsRoutes } from '../routes/drafts.openapi';

describe('POST /v1/drafts/:id/apply-yops', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  const app = new Hono();
  app.route('/', draftsRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    const project = await insertProject(mockDB, testData.project({ name: 'YOps Test' }));
    testProjectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  /** Helper to create a draft with optional tree nodes, using storage directly */
  async function createDraft(
    overrides: { nodes?: unknown[] } = {}
  ): Promise<{ id: string; revision: number }> {
    const draft = await insertDraft(mockDB, {
      project_id: testProjectId,
      title: 'YOps Draft',
    });

    // If initial tree nodes are needed, update via storage layer directly
    if (overrides.nodes) {
      const updated = await updateDraft(
        mockDB,
        draft.id,
        { nodes: overrides.nodes },
        draft.revision
      );
      return { id: updated.id, revision: updated.revision };
    }

    return { id: draft.id, revision: draft.revision };
  }

  it('applies a set YOp and returns updated trees', async () => {
    const initialNodes = [{ key: 'trip', slots: { destination: 'Tokyo' }, children: [] }];
    const { id, revision } = await createDraft({ nodes: initialNodes });

    const res = await app.request(`/v1/drafts/${id}/apply-yops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        yops: [
          {
            set: {
              path: 'trip/budget',
              value: 5000,
              source: 'around five thousand',
              from: 'T1',
            },
          },
        ],
        if_revision: revision,
      }),
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as ApiResponse;
    expect(json.success).toBe(true);
    expect(json.data.draft_id).toBe(id);
    expect(json.data.revision).toBe(revision + 1);
    expect(json.data.applied_count).toBe(1);
    expect(json.data.tree_count).toBe(1);
    // Should have destination + budget = 2 slots
    expect(json.data.slot_count).toBe(2);
    // Verify the tree content
    expect(json.data.trees).toHaveLength(1);
    expect(json.data.trees[0].slots.budget).toBe(5000);
    expect(json.data.trees[0].slots.destination).toBe('Tokyo');
  });

  it('applies an add YOp to create a new root tree', async () => {
    const { id, revision } = await createDraft();

    const res = await app.request(`/v1/drafts/${id}/apply-yops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        yops: [
          {
            add: {
              parent: '',
              node: { hotel: { name: 'Hilton', stars: 5 } },
              source: { name: 'called Hilton', stars: 'five stars' },
              from: 'T2',
            },
          },
        ],
        if_revision: revision,
      }),
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as ApiResponse;
    expect(json.success).toBe(true);
    expect(json.data.applied_count).toBe(1);
    expect(json.data.tree_count).toBe(1);
    expect(json.data.trees[0].key).toBe('hotel');
    expect(json.data.trees[0].slots.name).toBe('Hilton');
  });

  it('returns 404 for non-existent draft', async () => {
    const res = await app.request('/v1/drafts/draft_nonexistent/apply-yops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        yops: [
          {
            add: {
              parent: '',
              node: { test: { val: 1 } },
              source: { val: 'one' },
              from: 'T1',
            },
          },
        ],
        if_revision: 0,
      }),
    });

    expect(res.status).toBe(404);
    const json = (await res.json()) as ApiResponse;
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('DRAFT_NOT_FOUND');
  });

  it('returns 409 on revision mismatch', async () => {
    const initialNodes = [{ key: 'trip', slots: { destination: 'Paris' }, children: [] }];
    const { id, revision } = await createDraft({ nodes: initialNodes });

    const res = await app.request(`/v1/drafts/${id}/apply-yops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        yops: [
          {
            set: {
              path: 'trip/budget',
              value: 3000,
              source: 'three thousand',
              from: 'T1',
            },
          },
        ],
        if_revision: revision - 1, // stale revision
      }),
    });

    expect(res.status).toBe(409);
    const json = (await res.json()) as ApiResponse;
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('CONFLICT');
  });

  it('returns 400 for YOps engine error (non-existent node)', async () => {
    const initialNodes = [{ key: 'trip', slots: { destination: 'London' }, children: [] }];
    const { id, revision } = await createDraft({ nodes: initialNodes });

    // set op targeting a non-existent node path
    const res = await app.request(`/v1/drafts/${id}/apply-yops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        yops: [
          {
            set: {
              path: 'nonexistent/budget',
              value: 1000,
              source: 'one thousand',
              from: 'T1',
            },
          },
        ],
        if_revision: revision,
      }),
    });

    expect(res.status).toBe(400);
    const json = (await res.json()) as ApiResponse;
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('INVALID_REQUEST');
  });

  it('returns 409 for already committed draft', async () => {
    const { id, revision } = await createDraft({
      nodes: [{ key: 'test', slots: { val: 1 }, children: [] }],
    });

    // Mark draft as committed directly via storage
    await commitDraft(mockDB, id, 'sha256:fakehash', 'leaf_fake');

    const res = await app.request(`/v1/drafts/${id}/apply-yops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        yops: [
          {
            set: {
              path: 'test/val',
              value: 2,
              source: 'two',
              from: 'T1',
            },
          },
        ],
        if_revision: revision,
      }),
    });

    expect(res.status).toBe(409);
    const json = (await res.json()) as ApiResponse;
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('ALREADY_COMMITTED');
  });

  it('applies multiple YOps in sequence', async () => {
    const { id, revision } = await createDraft();

    const res = await app.request(`/v1/drafts/${id}/apply-yops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        yops: [
          {
            add: {
              parent: '',
              node: { trip: { destination: 'Berlin' } },
              source: { destination: 'going to Berlin' },
              from: 'T1',
            },
          },
          {
            set: {
              path: 'trip/budget',
              value: 2000,
              source: 'two thousand euros',
              from: 'T2',
            },
          },
        ],
        if_revision: revision,
      }),
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as ApiResponse;
    expect(json.data.applied_count).toBe(2);
    expect(json.data.tree_count).toBe(1);
    expect(json.data.slot_count).toBe(2);
    expect(json.data.trees[0].slots.destination).toBe('Berlin');
    expect(json.data.trees[0].slots.budget).toBe(2000);
  });
});
