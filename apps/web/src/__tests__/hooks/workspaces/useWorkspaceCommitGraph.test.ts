// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useWorkspaceCommitGraph } from '@/hooks/workspaces/useWorkspaceCommitGraph';
import type { ApiCommit } from '@/types/api';

const mocks = vi.hoisted(() => ({ commits: vi.fn(), branches: vi.fn() }));
vi.mock('@/infrastructure/commits', () => ({ fetchCommits: mocks.commits }));
vi.mock('@/infrastructure/branches', () => ({ listBranches: mocks.branches }));
const commit = (projectId: string): ApiCommit => ({
  project_id: projectId,
  hash: projectId,
  parents: [],
  branch: 'main',
  schema: 't3x/commit/v2',
  committed_at: '2026-10-22T01:00:00Z',
  message: null,
  author: { type: 'human' },
  content: { trees: [], relations: [] },
  sources: null,
  provenance: null,
});

beforeEach(() => {
  mocks.commits.mockReset().mockResolvedValue([commit('p')]);
  mocks.branches.mockReset().mockResolvedValue({ branches: [] });
});

it('loads all refs by default and limits the payload to recent history', async () => {
  const { result } = renderHook(() => useWorkspaceCommitGraph('p'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(mocks.commits).toHaveBeenCalledWith('p', undefined, 100);
  expect(mocks.branches).toHaveBeenCalledWith('p');
  expect(result.current.commits).toEqual([commit('p')]);
});

it('uses exact branch filters, refreshes on committed basis changes, and supports manual retry', async () => {
  const { result, rerender } = renderHook(
    ({ branch, basis }) => useWorkspaceCommitGraph('p', branch, basis),
    { initialProps: { branch: 'dev/中文', basis: 'before' } }
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(mocks.commits).toHaveBeenLastCalledWith('p', 'dev/中文', 100);
  rerender({ branch: 'dev/中文', basis: 'after' });
  await waitFor(() => expect(mocks.commits).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(result.current.loading).toBe(false));
  act(() => result.current.refresh());
  await waitFor(() => expect(mocks.commits).toHaveBeenCalledTimes(3));
});

it('drops a previous project response after switching scope', async () => {
  let resolveOld!: (value: ApiCommit[]) => void;
  mocks.commits.mockImplementation((id: string) =>
    id === 'old'
      ? new Promise<ApiCommit[]>((resolve) => {
          resolveOld = resolve;
        })
      : Promise.resolve([commit(id)])
  );
  const { result, rerender } = renderHook(({ id }) => useWorkspaceCommitGraph(id), {
    initialProps: { id: 'old' },
  });
  rerender({ id: 'new' });
  await waitFor(() => expect(result.current.commits[0]?.project_id).toBe('new'));
  await act(async () => resolveOld([commit('old')]));
  expect(result.current.commits[0]?.project_id).toBe('new');
});

it('fails closed for foreign project data and lets a failed request retry', async () => {
  mocks.commits.mockResolvedValueOnce([commit('other')]);
  const { result } = renderHook(() => useWorkspaceCommitGraph('p'));
  await waitFor(() => expect(result.current.error).toMatch(/does not match/));
  expect(result.current.commits).toEqual([]);
  mocks.commits.mockRejectedValueOnce(new Error('Offline'));
  act(() => result.current.refresh());
  await waitFor(() => expect(result.current.error).toBe('Offline'));
  act(() => result.current.refresh());
  await waitFor(() => expect(result.current.commits).toEqual([commit('p')]));
  expect(result.current.error).toBeUndefined();
});
