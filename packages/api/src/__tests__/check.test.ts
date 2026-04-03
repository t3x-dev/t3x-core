/**
 * Check Route Tests
 *
 * Integration tests for POST /v1/check endpoint.
 */

import type { AnyDB } from '@t3x-dev/storage';
import { createLeaf, insertProject } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

// biome-ignore lint/suspicious/noExplicitAny: test helper
type ApiResponse = any;

// Mock the database module before importing routes
let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// Mock the webhook dispatcher
const mockDispatch = vi.fn();
vi.mock('../lib/webhook-dispatcher', () => ({
  webhookDispatcher: {
    dispatch: (...args: unknown[]) => mockDispatch(...args),
  },
}));

// Import routes after mocking
import { checkRoutes } from '../routes/check.openapi';

describe('Check Routes', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let emptyProjectId: string;
  let leafWithRequire: string;
  let leafWithExclude: string;
  const app = new Hono();
  app.route('/', checkRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    // Create test projects
    const project = await insertProject(mockDB, testData.project({ name: 'Check Test Project' }));
    testProjectId = project.projectId;

    const emptyProject = await insertProject(
      mockDB,
      testData.project({ name: 'Empty Check Project' })
    );
    emptyProjectId = emptyProject.projectId;

    // Create leaf with a require constraint (exact match)
    const leaf1 = await createLeaf(mockDB, {
      commit_hash: 'sha256:fake_commit_hash_1',
      type: 'deploy_agent',
      title: 'Agent Leaf',
      constraints: [
        {
          id: 'cst_require_001',
          type: 'require',
          match_mode: 'exact',
          value: 'important keyword',
        },
      ],
      project_id: testProjectId,
    });
    leafWithRequire = leaf1.id;

    // Create leaf with an exclude constraint (exact match)
    const leaf2 = await createLeaf(mockDB, {
      commit_hash: 'sha256:fake_commit_hash_2',
      type: 'tweet',
      title: 'Tweet Leaf',
      constraints: [
        {
          id: 'cst_exclude_001',
          type: 'exclude',
          match_mode: 'exact',
          value: 'banned word',
          reason: 'Policy violation',
        },
      ],
      project_id: testProjectId,
    });
    leafWithExclude = leaf2.id;
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(() => {
    mockDispatch.mockClear();
  });

  describe('POST /v1/check', () => {
    it('returns passed: true when text satisfies all constraints', async () => {
      const res = await app.request('/v1/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          text: 'This text contains the important keyword and no banned content.',
        }),
      });

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.passed).toBe(true);
      expect(data.data.violations).toEqual([]);
    });

    it('returns passed: false with violations when require constraint fails', async () => {
      const res = await app.request('/v1/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          text: 'This text does not contain the required phrase.',
        }),
      });

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.passed).toBe(false);
      expect(data.data.violations.length).toBeGreaterThanOrEqual(1);

      const requireViolation = data.data.violations.find(
        (v: ApiResponse) => v.constraint_id === 'cst_require_001'
      );
      expect(requireViolation).toBeTruthy();
      expect(requireViolation.type).toBe('require');
      expect(requireViolation.value).toBe('important keyword');
      expect(requireViolation.leaf_id).toBe(leafWithRequire);
    });

    it('returns passed: false with violations when exclude constraint fails', async () => {
      const res = await app.request('/v1/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          text: 'This text contains important keyword but also banned word.',
        }),
      });

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.passed).toBe(false);

      const excludeViolation = data.data.violations.find(
        (v: ApiResponse) => v.constraint_id === 'cst_exclude_001'
      );
      expect(excludeViolation).toBeTruthy();
      expect(excludeViolation.type).toBe('exclude');
      expect(excludeViolation.value).toBe('banned word');
      expect(excludeViolation.leaf_id).toBe(leafWithExclude);
    });

    it('filters by leaf_ids when provided', async () => {
      // Only check the require leaf — text has no "important keyword" but no "banned word"
      const res = await app.request('/v1/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          text: 'Some random text without the required phrase.',
          leaf_ids: [leafWithExclude],
        }),
      });

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      // Only the exclude leaf is checked; text doesn't contain "banned word" so it passes
      expect(data.data.passed).toBe(true);
      expect(data.data.violations).toEqual([]);
    });

    it('fires check.failed webhook when validation fails', async () => {
      const res = await app.request('/v1/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          text: 'This text does not contain the required phrase.',
        }),
      });

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.data.passed).toBe(false);

      // Webhook should have been dispatched
      expect(mockDispatch).toHaveBeenCalledWith(
        'check.failed',
        expect.objectContaining({
          project_id: testProjectId,
          text_preview: expect.any(String),
          violations: expect.any(Array),
        }),
        testProjectId
      );
    });

    it('does not fire webhook when validation passes', async () => {
      const res = await app.request('/v1/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          text: 'This text contains the important keyword and nothing bad.',
        }),
      });

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.data.passed).toBe(true);
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it('returns passed: true when project has no leaves', async () => {
      const res = await app.request('/v1/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: emptyProjectId,
          text: 'Any text should pass when there are no leaves.',
        }),
      });

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.passed).toBe(true);
      expect(data.data.violations).toEqual([]);
    });
  });
});
