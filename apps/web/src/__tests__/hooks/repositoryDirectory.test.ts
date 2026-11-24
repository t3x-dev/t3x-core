// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  prefetchRepositoryDirectoryPage,
  useRepositoryDirectoryIdlePrefetch,
} from '@/hooks/projects/repositoryDirectory';
import { useProjects } from '@/hooks/projects/useProjects';
import {
  loadRepositoryDirectoryPage,
  readCachedRepositoryDirectoryPage,
} from '@/infrastructure/projects';
import { invalidateSessionReads, setSessionUser } from '@/infrastructure/session';
import { deferred } from './deferred';

const account = (id: string) => setSessionUser({ id, name: null, username: null });
const firstPage = {
  items: [{ project_id: 'p1', name: 'Private repository' }],
  next_cursor: 'next',
  has_more: true,
};

afterEach(() => {
  localStorage.clear();
  window.dispatchEvent(new Event('storage'));
  vi.unstubAllGlobals();
});

it('shares the prefetched request and displays the cached first page on return', async () => {
  account('directory-reader');
  const response = deferred<Response>();
  const fetch = vi.fn().mockReturnValue(response.promise);
  vi.stubGlobal('fetch', fetch);
  prefetchRepositoryDirectoryPage();
  const renderDirectory = () =>
    useProjects(20, undefined, 'on-demand', { directoryUserId: 'directory-reader' });
  const first = renderHook(renderDirectory);
  await act(async () => response.resolve(Response.json({ success: true, data: firstPage })));
  await waitFor(() => expect(first.result.current.projects).toEqual(firstPage.items));
  first.unmount();
  const second = renderHook(renderDirectory);
  expect(second.result.current.projects).toEqual(firstPage.items);
  expect(second.result.current.hasMore).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('drops a previous account’s cached page and ignores its late request', async () => {
  account('previous-reader');
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ success: true, data: firstPage }));
  vi.stubGlobal('fetch', fetch);
  await loadRepositoryDirectoryPage('previous-reader');
  const late = deferred<Response>();
  fetch.mockReturnValueOnce(late.promise);
  const pending = loadRepositoryDirectoryPage('previous-reader', true);
  account('new-reader');
  expect(readCachedRepositoryDirectoryPage('new-reader')).toBeUndefined();
  expect(readCachedRepositoryDirectoryPage('previous-reader')).toBeUndefined();
  late.resolve(Response.json({ success: true, data: firstPage }));
  await expect(pending).rejects.toMatchObject({ code: 'ABORTED' });
  expect(readCachedRepositoryDirectoryPage('new-reader')).toBeUndefined();
});

it.each([20, 200])('shares the idle first page for %i accessible repositories', async (total) => {
  account('idle-reader');
  let runIdle: IdleRequestCallback | undefined;
  vi.stubGlobal('requestIdleCallback', (callback: IdleRequestCallback) => {
    runIdle = callback;
    return 1;
  });
  vi.stubGlobal('cancelIdleCallback', vi.fn());
  const items = Array.from({ length: 20 }, (_, index) => ({
    project_id: `repo-${index}`,
    namespace: index < 10 ? 'personal' : 'team',
  }));
  const page = { items, next_cursor: total > 20 ? 'next' : null, has_more: total > 20 };
  const fetch = vi.fn().mockResolvedValue(Response.json({ success: true, data: page }));
  vi.stubGlobal('fetch', fetch);
  const prefetch = renderHook(() => useRepositoryDirectoryIdlePrefetch(true));
  expect(fetch).not.toHaveBeenCalled();
  expect(runIdle).toBeDefined();
  await act(async () => runIdle?.({ didTimeout: false, timeRemaining: () => 50 }));
  await waitFor(() => expect(readCachedRepositoryDirectoryPage('idle-reader')).toEqual(page));
  const directory = renderHook(() =>
    useProjects(20, undefined, 'on-demand', { directoryUserId: 'idle-reader' })
  );
  expect(directory.result.current.projects).toEqual(items);
  expect(directory.result.current.hasMore).toBe(total > 20);
  expect(fetch).toHaveBeenCalledTimes(1);
  prefetch.unmount();
});

it('cancels an adopted first-page request when leaving the directory', async () => {
  account('leaving-reader');
  const response = deferred<Response>();
  const fetch = vi.fn((_url: string, _options: RequestInit) => response.promise);
  vi.stubGlobal('fetch', fetch);
  const directory = renderHook(() =>
    useProjects(20, undefined, 'on-demand', { directoryUserId: 'leaving-reader' })
  );
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  const signal = fetch.mock.calls[0]?.[1]?.signal;
  directory.unmount();
  expect(signal?.aborted).toBe(true);
  await act(async () => response.resolve(Response.json({ success: true, data: firstPage })));
  expect(readCachedRepositoryDirectoryPage('leaving-reader')).toBeUndefined();
});

it('hides the already visible repository list when same-account authorization changes', async () => {
  account('active-reader');
  const fetch = vi.fn().mockResolvedValue(Response.json({ success: true, data: firstPage }));
  vi.stubGlobal('fetch', fetch);
  const directory = renderHook(() =>
    useProjects(20, undefined, 'on-demand', { directoryUserId: 'active-reader' })
  );
  await waitFor(() => expect(directory.result.current.projects).toEqual(firstPage.items));
  act(invalidateSessionReads);
  expect(directory.result.current.projects).toEqual([]);
  expect(directory.result.current.hasMore).toBe(false);
  expect(directory.result.current.error).toMatch(/access changed/i);
  expect(fetch).toHaveBeenCalledOnce();
});
