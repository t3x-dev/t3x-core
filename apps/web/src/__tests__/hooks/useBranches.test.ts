// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForHook } from './renderHook';

vi.mock('@/infrastructure/branches', () => ({
  createBranch: vi.fn(),
  listBranches: vi.fn(),
}));

import { useBranches } from '@/hooks/shared/useBranches';
import { createBranch, listBranches } from '@/infrastructure/branches';
import type { Branch } from '@/infrastructure/types';

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('shared useBranches', () => {
  it('uses registered branches as the canonical switchable inventory', async () => {
    vi.mocked(listBranches).mockResolvedValue({
      branches: [
        { name: 'feature/registered', head_commit_hash: 'sha256:feature' },
        { name: 'main', head_commit_hash: 'sha256:main' },
      ],
    } as never);

    const { result, unmount } = renderHook(() => useBranches('proj_1', true));
    await waitForHook();

    expect(result.current.branches).toEqual(['main', 'feature/registered']);
    expect(result.current.branchHeads).toEqual({
      'feature/registered': 'sha256:feature',
      main: 'sha256:main',
    });
    expect(listBranches).toHaveBeenCalledWith('proj_1');
    unmount();
  });

  it('does not invent main when the branch API returns no registered branches', async () => {
    vi.mocked(listBranches).mockResolvedValue({ branches: [] } as never);

    const { result, unmount } = renderHook(() => useBranches('proj_1', true));
    await waitForHook();

    expect(result.current.branches).toEqual([]);
    expect(result.current.branchHeads).toEqual({});
    unmount();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
function inventory(name: string) {
  return { branches: [{ name, head_commit_hash: `sha256:${name}` }] } as Awaited<
    ReturnType<typeof listBranches>
  >;
}
function branch(name: string, head = name) {
  return { name, head_commit_hash: `sha256:${head}` } as Branch;
}

it('ignores late project replies, including returning to the same project', async () => {
  const old = deferred<Awaited<ReturnType<typeof listBranches>>>();
  vi.mocked(listBranches)
    .mockImplementationOnce(() => old.promise)
    .mockResolvedValueOnce(inventory('other'))
    .mockResolvedValueOnce(inventory('current'));
  const { result, rerender } = renderHook(({ projectId }) => useBranches(projectId, true), {
    initialProps: { projectId: 'project-a' },
  });
  rerender({ projectId: 'project-b' });
  await waitForHook();
  expect(result.current.branches).toEqual(['other']);
  rerender({ projectId: 'project-a' });
  await waitForHook();
  expect(result.current.branches).toEqual(['current']);
  await act(async () => old.resolve(inventory('stale')));
  expect(result.current.branches).toEqual(['current']);
  expect(result.current.branchHeads).toEqual({ current: 'sha256:current' });
});

it('keeps the newest refresh when an older request fails later', async () => {
  const old = deferred<Awaited<ReturnType<typeof listBranches>>>();
  vi.mocked(listBranches)
    .mockImplementationOnce(() => old.promise)
    .mockResolvedValueOnce(inventory('newest'));
  const { result } = renderHook(() => useBranches('project-a', true));
  await act(async () => result.current.refresh());
  expect(result.current.branches).toEqual(['newest']);
  await act(async () => old.reject(new Error('Old request failed')));
  expect(result.current.branches).toEqual(['newest']);
  expect(result.current.loading).toBe(false);
});

it('ignores a late refresh after a branch creation acknowledgement', async () => {
  const read = deferred<Awaited<ReturnType<typeof listBranches>>>();
  vi.mocked(listBranches).mockImplementationOnce(() => read.promise);
  vi.mocked(createBranch).mockResolvedValue(branch('feature'));
  const { result } = renderHook(() => useBranches('project-a', true));
  await act(async () => {
    await result.current.create('feature', 'main');
  });
  await act(async () => read.resolve(inventory('main')));
  expect(result.current.branches).toEqual(['feature']);
  expect(result.current.branchHeads).toEqual({ feature: 'sha256:feature' });
  expect(result.current.loading).toBe(false);
});

it('returns a completed creation without applying it to a different project', async () => {
  const created = deferred<Branch>();
  vi.mocked(listBranches).mockImplementation(async (projectId) => inventory(projectId));
  vi.mocked(createBranch).mockImplementationOnce(() => created.promise);
  const { result, rerender } = renderHook(({ projectId }) => useBranches(projectId, true), {
    initialProps: { projectId: 'project-a' },
  });
  await waitForHook();
  const pending = result.current.create('feature', 'main');
  rerender({ projectId: 'project-b' });
  await waitForHook();
  await act(async () => created.resolve(branch('feature')));
  expect(await pending).toEqual(branch('feature'));
  expect(result.current.branches).toEqual(['project-b']);
  expect(result.current.branchHeads).toEqual({ 'project-b': 'sha256:project-b' });
});

it('invalidates requests on disable and rejects callbacks from the old context', async () => {
  const old = deferred<Awaited<ReturnType<typeof listBranches>>>();
  vi.mocked(listBranches)
    .mockImplementationOnce(() => old.promise)
    .mockResolvedValueOnce(inventory('fresh'));
  const { result, rerender } = renderHook(({ enabled }) => useBranches('project-a', enabled), {
    initialProps: { enabled: true },
  });
  const oldRefresh = result.current.refresh;
  const oldCreate = result.current.create;
  rerender({ enabled: false });
  await act(async () => old.resolve(inventory('stale')));
  expect(result.current.branches).toEqual([]);
  expect(result.current.branchHeads).toEqual({});
  expect(result.current.loading).toBe(false);
  await oldRefresh();
  await expect(oldCreate('feature', 'main')).rejects.toThrow('Branch context changed');
  expect(listBranches).toHaveBeenCalledTimes(1);
  expect(createBranch).not.toHaveBeenCalled();
  rerender({ enabled: true });
  await waitForHook();
  expect(result.current.branches).toEqual(['fresh']);
});

it('keeps late unmounted creation replies out of the next instance', async () => {
  const created = deferred<Branch>();
  vi.mocked(listBranches).mockResolvedValue(inventory('main'));
  vi.mocked(createBranch).mockImplementationOnce(() => created.promise);
  const first = renderHook(() => useBranches('project-a', true));
  await waitForHook();
  const pending = first.result.current.create('feature', 'main');
  first.unmount();
  const next = renderHook(() => useBranches('project-a', true));
  await waitForHook();
  await act(async () => created.resolve(branch('feature')));
  await pending;
  expect(next.result.current.branches).toEqual(['main']);
});

it('keeps simultaneous creations and ignores superseded replies for the same name', async () => {
  const first = deferred<Branch>();
  const second = deferred<Branch>();
  vi.mocked(listBranches).mockResolvedValue(inventory('main'));
  vi.mocked(createBranch)
    .mockImplementationOnce(() => first.promise)
    .mockImplementationOnce(() => second.promise)
    .mockResolvedValueOnce(branch('other'));
  const { result } = renderHook(() => useBranches('project-a', true));
  await waitForHook();
  const a = result.current.create('feature', 'main');
  const b = result.current.create('feature', 'main');
  await act(async () => {
    await result.current.create('other', 'main');
  });
  await act(async () => second.resolve(branch('feature', 'new')));
  await b;
  await act(async () => first.resolve(branch('feature', 'old')));
  await a;
  expect(result.current.branches).toEqual(['main', 'feature', 'other']);
  expect(result.current.branchHeads.feature).toBe('sha256:new');
});

it('ignores a superseded successful refresh in the same project', async () => {
  const first = deferred<Awaited<ReturnType<typeof listBranches>>>();
  const latest = deferred<Awaited<ReturnType<typeof listBranches>>>();
  vi.mocked(listBranches)
    .mockImplementationOnce(() => first.promise)
    .mockImplementationOnce(() => latest.promise);
  const { result } = renderHook(() => useBranches('project-a', true));
  let refresh!: Promise<void>;
  act(() => {
    refresh = result.current.refresh();
  });
  await act(async () => first.resolve(inventory('stale')));
  expect(result.current.loading).toBe(true);
  expect(result.current.branches).toEqual([]);
  await act(async () => latest.resolve(inventory('fresh')));
  await refresh;
  expect(result.current.branches).toEqual(['fresh']);
  expect(result.current.loading).toBe(false);
});

it.each([
  true,
  false,
])('preserves a newer list before a delayed create acknowledgement (listed: %s)', async (listed) => {
  const created = deferred<Branch>();
  vi.mocked(listBranches)
    .mockResolvedValueOnce(inventory('main'))
    .mockResolvedValueOnce({
      branches: [branch('main'), ...(listed ? [branch('feature', 'advanced')] : [])],
    } as Awaited<ReturnType<typeof listBranches>>);
  vi.mocked(createBranch).mockImplementationOnce(() => created.promise);
  const { result } = renderHook(() => useBranches('project-a', true));
  await waitForHook();
  const pending = result.current.create('feature', 'main');
  await act(async () => result.current.refresh());
  await act(async () => created.resolve(branch('feature', 'original')));
  await pending;
  expect(result.current.branches).toEqual(['main', 'feature']);
  expect(result.current.branchHeads.feature).toBe(listed ? 'sha256:advanced' : 'sha256:original');
});
