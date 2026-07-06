// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceCommit } from '@/hooks/workspaces/useWorkspaceCommit';
import { commitWorkspaceDraft, saveWorkspaceDraft } from '@/queries/workspaces';
import type { WorkspaceCandidate } from '@/types/workspaces';
import type { WorkspaceYOpsTreeNode } from '@/types/workspaceYops';
import { cleanupRoots, renderHook } from '../renderHook';

vi.mock('@/queries/workspaces', () => ({
  commitWorkspaceDraft: vi.fn(),
  saveWorkspaceDraft: vi.fn(),
}));

const candidate: WorkspaceCandidate = {
  id: 'workspace_prd_handoff',
  projectId: 'proj_1',
  title: 'PRD audience handoff',
  summary: 'Source bundle for aligning PRD audience notes.',
  status: 'ready_for_yops',
  updatedAt: '2026-06-29T09:30:00.000Z',
  baseCommitHash: 'sha256:base-prd',
  targetBranch: 'feature/prd-audience',
  sourceBundle: [],
  schemaBindings: [{ schemaName: 'PRD Schema', version: 'v2', mode: 'pinned' }],
  schemaCandidate: { summary: 'Ready candidate.', fields: [] },
  schemaReview: { verdict: 'ready', summary: 'Ready for YOps.', gaps: [] },
  yopsDraft: { id: 'draft_prd_handoff', operations: [] },
  outputTargets: [],
};

const materializedTrees: WorkspaceYOpsTreeNode[] = [
  { key: 'prd', slots: { title: 'PRD audience handoff' }, children: [] },
];

describe('useWorkspaceCommit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(saveWorkspaceDraft).mockResolvedValue({
      candidate_id: 'candidate:workspace_prd_handoff',
      workspace: candidate,
    });
    vi.mocked(commitWorkspaceDraft).mockResolvedValue({
      candidate_id: 'candidate:workspace_prd_handoff',
      commit: { hash: 'sha256:workspace-commit' },
      workspace: { ...candidate, lastCommitHash: 'sha256:workspace-commit', status: 'committed' },
    });
  });

  afterEach(() => {
    cleanupRoots();
  });

  it('persists the workspace staged state before creating a workspace commit', async () => {
    const { result } = renderHook(() => useWorkspaceCommit(candidate));

    let hash = '';
    await act(async () => {
      hash = await result.current.commit(materializedTrees);
    });

    expect(hash).toBe('sha256:workspace-commit');
    expect(saveWorkspaceDraft).toHaveBeenCalledWith('proj_1', 'workspace_prd_handoff', candidate);
    expect(commitWorkspaceDraft).toHaveBeenCalledWith(
      'proj_1',
      'workspace_prd_handoff',
      { trees: materializedTrees, relations: [] },
      'Workspace commit: PRD audience handoff'
    );
    expect(vi.mocked(saveWorkspaceDraft).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(commitWorkspaceDraft).mock.invocationCallOrder[0]
    );
  });
});
