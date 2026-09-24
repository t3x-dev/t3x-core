// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { getProjectWorkspaceStarterCandidate } from '@/data/workspaceCandidates';
import { useWorkspaceAuthoringBootstrap } from '@/hooks/workspaces/useWorkspaceAuthoringBootstrap';

const { initialize, listBranches } = vi.hoisted(() => ({
  initialize: vi.fn(),
  listBranches: vi.fn(),
}));
vi.mock('@/infrastructure/sharedApiClient', () => ({
  getSharedApiClient: () => ({ listBranches, workspaces: { authoring: { initialize } } }),
}));
beforeEach(() => {
  vi.resetAllMocks();
  initialize.mockResolvedValue({});
  listBranches.mockResolvedValue({ branches: [] });
});

it('saves a new Workspace and initializes with the returned revision before enabling tabs', async () => {
  const candidate = { ...getProjectWorkspaceStarterCandidate('p'), revision: undefined };
  const saved = { ...candidate, revision: 1 };
  const save = vi.fn().mockResolvedValue(saved);
  const { result } = renderHook(() => useWorkspaceAuthoringBootstrap(candidate, save));
  await act(() => result.current.start());
  expect(save).toHaveBeenCalledOnce();
  expect(initialize).toHaveBeenCalledWith(
    'p',
    candidate.id,
    expect.objectContaining({
      expected_workspace_revision: 1,
    })
  );
  expect(result.current.active).toBe(true);
  expect(result.current.error).toBeNull();
});

it('does not initialize or show active tabs when saving fails', async () => {
  const candidate = { ...getProjectWorkspaceStarterCandidate('p'), revision: undefined };
  const save = vi.fn().mockRejectedValue(new Error('Save failed'));
  const { result } = renderHook(() => useWorkspaceAuthoringBootstrap(candidate, save));
  await act(() => result.current.start());
  expect(initialize).not.toHaveBeenCalled();
  expect(result.current.active).toBe(false);
  expect(result.current.error).toBe('Save failed');
});

it('prepares existing Workspaces before initialization too', async () => {
  const candidate = { ...getProjectWorkspaceStarterCandidate('p'), revision: 2 };
  const save = vi.fn().mockResolvedValue(candidate);
  const { result } = renderHook(() => useWorkspaceAuthoringBootstrap(candidate, save));
  await act(() => result.current.start());
  expect(save).toHaveBeenCalledOnce();
  expect(result.current.active).toBe(true);
});

it('prepares an already active Workspace without initializing its history again', async () => {
  const candidate = { ...getProjectWorkspaceStarterCandidate('p'), revision: 2 };
  const save = vi.fn().mockResolvedValue(candidate);
  const { result } = renderHook(() => useWorkspaceAuthoringBootstrap(candidate, save));
  await act(() => result.current.start());
  await act(() => result.current.start());
  expect(save).toHaveBeenCalledTimes(2);
  expect(initialize).toHaveBeenCalledOnce();
  expect(result.current.active).toBe(true);
});
