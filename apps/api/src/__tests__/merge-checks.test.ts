/**
 * Merge Checks API Tests
 *
 * Tests for GET /v1/merge/drafts/:id/checks
 */

import type { AnyDB } from '@t3x-dev/storage';
import {
  createCommit,
  createLeaf,
  createMergeDraft,
  insertProject,
  insertRun,
} from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiResponse = any;

// Mock the database module before importing routes
let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// Import routes after mocking
import { mergeRoutes } from '../routes/merge.openapi';

describe('GET /v1/merge/drafts/:id/checks', () => {
  let cleanup: () => Promise<void>;
  const app = new Hono();
  app.route('/', mergeRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  let testProjectId: string;

  beforeEach(async () => {
    const project = await insertProject(mockDB, testData.project());
    testProjectId = project.projectId;
  });

  // Helper: create a test commit (converts sentences to frames)
  const createTestCommit = async (
    sentences: Array<{
      id: string;
      text: string;
      source_ref?: {
        conversation_id: string;
        turn_hash: string;
        start_char: number;
        end_char: number;
      };
    }>
  ) => {
    const frames = sentences.map((s) => ({
      id: s.id,
      type: 'legacy_sentence' as const,
      slots: { text: s.text },
    }));
    return createCommit(mockDB, {
      parents: [],
      author: { type: 'human' as const, name: 'Test User' },
      content: { frames, relations: [] },
      project_id: testProjectId,
      message: 'Test commit',
      branch: 'main',
    });
  };

  // Helper: create a merge draft with prepared data
  const createTestDraft = async (sourceHash: string, targetHash: string, prepared: unknown) => {
    return createMergeDraft(mockDB, {
      projectId: testProjectId,
      sourceHash,
      targetHash,
      prepared,
    });
  };

  // ============================================================================
  // 404 — Draft not found
  // ============================================================================

  it('returns 404 for non-existent draft', async () => {
    const res = await app.request('/v1/merge/drafts/nonexistent_id/checks', {
      method: 'GET',
    });

    expect(res.status).toBe(404);
    const json: ApiResponse = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('NOT_FOUND');
  });

  // ============================================================================
  // No Leaves — constraints passed, no eval check
  // ============================================================================

  it('returns passed constraints with "No constraints" when no leaves exist', async () => {
    const source = await createTestCommit([{ id: 's1', text: 'Hello world' }]);
    const target = await createTestCommit([{ id: 't1', text: 'Hello world' }]);

    const draft = await createTestDraft(source.hash, target.hash, {
      identical: [{ id: 's1', text: 'Hello world' }],
      similarPairs: [],
      onlyInSource: [],
      onlyInTarget: [],
    });

    const res = await app.request(`/v1/merge/drafts/${draft.draftId}/checks`, { method: 'GET' });

    expect(res.status).toBe(200);
    const json: ApiResponse = await res.json();
    expect(json.success).toBe(true);

    const checks = json.data as Array<{
      id: string;
      label: string;
      passed: boolean;
      detail?: string;
    }>;

    // Should have constraints_satisfied and evidence_chain_complete (no eval_passed)
    const constraintsCheck = checks.find((c) => c.id === 'constraints_satisfied');
    expect(constraintsCheck).toBeDefined();
    expect(constraintsCheck!.passed).toBe(true);
    expect(constraintsCheck!.detail).toBe('No constraints to check');

    // eval_passed should NOT be present (no leaves)
    const evalCheck = checks.find((c) => c.id === 'eval_passed');
    expect(evalCheck).toBeUndefined();
  });

  // ============================================================================
  // Leaf with constraints — all satisfied
  // ============================================================================

  it('returns passed when all leaf constraints are satisfied', async () => {
    const source = await createTestCommit([
      { id: 's1', text: 'We use React framework for the frontend' },
    ]);
    const target = await createTestCommit([{ id: 't1', text: 'Budget is $5000 per month' }]);

    // Create a leaf on source commit with a 'require' constraint
    await createLeaf(mockDB, {
      commit_hash: source.hash,
      type: 'tweet',
      title: 'Test Leaf',
      project_id: testProjectId,
      constraints: [
        {
          id: 'cst_test1',
          type: 'require',
          match_mode: 'exact',
          value: 'React',
        },
      ],
    });

    const draft = await createTestDraft(source.hash, target.hash, {
      identical: [],
      similarPairs: [],
      onlyInSource: [
        { sentence: { id: 's1', text: 'We use React framework for the frontend' }, keep: true },
      ],
      onlyInTarget: [{ sentence: { id: 't1', text: 'Budget is $5000 per month' }, keep: true }],
    });

    const res = await app.request(`/v1/merge/drafts/${draft.draftId}/checks`, { method: 'GET' });

    expect(res.status).toBe(200);
    const json: ApiResponse = await res.json();
    const checks = json.data;

    const constraintsCheck = checks.find((c: ApiResponse) => c.id === 'constraints_satisfied');
    expect(constraintsCheck.passed).toBe(true);
  });

  // ============================================================================
  // Leaf with constraints — partially failed
  // ============================================================================

  it('returns failed when leaf constraints are not satisfied', async () => {
    const source = await createTestCommit([{ id: 's1', text: 'We use Vue framework' }]);
    const target = await createTestCommit([{ id: 't1', text: 'Budget is $5000' }]);

    // Leaf requires "React" but merged text has "Vue"
    await createLeaf(mockDB, {
      commit_hash: source.hash,
      type: 'tweet',
      title: 'Constraint Leaf',
      project_id: testProjectId,
      constraints: [
        {
          id: 'cst_fail1',
          type: 'require',
          match_mode: 'exact',
          value: 'React',
        },
      ],
    });

    const draft = await createTestDraft(source.hash, target.hash, {
      identical: [],
      similarPairs: [],
      onlyInSource: [{ sentence: { id: 's1', text: 'We use Vue framework' }, keep: true }],
      onlyInTarget: [{ sentence: { id: 't1', text: 'Budget is $5000' }, keep: true }],
    });

    const res = await app.request(`/v1/merge/drafts/${draft.draftId}/checks`, { method: 'GET' });

    expect(res.status).toBe(200);
    const json: ApiResponse = await res.json();
    const checks = json.data;

    const constraintsCheck = checks.find((c: ApiResponse) => c.id === 'constraints_satisfied');
    expect(constraintsCheck.passed).toBe(false);
    // Detail should show per-leaf satisfaction rate
    expect(constraintsCheck.detail).toMatch(/0\/1/);
  });

  // ============================================================================
  // Evidence chain — all sentences have source_ref
  // ============================================================================

  it('returns passed evidence chain when all sentences have source_ref', async () => {
    const sourceRef = {
      conversation_id: 'conv_test',
      turn_hash: 'sha256:abc',
      start_char: 0,
      end_char: 10,
    };

    const source = await createTestCommit([
      { id: 's1', text: 'Hello world', source_ref: sourceRef },
    ]);
    const target = await createTestCommit([
      { id: 't1', text: 'Hello world', source_ref: sourceRef },
    ]);

    const draft = await createTestDraft(source.hash, target.hash, {
      identical: [{ id: 's1', text: 'Hello world', source_ref: sourceRef }],
      similarPairs: [],
      onlyInSource: [],
      onlyInTarget: [],
    });

    const res = await app.request(`/v1/merge/drafts/${draft.draftId}/checks`, { method: 'GET' });

    expect(res.status).toBe(200);
    const json: ApiResponse = await res.json();
    const checks = json.data;

    const evidenceCheck = checks.find((c: ApiResponse) => c.id === 'evidence_chain_complete');
    expect(evidenceCheck.passed).toBe(true);
    expect(evidenceCheck.detail).toContain('1 sentence(s) have source references');
  });

  // ============================================================================
  // Evidence chain — missing source_ref
  // ============================================================================

  it('returns failed evidence chain when sentences lack source_ref', async () => {
    const source = await createTestCommit([{ id: 's1', text: 'No source ref sentence' }]);
    const target = await createTestCommit([{ id: 't1', text: 'Another sentence' }]);

    const draft = await createTestDraft(source.hash, target.hash, {
      identical: [],
      similarPairs: [],
      onlyInSource: [{ sentence: { id: 's1', text: 'No source ref sentence' }, keep: true }],
      onlyInTarget: [{ sentence: { id: 't1', text: 'Another sentence' }, keep: true }],
    });

    const res = await app.request(`/v1/merge/drafts/${draft.draftId}/checks`, { method: 'GET' });

    expect(res.status).toBe(200);
    const json: ApiResponse = await res.json();
    const checks = json.data;

    const evidenceCheck = checks.find((c: ApiResponse) => c.id === 'evidence_chain_complete');
    expect(evidenceCheck.passed).toBe(false);
    expect(evidenceCheck.detail).toContain('missing source reference');
  });

  // ============================================================================
  // Empty merge (no sentences)
  // ============================================================================

  it('handles empty merge with no sentences', async () => {
    const source = await createTestCommit([{ id: 's1', text: 'Will be discarded' }]);
    const target = await createTestCommit([{ id: 't1', text: 'Also discarded' }]);

    const draft = await createTestDraft(source.hash, target.hash, {
      identical: [],
      similarPairs: [],
      onlyInSource: [{ sentence: { id: 's1', text: 'Will be discarded' }, keep: false }],
      onlyInTarget: [{ sentence: { id: 't1', text: 'Also discarded' }, keep: false }],
    });

    const res = await app.request(`/v1/merge/drafts/${draft.draftId}/checks`, { method: 'GET' });

    expect(res.status).toBe(200);
    const json: ApiResponse = await res.json();
    const checks = json.data;

    // Evidence chain should pass with "No sentences to verify"
    const evidenceCheck = checks.find((c: ApiResponse) => c.id === 'evidence_chain_complete');
    expect(evidenceCheck.passed).toBe(true);
    expect(evidenceCheck.detail).toBe('No sentences to verify');
  });

  // ============================================================================
  // Multiple Leaves (source + target each have a Leaf)
  // ============================================================================

  it('validates constraints independently for multiple leaves', async () => {
    const source = await createTestCommit([{ id: 's1', text: 'React is used for UI development' }]);
    const target = await createTestCommit([{ id: 't1', text: 'Budget is $5000 for the project' }]);

    // Source leaf: requires "React" — will pass
    await createLeaf(mockDB, {
      commit_hash: source.hash,
      type: 'tweet',
      title: 'Source Leaf',
      project_id: testProjectId,
      constraints: [
        {
          id: 'cst_s1',
          type: 'require',
          match_mode: 'exact',
          value: 'React',
        },
      ],
    });

    // Target leaf: requires "Angular" — will fail
    await createLeaf(mockDB, {
      commit_hash: target.hash,
      type: 'email',
      title: 'Target Leaf',
      project_id: testProjectId,
      constraints: [
        {
          id: 'cst_t1',
          type: 'require',
          match_mode: 'exact',
          value: 'Angular',
        },
      ],
    });

    const draft = await createTestDraft(source.hash, target.hash, {
      identical: [],
      similarPairs: [],
      onlyInSource: [
        { sentence: { id: 's1', text: 'React is used for UI development' }, keep: true },
      ],
      onlyInTarget: [
        { sentence: { id: 't1', text: 'Budget is $5000 for the project' }, keep: true },
      ],
    });

    const res = await app.request(`/v1/merge/drafts/${draft.draftId}/checks`, { method: 'GET' });

    expect(res.status).toBe(200);
    const json: ApiResponse = await res.json();
    const checks = json.data;

    const constraintsCheck = checks.find((c: ApiResponse) => c.id === 'constraints_satisfied');
    // Should fail because target leaf's constraint not satisfied
    expect(constraintsCheck.passed).toBe(false);
    // Detail should show per-leaf results
    expect(constraintsCheck.detail).toMatch(/1\/1/); // Source leaf passes
    expect(constraintsCheck.detail).toMatch(/0\/1/); // Target leaf fails
  });

  // ============================================================================
  // Eval passed — with runs
  // ============================================================================

  it('returns eval_passed check when leaves have evaluation runs', async () => {
    const source = await createTestCommit([{ id: 's1', text: 'Test sentence' }]);
    const target = await createTestCommit([{ id: 't1', text: 'Test sentence' }]);

    const leaf = await createLeaf(mockDB, {
      commit_hash: source.hash,
      type: 'tweet',
      title: 'Eval Leaf',
      project_id: testProjectId,
    });

    // Create a completed run for this leaf
    await insertRun(mockDB, {
      run_id: `run_test_${Date.now()}`,
      project_id: testProjectId,
      leaf_id: leaf.id,
      status: 'completed',
    });

    const draft = await createTestDraft(source.hash, target.hash, {
      identical: [{ id: 's1', text: 'Test sentence' }],
      similarPairs: [],
      onlyInSource: [],
      onlyInTarget: [],
    });

    const res = await app.request(`/v1/merge/drafts/${draft.draftId}/checks`, { method: 'GET' });

    expect(res.status).toBe(200);
    const json: ApiResponse = await res.json();
    const checks = json.data;

    const evalCheck = checks.find((c: ApiResponse) => c.id === 'eval_passed');
    expect(evalCheck).toBeDefined();
    expect(evalCheck.passed).toBe(true);
    expect(evalCheck.detail).toContain('1/1 run(s) completed');
  });

  // ============================================================================
  // Eval passed — leaves exist but no runs
  // ============================================================================

  it('returns eval_passed=true when leaves exist but no runs', async () => {
    const source = await createTestCommit([{ id: 's1', text: 'Test sentence' }]);
    const target = await createTestCommit([{ id: 't1', text: 'Test sentence' }]);

    await createLeaf(mockDB, {
      commit_hash: source.hash,
      type: 'tweet',
      title: 'Leaf No Runs',
      project_id: testProjectId,
    });

    const draft = await createTestDraft(source.hash, target.hash, {
      identical: [{ id: 's1', text: 'Test sentence' }],
      similarPairs: [],
      onlyInSource: [],
      onlyInTarget: [],
    });

    const res = await app.request(`/v1/merge/drafts/${draft.draftId}/checks`, { method: 'GET' });

    expect(res.status).toBe(200);
    const json: ApiResponse = await res.json();
    const checks = json.data;

    const evalCheck = checks.find((c: ApiResponse) => c.id === 'eval_passed');
    expect(evalCheck).toBeDefined();
    expect(evalCheck.passed).toBe(true);
    expect(evalCheck.detail).toBe('No evaluation runs found (not required)');
  });

  // ============================================================================
  // Similar pairs with resolution
  // ============================================================================

  it('correctly extracts sentences from resolved similar pairs', async () => {
    const sourceRef = {
      conversation_id: 'conv_test',
      turn_hash: 'sha256:abc',
      start_char: 0,
      end_char: 20,
    };

    const source = await createTestCommit([
      { id: 's1', text: 'Budget is $3000', source_ref: sourceRef },
    ]);
    const target = await createTestCommit([
      { id: 't1', text: 'Budget is $5000', source_ref: sourceRef },
    ]);

    const draft = await createTestDraft(source.hash, target.hash, {
      identical: [],
      similarPairs: [
        {
          source: { id: 's1', text: 'Budget is $3000', source_ref: sourceRef },
          target: { id: 't1', text: 'Budget is $5000', source_ref: sourceRef },
          wordDiff: [],
          resolution: 'target',
        },
      ],
      onlyInSource: [],
      onlyInTarget: [],
    });

    const res = await app.request(`/v1/merge/drafts/${draft.draftId}/checks`, { method: 'GET' });

    expect(res.status).toBe(200);
    const json: ApiResponse = await res.json();
    const checks = json.data;

    // Evidence chain should pass (resolved target has source_ref)
    const evidenceCheck = checks.find((c: ApiResponse) => c.id === 'evidence_chain_complete');
    expect(evidenceCheck.passed).toBe(true);
  });
});
