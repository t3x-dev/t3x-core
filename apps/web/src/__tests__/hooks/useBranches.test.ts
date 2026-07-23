// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupRoots, renderHook, waitForHook } from './renderHook';

vi.mock('@/infrastructure/branches', () => ({
  createBranch: vi.fn(),
  listBranches: vi.fn(),
}));

import { useBranches } from '@/hooks/shared/useBranches';
import { listBranches } from '@/infrastructure/branches';

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
});
