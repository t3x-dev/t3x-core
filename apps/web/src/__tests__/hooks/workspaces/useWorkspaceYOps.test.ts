// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceYOps } from '@/hooks/workspaces/useWorkspaceYOps';
import { validateWorkspaceYOps } from '@/infrastructure/workspaceYops';
import { fetchCommitByHash } from '@/queries/commitByHash';
import type { WorkspaceCandidate } from '@/types/workspaces';
import { cleanupRoots, renderHook } from '../renderHook';

vi.mock('@/queries/commitByHash', () => ({ fetchCommitByHash: vi.fn() }));
vi.mock('@/infrastructure/workspaceYops', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/infrastructure/workspaceYops')>();
  return { ...actual, validateWorkspaceYOps: vi.fn() };
});

const baseCommitHash = `sha256:${'a'.repeat(64)}`;
const candidate: WorkspaceCandidate = {
  id: 'workspace_prd_handoff',
  projectId: 'proj_1',
  title: 'PRD audience handoff',
  summary: 'Continue from the committed PRD.',
  status: 'schema_review',
  updatedAt: '2026-07-23T00:00:00.000Z',
  baseCommitHash,
  targetBranch: 'main',
  sourceBundle: [],
  schemaBindings: [{ schemaName: 'PRD Schema', version: 'v2', mode: 'pinned' }],
  schemaCandidate: { summary: 'Next iteration.', fields: [] },
  schemaReview: { verdict: 'ready', summary: 'Ready.', gaps: [] },
  yopsDraft: { id: 'draft_next', operations: [] },
  outputTargets: [],
};

describe('useWorkspaceYOps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchCommitByHash).mockResolvedValue({
      hash: baseCommitHash,
      schema: 't3x/commit',
      parents: [],
      author: { type: 'human', name: 'api' },
      committed_at: '2026-07-22T00:00:00.000Z',
      content: {
        trees: [{ key: 'prd', slots: { title: 'Inherited PRD' }, children: [] }],
        relations: [{ from: 'prd/summary', to: 'prd/requirements', type: 'depends_on' }],
      },
      project_id: 'proj_1',
      message: 'Previous workspace commit',
      branch: 'main',
      sources: [],
      provenance: { method: 'human_curation' },
    });
    vi.mocked(validateWorkspaceYOps).mockResolvedValue({
      ok: true,
      applied: 0,
      yops: [],
      baselineTrees: [],
      baselineRelations: [],
      previewTrees: [],
      previewRelations: [],
    });
  });

  afterEach(() => {
    cleanupRoots();
  });

  it('loads a canonical base commit and validates on its complete semantic content', async () => {
    const { result } = renderHook(() => useWorkspaceYOps(candidate));

    await act(async () => {
      await result.current.validate();
    });

    expect(fetchCommitByHash).toHaveBeenCalledWith(baseCommitHash);
    expect(validateWorkspaceYOps).toHaveBeenCalledWith(candidate, {
      trees: [{ key: 'prd', slots: { title: 'Inherited PRD' }, children: [] }],
      relations: [{ from: 'prd/summary', to: 'prd/requirements', type: 'depends_on' }],
    });
  });
});
