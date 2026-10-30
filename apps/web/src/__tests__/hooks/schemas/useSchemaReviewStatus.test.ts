// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSchemaReviewStatus } from '@/hooks/schemas/useSchemaReviewStatus';

const read = vi.hoisted(() => vi.fn());
vi.mock('@/infrastructure/sharedApiClient', () => ({
  getSharedApiClient: () => ({ workspaces: { getLatestReviewSnapshot: read } }),
}));
beforeEach(() => read.mockReset());

it('distinguishes no Review from unavailable Review status', async () => {
  read.mockRejectedValueOnce(Object.assign(new Error('No Review'), { code: 'NOT_FOUND' }));
  const { result } = renderHook(() => useSchemaReviewStatus('p', 'w', 2));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.latest).toBeNull();
  expect(result.current.error).toBeUndefined();
  read.mockRejectedValueOnce(new Error('Offline'));
  await act(async () => {
    await result.current.refresh();
  });
  expect(result.current.error).toBe('Offline');
});

it('reloads a rejected Review on focus even when the Draft revision did not change', async () => {
  read.mockResolvedValue({ snapshot_id: 'ready' });
  const { result } = renderHook(() => useSchemaReviewStatus('p', 'w', 2));
  await waitFor(() => expect(result.current.latest?.snapshot_id).toBe('ready'));
  read.mockResolvedValue({ snapshot_id: 'rejected' });
  act(() => window.dispatchEvent(new Event('focus')));
  await waitFor(() => expect(result.current.latest?.snapshot_id).toBe('rejected'));
});

it('ignores an old Workspace response after navigation', async () => {
  let finish!: (value: unknown) => void;
  read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const { result, rerender } = renderHook(
    ({ workspace }) => useSchemaReviewStatus('p', workspace, 2),
    { initialProps: { workspace: 'old' } }
  );
  read.mockResolvedValue({ snapshot_id: 'new' });
  rerender({ workspace: 'new' });
  await waitFor(() => expect(result.current.latest?.snapshot_id).toBe('new'));
  await act(async () => finish({ snapshot_id: 'old' }));
  expect(result.current.latest?.snapshot_id).toBe('new');
});
