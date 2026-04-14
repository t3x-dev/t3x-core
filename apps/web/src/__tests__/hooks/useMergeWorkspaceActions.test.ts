// @vitest-environment jsdom
/**
 * Canary tests for useMergeWorkspaceActions (mergeWorkspaceStore migration).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupRoots, renderHook, waitForHook } from './renderHook';

vi.mock('@/queries/mergeApi', () => ({
  getMergeDraft: vi.fn(),
  getMergeDraftChecks: vi.fn(),
}));
vi.mock('@/commands/merge', () => ({
  createMergeDraft: vi.fn(),
  saveMergeDraft: vi.fn(),
  commitMergeDraft: vi.fn(),
  deleteMergeDraft: vi.fn(),
}));
vi.mock('@/queries/turnContext', () => ({
  fetchTurnContext: vi.fn(),
}));

import {
  commitMergeDraft,
  createMergeDraft,
  deleteMergeDraft,
  saveMergeDraft,
} from '@/commands/merge';
import { useMergeWorkspaceActions } from '@/hooks/merge/useMergeWorkspaceActions';
import { getMergeDraft, getMergeDraftChecks } from '@/queries/mergeApi';
import { fetchTurnContext } from '@/queries/turnContext';
import { useMergeWorkspaceStore } from '@/store/mergeWorkspaceStore';

const EMPTY_PREPARED = {
  autoKept: [],
  conflicts: [],
  onlyInSource: [],
  onlyInTarget: [],
  relationsOnlyInSource: [],
  relationsOnlyInTarget: [],
  relationsInBoth: [],
};

function draftResp(overrides: Record<string, unknown> = {}) {
  return {
    draftId: 'merge_1',
    projectId: 'proj_1',
    sourceHash: 'sha256:src',
    targetHash: 'sha256:tgt',
    sourceBranch: 'branch-1',
    targetBranch: 'main',
    prepared: EMPTY_PREPARED,
    status: 'pending' as const,
    message: '',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useMergeWorkspaceStore.getState().reset();
});

afterEach(() => {
  cleanupRoots();
});

describe('useMergeWorkspaceActions.load', () => {
  it('seeds draft state via setDraftLoaded on success', async () => {
    vi.mocked(getMergeDraft).mockResolvedValueOnce(draftResp() as never);

    const { result } = renderHook(() => useMergeWorkspaceActions());
    await result.current.load('merge_1');
    await waitForHook();

    const state = useMergeWorkspaceStore.getState();
    expect(state.draftId).toBe('merge_1');
    expect(state.sourceHash).toBe('sha256:src');
    expect(state.loading).toBe(false);
  });

  it('rethrows + records error on rejection', async () => {
    vi.mocked(getMergeDraft).mockRejectedValueOnce(new Error('404'));
    const { result } = renderHook(() => useMergeWorkspaceActions());
    await expect(result.current.load('merge_1')).rejects.toThrow('404');
    await waitForHook();
    expect(useMergeWorkspaceStore.getState().error).toBe('404');
  });
});

describe('useMergeWorkspaceActions.save', () => {
  it('no-ops when not dirty', async () => {
    useMergeWorkspaceStore.setState({ draftId: 'merge_1', isDirty: false });
    const { result } = renderHook(() => useMergeWorkspaceActions());
    await result.current.save();
    expect(saveMergeDraft).not.toHaveBeenCalled();
  });

  it('marks saved on success', async () => {
    useMergeWorkspaceStore.setState({
      draftId: 'merge_1',
      isDirty: true,
      message: 'msg',
      status: 'pending',
    });
    vi.mocked(saveMergeDraft).mockResolvedValueOnce(undefined as never);

    const { result } = renderHook(() => useMergeWorkspaceActions());
    await result.current.save();
    await waitForHook();

    const state = useMergeWorkspaceStore.getState();
    expect(state.saveStatus).toBe('saved');
    expect(state.isDirty).toBe(false);
  });
});

describe('useMergeWorkspaceActions.commit', () => {
  it('returns hash + marks committed on success', async () => {
    useMergeWorkspaceStore.setState({
      draftId: 'merge_1',
      message: 'msg',
      targetBranch: 'main',
    });
    vi.mocked(commitMergeDraft).mockResolvedValueOnce({ hash: 'sha256:m' } as never);

    const { result } = renderHook(() => useMergeWorkspaceActions());
    const out = await result.current.commit();
    await waitForHook();

    expect(out.hash).toBe('sha256:m');
    expect(useMergeWorkspaceStore.getState().status).toBe('committed');
  });
});

describe('useMergeWorkspaceActions.cancel', () => {
  it('deletes draft and resets state', async () => {
    useMergeWorkspaceStore.setState({ draftId: 'merge_1', message: 'msg' });
    vi.mocked(deleteMergeDraft).mockResolvedValueOnce(undefined as never);

    const { result } = renderHook(() => useMergeWorkspaceActions());
    await result.current.cancel();
    await waitForHook();

    expect(deleteMergeDraft).toHaveBeenCalledWith('merge_1');
    const state = useMergeWorkspaceStore.getState();
    expect(state.draftId).toBeNull();
    expect(state.message).toBe('');
  });
});

describe('useMergeWorkspaceActions.fetchSourceContext', () => {
  it('caches result + clears loading flag on success', async () => {
    vi.mocked(fetchTurnContext).mockResolvedValueOnce({ turn: { content: 'x' } } as never);
    const { result } = renderHook(() => useMergeWorkspaceActions());
    const data = await result.current.fetchSourceContext('turn_1', {
      id: 'n1',
      text: 't',
      source: { turn_hash: 'turn_1', start_char: 0, end_char: 1 },
    } as never);
    await waitForHook();

    expect(data).not.toBeNull();
    const state = useMergeWorkspaceStore.getState();
    expect(state.contextCache.turn_1).toBeDefined();
    expect(state.contextLoadingStates.turn_1).toBe(false);
  });
});

describe('useMergeWorkspaceActions.fetchServerChecks', () => {
  it('writes checks via setServerChecksSucceeded', async () => {
    useMergeWorkspaceStore.setState({ draftId: 'merge_1' });
    vi.mocked(getMergeDraftChecks).mockResolvedValueOnce([
      { id: 'x', label: 'X', passed: true },
    ] as never);

    const { result } = renderHook(() => useMergeWorkspaceActions());
    await result.current.fetchServerChecks();
    await waitForHook();

    expect(useMergeWorkspaceStore.getState().serverChecks).toHaveLength(1);
  });
});

describe('useMergeWorkspaceActions.create', () => {
  it('creates a draft and seeds state', async () => {
    vi.mocked(createMergeDraft).mockResolvedValueOnce(draftResp({ draftId: 'new_id' }) as never);

    const { result } = renderHook(() => useMergeWorkspaceActions());
    const id = await result.current.create('proj_1', 'sha256:src', 'sha256:tgt');
    await waitForHook();

    expect(id).toBe('new_id');
    expect(useMergeWorkspaceStore.getState().draftId).toBe('new_id');
  });
});
