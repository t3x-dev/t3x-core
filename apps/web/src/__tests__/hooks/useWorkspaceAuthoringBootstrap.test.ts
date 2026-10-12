// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode, StrictMode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { getProjectWorkspaceStarterCandidate } from '@/data/workspaceCandidates';
import { useWorkspaceAuthoringBootstrap } from '@/hooks/workspaces/useWorkspaceAuthoringBootstrap';

const { initialize, listBranches, validate } = vi.hoisted(() => ({
  initialize: vi.fn(),
  listBranches: vi.fn(),
  validate: vi.fn(),
}));
vi.mock('@/hooks/workspaces/useWorkspaceYOps', () => ({
  validateWorkspaceCandidateYOps: validate,
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

it('automatically prepares Compose once under Strict Mode', async () => {
  const candidate = { ...getProjectWorkspaceStarterCandidate('p'), revision: 1 };
  const save = vi.fn().mockResolvedValue(candidate);
  const { result } = renderHook(() => useWorkspaceAuthoringBootstrap(candidate, save, true), {
    wrapper: ({ children }: { children: ReactNode }) => createElement(StrictMode, null, children),
  });
  await waitFor(() => expect(result.current.active).toBe(true));
  expect(save).toHaveBeenCalledOnce();
  expect(initialize).toHaveBeenCalledOnce();
});

it('waits for explicit confirmation before importing a legacy draft', async () => {
  const candidate = { ...getProjectWorkspaceStarterCandidate('p'), revision: 1 };
  candidate.yopsDraft.operations = [
    { id: 'op-1', op: 'set', path: 'prd/title', afterValue: 'Title', summary: 'Set title' },
  ];
  validate.mockResolvedValue({
    ok: true,
    previewTrees: [{ key: 'prd', slots: { title: 'Title' }, children: [] }],
  });
  const { result } = renderHook(() => useWorkspaceAuthoringBootstrap(candidate, undefined, true));
  await waitFor(() => expect(result.current.importSnapshot).toBeDefined());
  expect(initialize).not.toHaveBeenCalled();
  expect(result.current.active).toBe(false);
  await act(() => result.current.start());
  expect(initialize).toHaveBeenCalledWith(
    'p',
    candidate.id,
    expect.objectContaining({
      legacy_document: result.current.importSnapshot,
    })
  );
  expect(result.current.active).toBe(true);
});

it('does not initialize an old workspace after the user switches during save', async () => {
  const first = { ...getProjectWorkspaceStarterCandidate('p'), id: 'first', revision: 1 };
  const second = { ...first, id: 'second' };
  let finishSave!: (value: typeof first) => void;
  const save = vi
    .fn()
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finishSave = resolve;
      })
    )
    .mockResolvedValue(second);
  const { result, rerender } = renderHook(
    ({ candidate }) => useWorkspaceAuthoringBootstrap(candidate, save, true),
    {
      initialProps: { candidate: first },
    }
  );
  rerender({ candidate: second });
  await waitFor(() => expect(result.current.active).toBe(true));
  await act(async () => {
    finishSave(first);
  });
  expect(initialize).toHaveBeenCalledOnce();
  expect(initialize.mock.calls[0]?.[1]).toBe('second');
});
