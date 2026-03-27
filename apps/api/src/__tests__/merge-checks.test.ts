/**
 * Merge Checks API Tests
 *
 * Tests for GET /v1/merge/drafts/:id/checks
 * Updated for frame-level merge (FrameMergeResult)
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

// biome-ignore lint/suspicious/noExplicitAny: test helper
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

  // Helper: create a test commit (frame-based)
  const createTestCommit = async (
    frames: Array<{
      id: string;
      type: string;
      slots: Record<string, unknown>;
      source?: string;
    }>
  ) => {
    return createCommit(mockDB, {
      parents: [],
      author: { type: 'human' as const, name: 'Test User' },
      content: ({
        trees: frames.map((f) => ({
          key: f.id,
          slots: f.slots,
          children: [],
          source: f.source,
        })),
        relations: [],
      }) as any,
      project_id: testProjectId,
      message: 'Test commit',
      branch: 'main',
    });
  };

  // Helper: create a merge draft with FrameMergeResult prepared data
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
    const source = await createTestCommit([
      { id: 'f_001', type: 'info', slots: { text: 'Hello world' } },
    ]);
    const target = await createTestCommit([
      { id: 'f_001', type: 'info', slots: { text: 'Hello world' } },
    ]);

    const draft = await createTestDraft(source.hash, target.hash, {
      autoKept: [{ id: 'f_001', type: 'info', slots: { text: 'Hello world' } }],
      conflicts: [],
      onlyInSource: [],
      onlyInTarget: [],
      relationsOnlyInSource: [],
      relationsOnlyInTarget: [],
      relationsInBoth: [],
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
      {
        id: 'f_001',
        type: 'tech_stack',
        slots: { text: 'We use React framework for the frontend' },
      },
    ]);
    const target = await createTestCommit([
      { id: 'f_002', type: 'budget', slots: { text: 'Budget is $5000 per month' } },
    ]);

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
      autoKept: [],
      conflicts: [],
      onlyInSource: [
        {
          id: 'f_001',
          type: 'tech_stack',
          slots: { text: 'We use React framework for the frontend' },
        },
      ],
      onlyInTarget: [{ id: 'f_002', type: 'budget', slots: { text: 'Budget is $5000 per month' } }],
      relationsOnlyInSource: [],
      relationsOnlyInTarget: [],
      relationsInBoth: [],
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
    const source = await createTestCommit([
      { id: 'f_001', type: 'tech_stack', slots: { text: 'We use Vue framework' } },
    ]);
    const target = await createTestCommit([
      { id: 'f_002', type: 'budget', slots: { text: 'Budget is $5000' } },
    ]);

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
      autoKept: [],
      conflicts: [],
      onlyInSource: [{ id: 'f_001', type: 'tech_stack', slots: { text: 'We use Vue framework' } }],
      onlyInTarget: [{ id: 'f_002', type: 'budget', slots: { text: 'Budget is $5000' } }],
      relationsOnlyInSource: [],
      relationsOnlyInTarget: [],
      relationsInBoth: [],
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
  // Evidence chain — all frames have source
  // ============================================================================

  it('returns passed evidence chain when all frames have source', async () => {
    const source = await createTestCommit([
      { id: 'f_001', type: 'info', slots: { text: 'Evidence source text' }, source: 'T1' },
    ]);
    const target = await createTestCommit([
      { id: 'f_001', type: 'info', slots: { text: 'Evidence target text' }, source: 'T1' },
    ]);

    const draft = await createTestDraft(source.hash, target.hash, {
      autoKept: [],
      conflicts: [
        {
          frameId: 'f_001',
          sourceFrame: {
            id: 'f_001',
            type: 'info',
            slots: { text: 'Evidence source text' },
            source: 'T1',
          },
          targetFrame: {
            id: 'f_001',
            type: 'info',
            slots: { text: 'Evidence target text' },
            source: 'T1',
          },
          slotConflicts: [
            {
              key: 'text',
              sourceValue: 'Evidence source text',
              targetValue: 'Evidence target text',
            },
          ],
        },
      ],
      onlyInSource: [],
      onlyInTarget: [],
      relationsOnlyInSource: [],
      relationsOnlyInTarget: [],
      relationsInBoth: [],
    });

    const res = await app.request(`/v1/merge/drafts/${draft.draftId}/checks`, { method: 'GET' });

    expect(res.status).toBe(200);
    const json: ApiResponse = await res.json();
    const checks = json.data;

    const evidenceCheck = checks.find((c: ApiResponse) => c.id === 'evidence_chain_complete');
    expect(evidenceCheck.passed).toBe(true);
    expect(evidenceCheck.detail).toContain('1 frame(s) have source references');
  });

  // ============================================================================
  // Evidence chain — missing source
  // ============================================================================

  it('returns failed evidence chain when frames lack source', async () => {
    const source = await createTestCommit([
      { id: 'f_001', type: 'info', slots: { text: 'No source ref' } },
    ]);
    const target = await createTestCommit([
      { id: 'f_002', type: 'info', slots: { text: 'Another frame' } },
    ]);

    const draft = await createTestDraft(source.hash, target.hash, {
      autoKept: [],
      conflicts: [],
      onlyInSource: [{ id: 'f_001', type: 'info', slots: { text: 'No source ref' } }],
      onlyInTarget: [{ id: 'f_002', type: 'info', slots: { text: 'Another frame' } }],
      relationsOnlyInSource: [],
      relationsOnlyInTarget: [],
      relationsInBoth: [],
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
  // Empty merge (no frames)
  // ============================================================================

  it('handles empty merge with no frames', async () => {
    const source = await createTestCommit([
      { id: 'f_001', type: 'info', slots: { text: 'Will be discarded' } },
    ]);
    const target = await createTestCommit([
      { id: 'f_002', type: 'info', slots: { text: 'Also discarded' } },
    ]);

    // Empty merge: no autoKept, no conflicts, no onlyIn*
    const draft = await createTestDraft(source.hash, target.hash, {
      autoKept: [],
      conflicts: [],
      onlyInSource: [],
      onlyInTarget: [],
      relationsOnlyInSource: [],
      relationsOnlyInTarget: [],
      relationsInBoth: [],
    });

    const res = await app.request(`/v1/merge/drafts/${draft.draftId}/checks`, { method: 'GET' });

    expect(res.status).toBe(200);
    const json: ApiResponse = await res.json();
    const checks = json.data;

    // Evidence chain should pass with "No frames to verify"
    const evidenceCheck = checks.find((c: ApiResponse) => c.id === 'evidence_chain_complete');
    expect(evidenceCheck.passed).toBe(true);
    expect(evidenceCheck.detail).toBe('No frames to verify');
  });

  // ============================================================================
  // Multiple Leaves (source + target each have a Leaf)
  // ============================================================================

  it('validates constraints independently for multiple leaves', async () => {
    const source = await createTestCommit([
      { id: 'f_001', type: 'tech_stack', slots: { text: 'React is used for UI development' } },
    ]);
    const target = await createTestCommit([
      { id: 'f_002', type: 'budget', slots: { text: 'Budget is $5000 for the project' } },
    ]);

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
      autoKept: [],
      conflicts: [],
      onlyInSource: [
        { id: 'f_001', type: 'tech_stack', slots: { text: 'React is used for UI development' } },
      ],
      onlyInTarget: [
        { id: 'f_002', type: 'budget', slots: { text: 'Budget is $5000 for the project' } },
      ],
      relationsOnlyInSource: [],
      relationsOnlyInTarget: [],
      relationsInBoth: [],
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
    const source = await createTestCommit([
      { id: 'f_001', type: 'info', slots: { text: 'Eval source content' } },
    ]);
    const target = await createTestCommit([
      { id: 'f_001', type: 'info', slots: { text: 'Eval target content' } },
    ]);

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
      autoKept: [],
      conflicts: [
        {
          frameId: 'f_001',
          sourceFrame: { id: 'f_001', type: 'info', slots: { text: 'Eval source content' } },
          targetFrame: { id: 'f_001', type: 'info', slots: { text: 'Eval target content' } },
          slotConflicts: [
            { key: 'text', sourceValue: 'Eval source content', targetValue: 'Eval target content' },
          ],
        },
      ],
      onlyInSource: [],
      onlyInTarget: [],
      relationsOnlyInSource: [],
      relationsOnlyInTarget: [],
      relationsInBoth: [],
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
    const source = await createTestCommit([
      { id: 'f_001', type: 'info', slots: { text: 'No runs source' } },
    ]);
    const target = await createTestCommit([
      { id: 'f_001', type: 'info', slots: { text: 'No runs target' } },
    ]);

    await createLeaf(mockDB, {
      commit_hash: source.hash,
      type: 'tweet',
      title: 'Leaf No Runs',
      project_id: testProjectId,
    });

    const draft = await createTestDraft(source.hash, target.hash, {
      autoKept: [],
      conflicts: [
        {
          frameId: 'f_001',
          sourceFrame: { id: 'f_001', type: 'info', slots: { text: 'No runs source' } },
          targetFrame: { id: 'f_001', type: 'info', slots: { text: 'No runs target' } },
          slotConflicts: [
            { key: 'text', sourceValue: 'No runs source', targetValue: 'No runs target' },
          ],
        },
      ],
      onlyInSource: [],
      onlyInTarget: [],
      relationsOnlyInSource: [],
      relationsOnlyInTarget: [],
      relationsInBoth: [],
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
  // Conflicts with resolution
  // ============================================================================

  it('correctly includes conflict frames in merged text for checks', async () => {
    const source = await createTestCommit([
      { id: 'f_001', type: 'budget', slots: { amount: '$3000' }, source: 'T1' },
    ]);
    const target = await createTestCommit([
      { id: 'f_001', type: 'budget', slots: { amount: '$5000' }, source: 'T2' },
    ]);

    const draft = await createTestDraft(source.hash, target.hash, {
      autoKept: [],
      conflicts: [
        {
          frameId: 'f_001',
          sourceFrame: { id: 'f_001', type: 'budget', slots: { amount: '$3000' }, source: 'T1' },
          targetFrame: { id: 'f_001', type: 'budget', slots: { amount: '$5000' }, source: 'T2' },
          slotConflicts: [{ key: 'amount', sourceValue: '$3000', targetValue: '$5000' }],
        },
      ],
      onlyInSource: [],
      onlyInTarget: [],
      relationsOnlyInSource: [],
      relationsOnlyInTarget: [],
      relationsInBoth: [],
    });

    const res = await app.request(`/v1/merge/drafts/${draft.draftId}/checks`, { method: 'GET' });

    expect(res.status).toBe(200);
    const json: ApiResponse = await res.json();
    const checks = json.data;

    // Evidence chain should pass (source frame has source)
    const evidenceCheck = checks.find((c: ApiResponse) => c.id === 'evidence_chain_complete');
    expect(evidenceCheck.passed).toBe(true);
  });
});
