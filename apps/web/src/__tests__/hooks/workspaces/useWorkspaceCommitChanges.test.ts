// @vitest-environment jsdom

import type { WorkspaceCommitChanges } from '@t3x-dev/api-client';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useWorkspaceCommitChanges } from '@/hooks/workspaces/useWorkspaceCommitChanges';

const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@/infrastructure/commits', () => ({ getCommitChanges: mocks.read }));
const view = (commitDigest: string, projectId = 'p'): WorkspaceCommitChanges => ({
  projectId,
  commitDigest,
  committedAt: '',
  source: 'commit_diff',
  base: {},
  current: { x: 1 },
  actions: [],
  nextBeforeSequence: null,
  netDiff: [],
  schemaCards: [],
  schemaReview: null,
});
beforeEach(() => mocks.read.mockReset());
it('discards a late response from the previously selected Commit', async () => {
  let old!: (data: WorkspaceCommitChanges) => void;
  mocks.read
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          old = resolve;
        })
    )
    .mockResolvedValueOnce(view('second'));
  const { result, rerender } = renderHook(({ hash }) => useWorkspaceCommitChanges('p', hash), {
    initialProps: { hash: 'first' },
  });
  rerender({ hash: 'second' });
  await waitFor(() => expect(result.current.data?.commitDigest).toBe('second'));
  await act(async () => old(view('first')));
  expect(result.current.data?.commitDigest).toBe('second');
});
it('rejects a response belonging to another project or Commit', async () => {
  mocks.read.mockResolvedValue(view('first', 'foreign'));
  const { result } = renderHook(() => useWorkspaceCommitChanges('p', 'first'));
  await waitFor(() => expect(result.current.error).toMatch(/do not match/));
  expect(result.current.data).toBeUndefined();
});
it('paginates archived actions and resets the cursor for a different Commit', async () => {
  mocks.read
    .mockResolvedValueOnce({ ...view('first'), nextBeforeSequence: 10 })
    .mockResolvedValueOnce(view('first'))
    .mockResolvedValueOnce(view('second'));
  const { result, rerender } = renderHook(({ hash }) => useWorkspaceCommitChanges('p', hash), {
    initialProps: { hash: 'first' },
  });
  await waitFor(() => expect(result.current.data?.nextBeforeSequence).toBe(10));
  act(() => result.current.loadMore());
  await waitFor(() =>
    expect(mocks.read).toHaveBeenNthCalledWith(2, 'p', 'first', 10, expect.any(AbortSignal))
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  rerender({ hash: 'second' });
  await waitFor(() => expect(result.current.data?.commitDigest).toBe('second'));
  expect(mocks.read).toHaveBeenLastCalledWith('p', 'second', undefined, expect.any(AbortSignal));
});
