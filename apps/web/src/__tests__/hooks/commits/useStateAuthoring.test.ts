// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useStateAuthoring } from '@/hooks/commits/useStateAuthoring';

const mocks = vi.hoisted(() => ({ target: vi.fn(), publish: vi.fn() }));
vi.mock('@/infrastructure/stateAuthoring', () => ({
  fetchAuthoringTarget: mocks.target,
  publishAuthorRevision: mocks.publish,
}));
beforeEach(() => vi.resetAllMocks());
it('fails closed for a viewer and historical revision', async () => {
  mocks.target
    .mockResolvedValueOnce({ head: 'a', canEdit: false })
    .mockResolvedValueOnce({ head: 'newer', canEdit: true });
  const h = renderHook(({ digest }) => useStateAuthoring('p', 'main', digest), {
    initialProps: { digest: 'a' },
  });
  await waitFor(() => expect(mocks.target).toHaveBeenCalledTimes(1));
  expect(h.result.current.canEdit).toBe(false);
  h.rerender({ digest: 'old' });
  await waitFor(() => expect(mocks.target).toHaveBeenCalledTimes(2));
  expect(h.result.current.canEdit).toBe(false);
  await act(async () => h.result.current.save({ description: 'blocked' }, vi.fn()));
  expect(mocks.publish).not.toHaveBeenCalled();
});
it('does not navigate when an old save resolves after the selected scope changes', async () => {
  let resolve: (value: { commitDigest: string }) => void = () => {};
  mocks.target
    .mockResolvedValueOnce({ head: 'a', canEdit: true })
    .mockResolvedValueOnce({ head: 'b', canEdit: true });
  mocks.publish.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      })
  );
  const saved = vi.fn();
  const h = renderHook(({ digest }) => useStateAuthoring('p', 'main', digest), {
    initialProps: { digest: 'a' },
  });
  await waitFor(() => expect(h.result.current.canEdit).toBe(true));
  let pending: Promise<void>;
  act(() => {
    pending = h.result.current.save({ description: 'draft' }, saved);
  });
  h.rerender({ digest: 'b' });
  await act(async () => {
    resolve({ commitDigest: 'old-save' });
    await pending;
  });
  expect(saved).not.toHaveBeenCalled();
});
it('deduplicates save clicks and reports stale-head errors without navigating', async () => {
  mocks.target.mockResolvedValue({ head: 'a', canEdit: true });
  mocks.publish.mockRejectedValue(new Error('Branch head changed'));
  const saved = vi.fn();
  const h = renderHook(() => useStateAuthoring('p', 'main', 'a'));
  await waitFor(() => expect(h.result.current.canEdit).toBe(true));
  await act(async () =>
    Promise.all([
      h.result.current.save({ description: 'draft' }, saved),
      h.result.current.save({ description: 'draft' }, saved),
    ])
  );
  expect(mocks.publish).toHaveBeenCalledTimes(1);
  expect(h.result.current.error).toBe('Branch head changed');
  expect(saved).not.toHaveBeenCalled();
});
