import { describe, expect, it, vi } from 'vitest';

// ── Mocks ──

const mockDB = {};

vi.mock('../db.js', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
}));

const MOCK_DRAFT_EDITING = {
  id: 'draft_abc',
  project_id: 'proj_test1',
  title: 'Test draft',
  goal: undefined,
  parent_commit_hash: 'sha256:parent1',
  status: 'editing',
  committed_as: undefined,
  nodes: [
    { key: 'trip', slots: { budget: 5000, destination: 'Tokyo' }, children: [] },
    { key: 'pref', slots: { style: 'luxury' }, children: [] },
  ],
  revision: 3,
};

const MOCK_DRAFT_COMMITTED = {
  ...MOCK_DRAFT_EDITING,
  id: 'draft_done',
  status: 'committed',
  committed_as: 'sha256:already',
};

const MOCK_DRAFT_EMPTY = {
  ...MOCK_DRAFT_EDITING,
  id: 'draft_empty',
  nodes: [],
};

const MOCK_UPDATED_DRAFT = {
  ...MOCK_DRAFT_EDITING,
  revision: 4,
};

vi.mock('@t3x-dev/storage', () => ({
  findDraftById: vi.fn((_db: unknown, id: string) => {
    const drafts: Record<string, unknown> = {
      draft_abc: MOCK_DRAFT_EDITING,
      draft_done: MOCK_DRAFT_COMMITTED,
      draft_empty: MOCK_DRAFT_EMPTY,
    };
    return Promise.resolve(drafts[id] ?? null);
  }),
  updateDraft: vi.fn(() => Promise.resolve(MOCK_UPDATED_DRAFT)),
}));

// Mock the validation pipeline for controlled test results
const mockValidateYOps = vi.fn();
vi.mock('../validate/pipeline.js', () => ({
  validateYOps: (...args: unknown[]) => mockValidateYOps(...args),
}));

// ── Import handler after mocks ──

import { editHandler } from '../tools/core/edit.js';

// ── Tests ──

