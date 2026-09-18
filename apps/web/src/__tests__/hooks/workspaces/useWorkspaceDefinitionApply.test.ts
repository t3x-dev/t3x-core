// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getProjectWorkspaceStarterCandidate } from '@/data/workspaceCandidates';
import { useWorkspaceDefinitionApply } from '@/hooks/workspaces/useWorkspaceDefinitionApply';

const mocks = vi.hoisted(() => ({
  apply: vi.fn(),
  extract: vi.fn(),
  fetchWorkspaces: vi.fn(),
  items: [] as Array<{ available: boolean; id: string; kind: string | null }>,
  persist: vi.fn(),
  preview: vi.fn(),
  saveDraft: vi.fn(),
  yops: vi.fn(),
}));

vi.mock('@/hooks/schemas/useStudioCandidates', () => ({
  useStudioCandidates: () => ({ items: mocks.items, loading: false }),
}));

vi.mock('@/hooks/workspaces/useWorkspaceFlow', () => ({
  useWorkspaceFlow: () => ({
    extractCandidate: mocks.extract,
    saveDraft: mocks.saveDraft,
    sendToYOps: mocks.yops,
  }),
}));

vi.mock('@/queries/workspaces', () => ({
  fetchProjectWorkspaces: (...args: unknown[]) => mocks.fetchWorkspaces(...args),
}));

vi.mock('@/infrastructure/schemaStudio', () => ({
  applyStudioSelection: (...args: unknown[]) => mocks.apply(...args),
  previewStudioSelection: (...args: unknown[]) => mocks.preview(...args),
}));

describe('useWorkspaceDefinitionApply', () => {
  beforeEach(() => {
    mocks.apply.mockReset();
    mocks.extract.mockReset();
    mocks.fetchWorkspaces.mockReset();
    mocks.persist.mockReset();
    mocks.preview.mockReset();
    mocks.saveDraft.mockReset();
    mocks.yops.mockReset();
    mocks.items = [{ available: true, id: 'product-brief', kind: 'module' }];
    mocks.fetchWorkspaces.mockResolvedValue([]);
  });

  it('persists an unbound starter, then applies any selected studio template', async () => {
    const starter = getProjectWorkspaceStarterCandidate('proj_1');
    const persisted = { ...starter, revision: 1 };
    mocks.persist.mockResolvedValue(persisted);
    mocks.preview.mockResolvedValue({
      adoption: { allowed: true },
      report: { issues: [], valid: true },
      reviewHash: 'review-hash',
      workspace: { id: persisted.id, revision: 1 },
    });
    mocks.apply.mockResolvedValue({});
    const onApplied = vi.fn();

    const { result } = renderHook(() =>
      useWorkspaceDefinitionApply({
        candidate: starter,
        onApplied,
        persistCandidate: mocks.persist,
      })
    );

    await act(async () => {
      await expect(result.current.apply()).resolves.toBe(true);
    });

    expect(mocks.persist).toHaveBeenCalledWith(starter);
    expect(mocks.preview).toHaveBeenCalledWith('proj_1', {
      candidateIds: ['product-brief'],
      workspaceId: persisted.id,
    });
    expect(mocks.apply).toHaveBeenCalledWith('proj_1', {
      candidateIds: ['product-brief'],
      ifRevision: 1,
      reviewHash: 'review-hash',
      workspaceId: persisted.id,
    });
    expect(onApplied).toHaveBeenCalledOnce();
    expect(onApplied).toHaveBeenCalledWith(undefined);
  });

  it.each([
    'product-brief',
    'care-checklist',
    'compose-services',
  ] as const)('applies official starter %s through the same persist → preview → apply path', async (starterId) => {
    mocks.items = [{ available: true, id: starterId, kind: 'module' }];
    const starter = getProjectWorkspaceStarterCandidate('proj_1');
    const persisted = { ...starter, revision: 2 };
    mocks.persist.mockResolvedValue(persisted);
    mocks.preview.mockResolvedValue({
      adoption: { allowed: true },
      report: { issues: [], valid: true },
      reviewHash: `${starterId}-review`,
      workspace: { id: persisted.id, revision: 2 },
    });
    mocks.apply.mockResolvedValue({});

    const { result } = renderHook(() =>
      useWorkspaceDefinitionApply({
        candidate: starter,
        persistCandidate: mocks.persist,
      })
    );

    await act(async () => {
      await expect(result.current.apply()).resolves.toBe(true);
    });

    expect(mocks.preview).toHaveBeenCalledWith('proj_1', {
      candidateIds: [starterId],
      workspaceId: persisted.id,
    });
    expect(mocks.apply).toHaveBeenCalledWith('proj_1', {
      candidateIds: [starterId],
      ifRevision: 2,
      reviewHash: `${starterId}-review`,
      workspaceId: persisted.id,
    });
  });

  it('does not apply when Schemas has no available template', async () => {
    mocks.items = [];
    const { result } = renderHook(() =>
      useWorkspaceDefinitionApply({
        candidate: getProjectWorkspaceStarterCandidate('proj_1'),
      })
    );

    await act(async () => {
      await expect(result.current.apply()).resolves.toBe(false);
    });

    expect(result.current.error).toBe('Add a schema in Schemas first, then apply it here.');
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it('rebuilds draft operations after apply clears them', async () => {
    const starter = getProjectWorkspaceStarterCandidate('proj_1');
    const persisted = {
      ...starter,
      revision: 1,
      sourceBundle: [
        {
          id: 'src_notes',
          title: 'product-notes.txt',
          type: 'document' as const,
        },
      ],
    };
    const bound = {
      ...persisted,
      revision: 2,
      schemaBindings: [
        { mode: 'pinned' as const, schemaName: 't3x/product-brief', version: '1.0.0' },
      ],
      yopsDraft: { ...persisted.yopsDraft, operations: [] },
    };
    const rebuilt = {
      ...bound,
      yopsDraft: {
        ...bound.yopsDraft,
        operations: [{ id: 'op_1', op: 'set', path: 'candidate/product/title', summary: 'Demo' }],
      },
    };
    mocks.persist.mockResolvedValue(persisted);
    mocks.preview.mockResolvedValue({
      adoption: { allowed: true },
      report: { issues: [], valid: true },
      reviewHash: 'review-hash',
      workspace: { id: persisted.id, revision: 1 },
    });
    mocks.apply.mockResolvedValue({});
    mocks.fetchWorkspaces.mockResolvedValue([bound]);
    mocks.extract.mockResolvedValue({ workspace: bound });
    mocks.yops.mockResolvedValue({ workspace: rebuilt });

    const onApplied = vi.fn();
    const { result } = renderHook(() =>
      useWorkspaceDefinitionApply({
        candidate: persisted,
        onApplied,
        persistCandidate: mocks.persist,
      })
    );

    await act(async () => {
      await expect(result.current.apply()).resolves.toBe(true);
    });

    expect(mocks.extract).toHaveBeenCalledWith(bound);
    expect(mocks.yops).toHaveBeenCalledWith(bound);
    expect(onApplied).toHaveBeenCalledWith(rebuilt);
  });
});
