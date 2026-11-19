// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useStudioCandidates } from '@/hooks/schemas/useStudioCandidates';

const mocks = vi.hoisted(() => ({ list: vi.fn(), add: vi.fn(), remove: vi.fn() }));
vi.mock('@/infrastructure/schemaStudio', () => ({
  listStudioCandidates: mocks.list,
  addStudioCandidate: mocks.add,
  removeStudioCandidate: mocks.remove,
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockImplementation(async (projectId: string) => [{ id: projectId, projectId }]);
});
it('does not return a stale addition for navigation after the destination changes', async () => {
  let resolve!: (value: { id: string }) => void;
  mocks.add.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      })
  );
  const { result, rerender } = renderHook(({ id }) => useStudioCandidates(id), {
    initialProps: { id: 'first' },
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
  let addition!: ReturnType<typeof result.current.add>;
  act(() => {
    addition = result.current.add({ canonicalName: 't3x/core', version: '1' });
  });
  rerender({ id: 'second' });
  await waitFor(() => expect(result.current.items[0]?.id).toBe('second'));
  await act(async () => {
    resolve({ id: 'old' });
    expect(await addition).toBeUndefined();
  });
  expect(result.current.items[0]?.id).toBe('second');
});
it('refreshes persisted candidates after a successful add, and exposes access failures', async () => {
  mocks.add.mockResolvedValue({ id: 'new' });
  const { result } = renderHook(() => useStudioCandidates('target'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => {
    await result.current.add({ canonicalName: 't3x/core', version: '1' });
  });
  expect(mocks.list).toHaveBeenCalledTimes(2);
  mocks.remove.mockRejectedValue(new Error('Access denied'));
  await act(async () => {
    await expect(result.current.remove('new')).rejects.toThrow('Access denied');
  });
  expect(result.current.pending).toBe(false);
});

it('shares reads while loading and ignores notifications about saved edits', async () => {
  let finish!: () => void;
  mocks.list.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = () => resolve([]);
      })
  );
  const { result } = renderHook(() => useStudioCandidates('target'));
  act(() => {
    window.dispatchEvent(new Event('focus'));
    void result.current.refresh();
  });
  expect(mocks.list).toHaveBeenCalledExactlyOnceWith('target');

  await act(async () => finish());
  expect(result.current.loading).toBe(false);
  act(() => {
    window.dispatchEvent(
      new CustomEvent('t3x-schema-candidate-updated', { detail: { projectId: 'target' } })
    );
  });
  expect(mocks.list).toHaveBeenCalledTimes(1);
});

it('reads again after an acknowledged addition and ignores an earlier response', async () => {
  let finish!: (items: Array<{ id: string }>) => void;
  mocks.list
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    )
    .mockResolvedValueOnce([{ id: 'new' }]);
  mocks.add.mockResolvedValue({ id: 'new' });
  const { result } = renderHook(() => useStudioCandidates('target'));

  await act(async () => {
    await result.current.add({ canonicalName: 't3x/core', version: '1' });
    finish([{ id: 'old' }]);
  });

  expect(mocks.list).toHaveBeenCalledTimes(2);
  expect(result.current.items[0]?.id).toBe('new');
});
