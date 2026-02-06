// @vitest-environment jsdom
/**
 * Tests for useApi hooks (useApiCall generic + specific hooks)
 */
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupRoots, renderHook, waitForHook } from './renderHook';

// Mock the api module before importing hooks
vi.mock('@/lib/api', () => ({
  checkHealth: vi.fn(),
  getStatus: vi.fn(),
  listProjects: vi.fn(),
  getProject: vi.fn(),
  listConversations: vi.fn(),
  listTurns: vi.fn(),
  getTurn: vi.fn(),
  listBranches: vi.fn(),
  getCurrentBranch: vi.fn(),
  listCommitsV3: vi.fn(),
  getCommitV3: vi.fn(),
  getDraft: vi.fn(),
}));

import {
  useBranches,
  useCommitsV3,
  useCommitV3,
  useConversations,
  useCurrentBranch,
  useDraft,
  useHealth,
  useProject,
  useProjects,
  useStatus,
  useTurn,
  useTurns,
} from '@/hooks/useApi';
import * as api from '@/lib/api';

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanupRoots();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// useHealth / useStatus — simple zero-dep hooks
// ---------------------------------------------------------------------------

describe('useHealth', () => {
  it('fetches health and exposes data', async () => {
    const payload = { status: 'ok', version: '1.0.0', uptime: 100 };
    vi.mocked(api.checkHealth).mockResolvedValue(payload);

    const { result, unmount } = renderHook(() => useHealth());
    expect(result.current.loading).toBe(true);

    await waitForHook();

    expect(result.current.data).toEqual(payload);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(api.checkHealth).toHaveBeenCalledOnce();
    unmount();
  });

  it('exposes error when API call fails', async () => {
    vi.mocked(api.checkHealth).mockRejectedValue(new Error('network'));

    const { result, unmount } = renderHook(() => useHealth());
    await waitForHook();

    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error?.message).toBe('network');
    unmount();
  });
});

describe('useStatus', () => {
  it('fetches status', async () => {
    const payload = { database: 'ok' };
    vi.mocked(api.getStatus).mockResolvedValue(payload as never);

    const { result, unmount } = renderHook(() => useStatus());
    await waitForHook();

    expect(result.current.data).toEqual(payload);
    expect(api.getStatus).toHaveBeenCalledOnce();
    unmount();
  });
});

// ---------------------------------------------------------------------------
// useProjects
// ---------------------------------------------------------------------------

describe('useProjects', () => {
  it('passes limit and offset to API', async () => {
    const payload = { projects: [{ project_id: 'proj_1' }], limit: 10, offset: 5 };
    vi.mocked(api.listProjects).mockResolvedValue(payload as never);

    const { result, unmount } = renderHook(() => useProjects(10, 5));
    await waitForHook();

    expect(api.listProjects).toHaveBeenCalledWith(10, 5);
    expect(result.current.data).toEqual(payload);
    unmount();
  });

  it('uses default limit=50, offset=0', async () => {
    vi.mocked(api.listProjects).mockResolvedValue({ projects: [], limit: 50, offset: 0 } as never);

    const { unmount } = renderHook(() => useProjects());
    await waitForHook();

    expect(api.listProjects).toHaveBeenCalledWith(50, 0);
    unmount();
  });
});

// ---------------------------------------------------------------------------
// useProject — optional projectId
// ---------------------------------------------------------------------------

describe('useProject', () => {
  it('fetches project when id is provided', async () => {
    const proj = { project_id: 'proj_1', name: 'Test' };
    vi.mocked(api.getProject).mockResolvedValue(proj as never);

    const { result, unmount } = renderHook(() => useProject('proj_1'));
    await waitForHook();

    expect(api.getProject).toHaveBeenCalledWith('proj_1');
    expect(result.current.data).toEqual(proj);
    unmount();
  });

  it('returns null without calling API when id is undefined', async () => {
    const { result, unmount } = renderHook(() => useProject(undefined));
    await waitForHook();

    expect(api.getProject).not.toHaveBeenCalled();
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
    unmount();
  });
});

// ---------------------------------------------------------------------------
// useConversations — optional projectId
// ---------------------------------------------------------------------------

