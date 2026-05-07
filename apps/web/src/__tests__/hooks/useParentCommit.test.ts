// @vitest-environment jsdom

import type { TreeNode } from '@t3x-dev/core';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchParentCommit: vi.fn(),
}));

vi.mock('@/queries/parentCommit', () => ({
  fetchParentCommit: mocks.fetchParentCommit,
}));

import { useParentCommit } from '@/hooks/commits/useParentCommit';
import { useCommitStore } from '@/store/commitStore';
import { cleanupRoots, renderHook, waitForHook } from './renderHook';

function node(key: string): TreeNode {
  return { id: key, key, slots: {}, children: [] } as unknown as TreeNode;
}

function resetCommitStore() {
  useCommitStore.setState({
    confirmedNodeIds: {},
    confirmedSlotKeys: {},
    manualEditedNodeIds: new Set(),
    lastCommitHash: null,
    beforeCommitHash: null,
    committedNodeIds: {},
    committedNodeSnapshot: {},
    commitBranch: 'main',
    projectId: null,
    conversationTitle: null,
    isCommitting: false,
    commitError: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetCommitStore();
});

afterEach(() => {
  cleanupRoots();
});

describe('useParentCommit', () => {
  it('loads the parent commit for the active project baseline', async () => {
    mocks.fetchParentCommit.mockResolvedValueOnce({
      hash: 'sha256:parent',
      trees: [node('sports')],
      message: 'parent',
    });
    useCommitStore.getState().setProjectId('proj_1');
    useCommitStore.getState().setBeforeCommitHash('sha256:parent');

    const { result } = renderHook(() => useParentCommit());
    await waitForHook();

    expect(mocks.fetchParentCommit).toHaveBeenCalledWith('sha256:parent');
    expect(result.current?.hash).toBe('sha256:parent');
  });

  it('ignores a stale parent response after the project changes', async () => {
    let resolveParent: (value: unknown) => void = () => {};
    mocks.fetchParentCommit.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveParent = resolve;
      })
    );
    useCommitStore.getState().setProjectId('proj_old');
    useCommitStore.getState().setBeforeCommitHash('sha256:old_parent');

    const { result } = renderHook(() => useParentCommit());
    await waitForHook();

    act(() => {
      useCommitStore.getState().setProjectId('proj_new');
    });
    await waitForHook();
    await act(async () => {
      resolveParent({
        hash: 'sha256:old_parent',
        trees: [node('old')],
        message: 'old parent',
      });
      await Promise.resolve();
    });
    await waitForHook();

    expect(result.current).toBeNull();
  });
});
