// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useRepositoryName } from '@/hooks/projects/useRepositoryName';

const check = vi.hoisted(() => vi.fn());
vi.mock('@/queries/projects', () => ({ checkRepositoryName: check }));
beforeEach(() => {
  vi.useFakeTimers();
  check.mockReset();
});
afterEach(() => vi.useRealTimers());

it('never displays or submits a stale result after rapid input or namespace changes', async () => {
  let finishOld!: (value: unknown) => void;
  check.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishOld = resolve;
      })
  );
  check.mockResolvedValueOnce({
    name: 'New',
    valid: true,
    available: false,
    code: 'NAME_OCCUPIED',
  });
  const { result, rerender } = renderHook(({ owner, name }) => useRepositoryName(owner, name), {
    initialProps: { owner: 'team-a', name: 'Old' },
  });
  await act(() => vi.advanceTimersByTimeAsync(201));
  rerender({ owner: 'team-b', name: 'New' });
  expect(result.current.canSubmit).toBe(false);
  await act(() => vi.advanceTimersByTimeAsync(201));
  expect(result.current.result?.name).toBe('New');
  await act(async () => finishOld({ name: 'Old', valid: true, available: true }));
  expect(result.current.result?.name).toBe('New');
  expect(result.current.canSubmit).toBe(false);
});

it('blocks submission during failures and allows an explicit retry', async () => {
  check.mockRejectedValueOnce(new Error('Network unavailable'));
  check.mockResolvedValueOnce({ name: 'Demo', valid: true, available: true });
  const { result } = renderHook(() => useRepositoryName('team', 'Demo'));
  await act(() => vi.advanceTimersByTimeAsync(201));
  expect(result.current.error).toBe('Network unavailable');
  expect(result.current.canSubmit).toBe(false);
  act(() => result.current.retry());
  await act(() => vi.advanceTimersByTimeAsync(201));
  expect(result.current.canSubmit).toBe(true);
});