describe('useConversations', () => {
  it('fetches conversations when projectId is provided', async () => {
    const payload = { conversations: [], limit: 50, offset: 0 };
    vi.mocked(api.listConversations).mockResolvedValue(payload as never);

    const { result, unmount } = renderHook(() => useConversations('proj_1'));
    await waitForHook();

    expect(api.listConversations).toHaveBeenCalledWith('proj_1', 50, 0);
    expect(result.current.data).toEqual(payload);
    unmount();
  });

  it('returns empty list when projectId is undefined', async () => {
    const { result, unmount } = renderHook(() => useConversations(undefined));
    await waitForHook();

    expect(api.listConversations).not.toHaveBeenCalled();
    expect(result.current.data).toEqual({ conversations: [], limit: 50, offset: 0 });
    unmount();
  });
});

// ---------------------------------------------------------------------------
// useTurns — requires projectId + conversationId
// ---------------------------------------------------------------------------

describe('useTurns', () => {
  it('fetches turns when both ids are provided', async () => {
    const payload = { turns: [{ turn_hash: 'sha256:abc' }], limit: 100, offset: 0 };
    vi.mocked(api.listTurns).mockResolvedValue(payload as never);

    const { result, unmount } = renderHook(() => useTurns('proj_1', 'conv_1'));
    await waitForHook();

    expect(api.listTurns).toHaveBeenCalledWith('proj_1', 'conv_1', 100, 0);
    expect(result.current.data).toEqual(payload);
    unmount();
  });

  it('returns empty list when projectId is undefined', async () => {
    const { result, unmount } = renderHook(() => useTurns(undefined, 'conv_1'));
    await waitForHook();

    expect(api.listTurns).not.toHaveBeenCalled();
    expect(result.current.data).toEqual({ turns: [], limit: 100, offset: 0 });
    unmount();
  });

  it('returns empty list when conversationId is undefined', async () => {
    const { result, unmount } = renderHook(() => useTurns('proj_1', undefined));
    await waitForHook();

    expect(api.listTurns).not.toHaveBeenCalled();
    expect(result.current.data).toEqual({ turns: [], limit: 100, offset: 0 });
    unmount();
  });
});

// ---------------------------------------------------------------------------
// useTurn — optional turnHash
// ---------------------------------------------------------------------------

describe('useTurn', () => {
  it('fetches turn by hash', async () => {
    const turn = { turn_hash: 'sha256:abc', content: 'hi' };
    vi.mocked(api.getTurn).mockResolvedValue(turn as never);

    const { result, unmount } = renderHook(() => useTurn('sha256:abc'));
    await waitForHook();

    expect(api.getTurn).toHaveBeenCalledWith('sha256:abc');
    expect(result.current.data).toEqual(turn);
    unmount();
  });

  it('returns null when hash is undefined', async () => {
    const { result, unmount } = renderHook(() => useTurn(undefined));
    await waitForHook();

    expect(api.getTurn).not.toHaveBeenCalled();
    expect(result.current.data).toBeNull();
    unmount();
  });
});

// ---------------------------------------------------------------------------
// useBranches / useCurrentBranch
// ---------------------------------------------------------------------------

describe('useBranches', () => {
  it('fetches branches for project', async () => {
    const payload = { branches: [{ name: 'main' }], limit: 50, offset: 0 };
    vi.mocked(api.listBranches).mockResolvedValue(payload as never);

    const { result, unmount } = renderHook(() => useBranches('proj_1'));
    await waitForHook();

    expect(api.listBranches).toHaveBeenCalledWith('proj_1');
    expect(result.current.data).toEqual(payload);
    unmount();
  });

  it('returns empty when projectId is undefined', async () => {
    const { result, unmount } = renderHook(() => useBranches(undefined));
    await waitForHook();

    expect(api.listBranches).not.toHaveBeenCalled();
    expect(result.current.data).toEqual({ branches: [], limit: 50, offset: 0 });
    unmount();
  });
});