describe('t3x_edit handler', () => {
  // ── Validation errors ──

  it('returns error when draft_id is missing', async () => {
    const result = await editHandler({ yops: 'yops:\n  - define:\n      path: trip' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"draft_id" is required');
  });

  it('returns error when yops is missing', async () => {
    const result = await editHandler({ draft_id: 'draft_abc' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"yops" is required');
  });

  // ── Draft lookup errors ──

  it('returns error when draft is not found', async () => {
    mockValidateYOps.mockResolvedValue({ ok: true });
    const result = await editHandler({
      draft_id: 'draft_missing',
      yops: 'yops:\n  - define:\n      path: trip',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Draft not found');
  });

  it('returns error when draft is already committed', async () => {
    const result = await editHandler({
      draft_id: 'draft_done',
      yops: 'yops:\n  - define:\n      path: trip',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('must be "editing"');
    expect(result.content[0].text).toContain('already committed');
  });

  // ── Validation failure ──

  it('returns errors when validation fails', async () => {
    mockValidateYOps.mockResolvedValue({
      ok: false,
      errors: [{ layer: 3, stage: 'engine', message: 'PATH_NOT_FOUND: nonexistent' }],
      auto_fixes: [],
      warnings: [],
    });

    const result = await editHandler({
      draft_id: 'draft_abc',
      yops: 'yops:\n  - populate:\n      path: nonexistent\n      values:\n        x: 1',
    });

    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.applied).toBe(false);
    expect(data.errors).toHaveLength(1);
    expect(data.errors[0].layer).toBe(3);
    expect(data.errors[0].stage).toBe('engine');
    expect(data.fix_hint).toBeDefined();
  });

  it('returns parse errors from layer 1', async () => {
    mockValidateYOps.mockResolvedValue({
      ok: false,
      errors: [{ layer: 1, stage: 'parse', message: 'Invalid YAML syntax' }],
      auto_fixes: [],
      warnings: [],
    });

    const result = await editHandler({
      draft_id: 'draft_abc',
      yops: '{{invalid yaml',
    });

    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.applied).toBe(false);
    expect(data.errors[0].layer).toBe(1);
    expect(data.errors[0].stage).toBe('parse');
  });

  // ── Validation success ──

  it('persists result and returns summary on success', async () => {
    mockValidateYOps.mockResolvedValue({
      ok: true,
      errors: [],
      auto_fixes: [],
      warnings: [],
      parsed_yops: [{ set: { path: 'trip/budget', value: 8000 } }],
      result_doc: {
        trees: [
          { key: 'trip', slots: { budget: 8000, destination: 'Tokyo' }, children: [] },
          { key: 'pref', slots: { style: 'luxury' }, children: [] },
        ],
        relations: [],
      },
    });

    const result = await editHandler({
      draft_id: 'draft_abc',
      yops: 'yops:\n  - set:\n      path: trip/budget\n      value: 8000',
      if_revision: 3,
    });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.applied).toBe(true);
    expect(data.applied_count).toBe(1);
    expect(data.revision).toBe(4);
    expect(data.tree_summary).toHaveLength(2);
    expect(data.tree_summary[0].key).toBe('trip');
    expect(data.tree_summary[0].slots).toBe(2);
    expect(data.next_steps).toBeDefined();
  });

  it('calls updateDraft with correct arguments', async () => {
    mockValidateYOps.mockResolvedValue({
      ok: true,
      errors: [],
      auto_fixes: [],
      warnings: [],
      parsed_yops: [{ set: { path: 'trip/budget', value: 9000 } }],
      result_doc: {
        trees: [
          { key: 'trip', slots: { budget: 9000, destination: 'Tokyo' }, children: [] },
          { key: 'pref', slots: { style: 'luxury' }, children: [] },
        ],
        relations: [],
      },
    });

    const { updateDraft } = await import('@t3x-dev/storage');
    const mock = updateDraft as ReturnType<typeof vi.fn>;
    mock.mockClear();

    await editHandler({
      draft_id: 'draft_abc',
      yops: 'yops:\n  - set:\n      path: trip/budget\n      value: 9000',
      if_revision: 3,
    });

    expect(mock).toHaveBeenCalledWith(
      mockDB,
      'draft_abc',
      {
        nodes: [
          { key: 'trip', slots: { budget: 9000, destination: 'Tokyo' }, children: [] },
          { key: 'pref', slots: { style: 'luxury' }, children: [] },
        ],
      },
      3
    );
  });

  it('passes currentContent to validateYOps from draft nodes', async () => {
    mockValidateYOps.mockClear();
    mockValidateYOps.mockResolvedValue({
      ok: true,
      errors: [],
      auto_fixes: [],
      warnings: [],
      parsed_yops: [],
      result_doc: { trees: [], relations: [] },
    });

    await editHandler({
      draft_id: 'draft_abc',
      yops: 'yops:\n  - define:\n      path: test',
    });

    expect(mockValidateYOps).toHaveBeenCalledWith(
      'yops:\n  - define:\n      path: test',
      expect.objectContaining({
        trees: expect.arrayContaining([
          expect.objectContaining({ key: 'trip', slots: { budget: 5000, destination: 'Tokyo' } }),
        ]),
        relations: [],
      })
    );
  });

  it('uses draft.revision as fallback when if_revision not provided', async () => {
    mockValidateYOps.mockResolvedValue({
      ok: true,
      errors: [],
      auto_fixes: [],
      warnings: [],
      parsed_yops: [],
      result_doc: { trees: [], relations: [] },
    });

    const { updateDraft } = await import('@t3x-dev/storage');
    const mock = updateDraft as ReturnType<typeof vi.fn>;
    mock.mockClear();

    await editHandler({
      draft_id: 'draft_abc',
      yops: 'yops:\n  - define:\n      path: test',
      // no if_revision provided — should use draft.revision (3)
    });

    expect(mock).toHaveBeenCalledWith(
      mockDB,
      'draft_abc',
      expect.any(Object),
      3 // draft.revision fallback
    );
  });

  it('works with empty draft nodes', async () => {
    mockValidateYOps.mockResolvedValue({
      ok: true,
      errors: [],
      auto_fixes: [],
      warnings: [],
      parsed_yops: [{ define: { path: 'trip' } }],
      result_doc: {
        trees: [{ key: 'trip', slots: {}, children: [] }],
        relations: [],
      },
    });

    const result = await editHandler({
      draft_id: 'draft_empty',
      yops: 'yops:\n  - define:\n      path: trip',
    });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.applied).toBe(true);
    expect(data.applied_count).toBe(1);
  });

  it('includes warnings in success response', async () => {
    mockValidateYOps.mockResolvedValue({
      ok: true,
      errors: [],
      auto_fixes: [{ layer: 2, description: 'Auto-fixed indentation' }],
      warnings: [{ layer: 4, stage: 'gates', message: 'Duplicate keys detected in tree' }],
      parsed_yops: [{ define: { path: 'trip' } }],
      result_doc: {
        trees: [{ key: 'trip', slots: {}, children: [] }],
        relations: [],
      },
    });

    const result = await editHandler({
      draft_id: 'draft_abc',
      yops: 'yops:\n  - define:\n      path: trip',
    });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.applied).toBe(true);
    expect(data.warnings).toHaveLength(1);
    expect(data.warnings[0].message).toContain('Duplicate keys');
    expect(data.auto_fixes).toHaveLength(1);
  });
});
