// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupRoots, renderHook, waitForHook } from './renderHook';

vi.mock('@/infrastructure/branches', () => ({
  createBranch: vi.fn(),
  listBranches: vi.fn(),
}));

import { useBranches } from '@/hooks/shared/useBranches';
import { createBranch, listBranches } from '@/infrastructure/branches';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanupRoots();
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

  it('returns the created branch so callers can hand off its exact head', async () => {
    vi.mocked(listBranches).mockResolvedValue({ branches: [] } as never);
    vi.mocked(createBranch).mockResolvedValue({
      branch_id: 'branch:feature/new-workspace',
      created_at: '2026-07-24T12:00:00.000Z',
      head_commit_hash: 'sha256:parent-head',
      is_current: false,
      name: 'feature/new-workspace',
      parent_branch: 'main',
      updated_at: '2026-07-24T12:00:00.000Z',
    });

    const { result, unmount } = renderHook(() => useBranches('proj_1', true));
    await waitForHook();

    let created: Awaited<ReturnType<typeof result.current.create>> | undefined;
    await act(async () => {
      created = await result.current.create('feature/new-workspace', 'main');
    });

    expect(created).toMatchObject({
      name: 'feature/new-workspace',
      head_commit_hash: 'sha256:parent-head',
    });
    expect(result.current.branches).toEqual(['feature/new-workspace']);
    expect(result.current.branchHeads).toEqual({
      'feature/new-workspace': 'sha256:parent-head',
    });
    unmount();
  });
});
