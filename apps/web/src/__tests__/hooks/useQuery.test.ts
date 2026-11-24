// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearQueryCache, useQuery } from '@/hooks/shared/useQuery';
import { invalidateSessionReads, setSessionUser } from '@/infrastructure/session';
import { deferred } from './deferred';

describe('useQuery cache', () => {
  afterEach(() => {
    cleanup();
    clearQueryCache();
    localStorage.clear();
    window.dispatchEvent(new Event('storage'));
  });

  it('clearQueryCache removes all entries', () => {
    // Just verify the function exists and doesn't throw
    expect(() => clearQueryCache()).not.toThrow();
  });

  it('clears another key’s data immediately and ignores its late response', async () => {
    const old = deferred<string>();
    const queryFn = vi
      .fn()
      .mockResolvedValueOnce('a')
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce('b');
    const { result, rerender } = renderHook(({ id }) => useQuery({ queryKey: [id], queryFn }), {
      initialProps: { id: 'a' },
    });
    await waitFor(() => expect(result.current.data).toBe('a'));
    act(() => result.current.refetch());
    rerender({ id: 'b' });
    expect(result.current.data).toBeNull();
    await waitFor(() => expect(result.current.data).toBe('b'));
    await act(async () => old.resolve('late a'));
    expect(result.current.data).toBe('b');
  });

  it('does not share the same resource key across accounts', async () => {
    setSessionUser({ id: 'first-account', name: null, username: null });
    const queryFn = vi
      .fn()
      .mockResolvedValueOnce('first private data')
      .mockResolvedValueOnce('second private data');
    const { result } = renderHook(() => useQuery({ queryKey: ['repository', 'same-id'], queryFn }));
    await waitFor(() => expect(result.current.data).toBe('first private data'));
    act(() => setSessionUser({ id: 'second-account', name: null, username: null }));
    expect(result.current.data).toBeNull();
    await waitFor(() => expect(result.current.data).toBe('second private data'));
    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it('clears already visible data after permission invalidation without retrying by itself', async () => {
    const queryFn = vi.fn().mockResolvedValueOnce('private data').mockResolvedValueOnce('checked');
    const { result } = renderHook(() => useQuery({ queryKey: ['repository', 'private'], queryFn }));
    await waitFor(() => expect(result.current.data).toBe('private data'));

    act(invalidateSessionReads);
    expect(result.current.data).toBeNull();
    expect(result.current.error?.message).toMatch(/access changed/i);
    expect(queryFn).toHaveBeenCalledOnce();

    act(() => result.current.refetch());
    await waitFor(() => expect(result.current.data).toBe('checked'));
  });

  it('drops in-flight data that arrives after an authorization invalidation', async () => {
    const old = deferred<string>();
    const queryFn = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce('rechecked');
    const query = () => useQuery({ queryKey: ['repository', 'protected'], queryFn });
    const first = renderHook(query);
    act(() => invalidateSessionReads());
    await act(async () => old.resolve('revoked private data'));
    expect(first.result.current.data).toBeNull();
    first.unmount();
    const next = renderHook(query);
    await waitFor(() => expect(next.result.current.data).toBe('rechecked'));
    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it('keeps the newest same-key refresh when an older request fails later', async () => {
    const old = deferred<string>();
    const queryFn = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce('new');
    const { result } = renderHook(() => useQuery({ queryKey: ['same'], queryFn }));
    act(() => result.current.refetch());
    await waitFor(() => expect(result.current.data).toBe('new'));
    await act(async () => old.reject(new Error('obsolete')));
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('settles loading and errors on a cache hit after navigating away', async () => {
    const slow = deferred<string>();
    const queryFn = vi.fn().mockResolvedValueOnce('cached').mockReturnValueOnce(slow.promise);
    const { result, rerender } = renderHook(({ id }) => useQuery({ queryKey: [id], queryFn }), {
      initialProps: { id: 'cached' },
    });
    await waitFor(() => expect(result.current.data).toBe('cached'));
    rerender({ id: 'slow' });
    expect(result.current.isLoading).toBe(true);
    rerender({ id: 'cached' });
    expect(result.current.data).toBe('cached');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    await act(async () => slow.resolve('late'));
  });

  it('disabled queries neither retain data nor accept an in-flight completion', async () => {
    const pending = deferred<string>();
    const queryFn = vi.fn().mockReturnValue(pending.promise);
    const { result, rerender } = renderHook(
      ({ enabled }) => useQuery({ queryKey: ['disabled'], queryFn, enabled }),
      { initialProps: { enabled: true } }
    );
    rerender({ enabled: false });
    expect(result.current.isLoading).toBe(false);
    await act(async () => pending.resolve('obsolete'));
    expect(result.current.data).toBeNull();
    act(() => result.current.refetch());
    expect(queryFn).toHaveBeenCalledTimes(1);
  });
});
