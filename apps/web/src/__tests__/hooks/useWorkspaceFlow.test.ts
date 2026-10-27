// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useWorkspaceFlow } from '@/hooks/workspaces/useWorkspaceFlow';
import type { WorkspaceCandidate } from '@/types/workspaces';

const mocks = vi.hoisted(() => ({ create: vi.fn(), list: vi.fn(), save: vi.fn() }));
vi.mock('@/infrastructure/branches', () => ({ createBranch: mocks.create }));
vi.mock('@/queries/workspaces', () => ({
  fetchProjectWorkspaces: mocks.list,
  saveWorkspaceDraft: mocks.save,
}));
const candidate = {
  id: 'source',
  projectId: 'p',
  targetBranch: 'main',
  revision: 3,
  sourceBundle: [],
  schemaBindings: [{ schemaHash: 'uncommitted-schema' }],
  yopsDraft: { id: 'draft', operations: [] },
} as unknown as WorkspaceCandidate;
beforeEach(() => {
  vi.resetAllMocks();
});

it('uses the atomic server-inherited Workspace rather than copying a mutable source Draft', async () => {
  const inherited = {
    id: 'workspace_branch:feature%2Fschema',
    targetBranch: 'feature/schema',
    schemaBindings: [{ schemaHash: 'exact-committed-schema' }],
  };
  mocks.list.mockResolvedValue([inherited]);
  const { result } = renderHook(() => useWorkspaceFlow());
  const next = await result.current.startNextIteration({
    candidate,
    createBranchFrom: 'main',
    parentCommitHash: 'committed',
    targetBranch: 'feature/schema',
  });
  expect(mocks.create).toHaveBeenCalledWith('p', 'feature/schema', 'main');
  expect(next.workspace).toBe(inherited);
  expect(mocks.save).not.toHaveBeenCalled();
});

it('does not overwrite or invent a Workspace if the post-create refresh fails', async () => {
  mocks.list.mockResolvedValue([]);
  const { result } = renderHook(() => useWorkspaceFlow());
  await expect(
    result.current.startNextIteration({
      candidate,
      createBranchFrom: 'main',
      parentCommitHash: 'committed',
      targetBranch: 'feature/schema',
    })
  ).rejects.toThrow('could not be loaded');
  expect(mocks.save).not.toHaveBeenCalled();
});

it('retains the existing same-branch continuation path without creating another branch', async () => {
  mocks.save.mockImplementation(async (_project, _id, workspace) => ({ workspace }));
  const { result } = renderHook(() => useWorkspaceFlow());
  const next = await result.current.startNextIteration({
    candidate,
    parentCommitHash: 'committed',
    targetBranch: 'main',
  });
  expect(mocks.create).not.toHaveBeenCalled();
  expect(next.workspace).toMatchObject({
    id: 'source',
    baseCommitHash: 'committed',
    targetBranch: 'main',
    schemaBindings: candidate.schemaBindings,
  });
});