describe('useCurrentBranch', () => {
  it('fetches current branch', async () => {
    const branch = { name: 'main', is_current: true };
    vi.mocked(api.getCurrentBranch).mockResolvedValue(branch as never);

    const { result, unmount } = renderHook(() => useCurrentBranch('proj_1'));
    await waitForHook();

    expect(api.getCurrentBranch).toHaveBeenCalledWith('proj_1');
    expect(result.current.data).toEqual(branch);
    unmount();
  });

  it('returns null when projectId is undefined', async () => {
    const { result, unmount } = renderHook(() => useCurrentBranch(undefined));
    await waitForHook();

    expect(api.getCurrentBranch).not.toHaveBeenCalled();
    expect(result.current.data).toBeNull();
    unmount();
  });
});

// ---------------------------------------------------------------------------
// useCommitsV3 / useCommitV3
// ---------------------------------------------------------------------------

describe('useCommitsV3', () => {
  it('fetches commits with branch filter', async () => {
    const payload = { commits: [], project_id: 'proj_1', limit: 50, offset: 0 };
    vi.mocked(api.listCommitsV3).mockResolvedValue(payload as never);

    const { result, unmount } = renderHook(() => useCommitsV3('proj_1', 'main'));
    await waitForHook();

    expect(api.listCommitsV3).toHaveBeenCalledWith('proj_1', 'main', 50, 0);
    expect(result.current.data).toEqual(payload);
    unmount();
  });

  it('returns empty when projectId is undefined', async () => {
    const { result, unmount } = renderHook(() => useCommitsV3(undefined));
    await waitForHook();

    expect(api.listCommitsV3).not.toHaveBeenCalled();
    expect(result.current.data).toEqual({ commits: [], project_id: '', limit: 50, offset: 0 });
    unmount();
  });
});

describe('useCommitV3', () => {
  it('fetches single commit by hash', async () => {
    const commit = { hash: 'sha256:abc', content: {} };
    vi.mocked(api.getCommitV3).mockResolvedValue(commit as never);

    const { result, unmount } = renderHook(() => useCommitV3('sha256:abc'));
    await waitForHook();

    expect(api.getCommitV3).toHaveBeenCalledWith('sha256:abc');
    expect(result.current.data).toEqual(commit);
    unmount();
  });

  it('returns null when hash is undefined', async () => {
    const { result, unmount } = renderHook(() => useCommitV3(undefined));
    await waitForHook();

    expect(api.getCommitV3).not.toHaveBeenCalled();
    expect(result.current.data).toBeNull();
    unmount();
  });
});

// ---------------------------------------------------------------------------
// useDraft
// ---------------------------------------------------------------------------

describe('useDraft', () => {
  it('fetches draft by id', async () => {
    const draft = { draft_id: 'draft_1', content: {} };
    vi.mocked(api.getDraft).mockResolvedValue(draft as never);

    const { result, unmount } = renderHook(() => useDraft('draft_1'));
    await waitForHook();

    expect(api.getDraft).toHaveBeenCalledWith('draft_1');
    expect(result.current.data).toEqual(draft);
    unmount();
  });

  it('returns null when id is undefined', async () => {
    const { result, unmount } = renderHook(() => useDraft(undefined));
    await waitForHook();

    expect(api.getDraft).not.toHaveBeenCalled();
    expect(result.current.data).toBeNull();
    unmount();
  });
});

// ---------------------------------------------------------------------------
// useApiCall: error handling + refetch
// ---------------------------------------------------------------------------

describe('useApiCall error handling', () => {
  it('converts non-Error throws to Error instances', async () => {
    vi.mocked(api.listProjects).mockRejectedValue('string error');

    const { result, unmount } = renderHook(() => useProjects());
    await waitForHook();

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('string error');
    unmount();
  });
});

describe('useApiCall refetch', () => {
  it('re-fetches data when refetch is called', async () => {
    vi.mocked(api.checkHealth).mockResolvedValue({ status: 'ok', version: '1.0.0', uptime: 1 });

    const { result, unmount } = renderHook(() => useHealth());
    await waitForHook();

    expect(api.checkHealth).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual({ status: 'ok', version: '1.0.0', uptime: 1 });

    // Update mock return value and refetch
    vi.mocked(api.checkHealth).mockResolvedValue({ status: 'ok', version: '1.0.0', uptime: 999 });

    await act(async () => {
      result.current.refetch();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(api.checkHealth).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual({ status: 'ok', version: '1.0.0', uptime: 999 });
    unmount();
  });
});
