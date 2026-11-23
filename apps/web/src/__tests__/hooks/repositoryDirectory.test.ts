// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { prefetchRepositoryDirectoryPage } from '@/hooks/projects/repositoryDirectory';
import { useProjects } from '@/hooks/projects/useProjects';
import {
  loadRepositoryDirectoryPage,
  readCachedRepositoryDirectoryPage,
} from '@/infrastructure/projects';
import { setSessionUser } from '@/infrastructure/session';
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
