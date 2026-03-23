// @vitest-environment jsdom
/**
 * Tests for useBranchCommits hook
 */
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupRoots, renderHook, waitForHook } from './renderHook';

// Mock the api module
vi.mock('@/lib/api', () => ({
  listCommits: vi.fn(),
  listLeavesByCommit: vi.fn(),
}));

import { useBranchCommits } from '@/hooks/useBranchCommits';
import { clearQueryCache } from '@/hooks/useQuery';
import * as api from '@/lib/api';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeCommit = (hash: string) => ({
  hash,
  schema: 't3x/commit/5' as const,
  parents: [],
  author: { type: 'human', id: 'u1', name: 'Test' },
  committed_at: '2026-01-01T00:00:00Z',
  content: { frames: [], relations: [] },
  project_id: 'proj_1',
  message: 'test',
  branch: 'main',
  sources: [],
  provenance: null,
});

const makeLeaf = (id: string, commitHash: string) => ({
  id,
  commit_hash: commitHash,
  type: 'deploy_agent' as const,
  title: 'Leaf',
  constraints: [],
  config: {},
  output: null,
  assertions: [],
  project_id: 'proj_1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  clearQueryCache();
});

afterEach(() => {
  cleanupRoots();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useBranchCommits', () => {
  it('returns null data and no loading when projectId is undefined', async () => {
    const { result, unmount } = renderHook(() => useBranchCommits(undefined, 'main'));
    await waitForHook();

    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(api.listCommits).not.toHaveBeenCalled();
    unmount();
  });

  it('returns null data and no loading when branch is undefined', async () => {
    const { result, unmount } = renderHook(() => useBranchCommits('proj_1', undefined));
    await waitForHook();

    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(api.listCommits).not.toHaveBeenCalled();
    unmount();
  });

  it('fetches commits and their leaves', async () => {
    const c1 = makeCommit('sha256:aaa');
    const c2 = makeCommit('sha256:bbb');
    const leaf1 = makeLeaf('leaf_1', 'sha256:aaa');

    vi.mocked(api.listCommits).mockResolvedValue([c1, c2] as never);
    vi.mocked(api.listLeavesByCommit).mockImplementation(async (hash: string) => {
      if (hash === 'sha256:aaa') return [leaf1] as never;
      return [] as never;
    });

    const { result, unmount } = renderHook(() => useBranchCommits('proj_1', 'main'));

    // Initially loading
    expect(result.current.loading).toBe(true);

    await waitForHook();

    expect(api.listCommits).toHaveBeenCalledWith('proj_1', 'main', 200);
    expect(api.listLeavesByCommit).toHaveBeenCalledTimes(2);

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data![0]).toEqual({ commit: c1, leaves: [leaf1] });
    expect(result.current.data![1]).toEqual({ commit: c2, leaves: [] });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    unmount();
  });

  it('handles empty commits list', async () => {
    vi.mocked(api.listCommits).mockResolvedValue([] as never);

    const { result, unmount } = renderHook(() => useBranchCommits('proj_1', 'main'));
    await waitForHook();

    expect(result.current.data).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(api.listLeavesByCommit).not.toHaveBeenCalled();
    unmount();
  });

  it('sets error when listSentenceCommits fails', async () => {
    vi.mocked(api.listCommits).mockRejectedValue(new Error('fetch failed'));

    const { result, unmount } = renderHook(() => useBranchCommits('proj_1', 'main'));
    await waitForHook();

    expect(result.current.data).toBeNull();
    expect(result.current.error?.message).toBe('fetch failed');
    expect(result.current.loading).toBe(false);
    unmount();
  });

  it('gracefully handles partial leaf fetch failure', async () => {
    const c1 = makeCommit('sha256:aaa');
    const c2 = makeCommit('sha256:bbb');

    vi.mocked(api.listCommits).mockResolvedValue([c1, c2] as never);
    vi.mocked(api.listLeavesByCommit).mockImplementation(async (hash: string) => {
      if (hash === 'sha256:aaa') throw new Error('leaf fetch error');
      return [makeLeaf('leaf_2', 'sha256:bbb')] as never;
    });

    const { result, unmount } = renderHook(() => useBranchCommits('proj_1', 'main'));
    await waitForHook();

    // First commit should have empty leaves (error caught), second should succeed
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data![0].leaves).toEqual([]);
    expect(result.current.data![1].leaves).toHaveLength(1);
    expect(result.current.error).toBeNull();
    unmount();
  });

  it('converts non-Error throws to Error instances', async () => {
    vi.mocked(api.listCommits).mockRejectedValue('string error');

    const { result, unmount } = renderHook(() => useBranchCommits('proj_1', 'main'));
    await waitForHook();

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('string error');
    unmount();
  });

  it('exposes refetch function', async () => {
    vi.mocked(api.listCommits).mockResolvedValue([] as never);

    const { result, unmount } = renderHook(() => useBranchCommits('proj_1', 'main'));
    await waitForHook();

    expect(result.current.data).toEqual([]);
    expect(api.listCommits).toHaveBeenCalledTimes(1);

    // Call refetch
    await act(async () => {
      result.current.refetch();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(api.listCommits).toHaveBeenCalledTimes(2);
    unmount();
  });
});
