// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSchemaCatalog, useSchemaIntroduction } from '@/hooks/schemas/useSchemaCatalog';

const mocks = vi.hoisted(() => ({ catalog: vi.fn(), introduction: vi.fn() }));
vi.mock('@/infrastructure/schemaCatalog', () => ({
  fetchSchemaCatalog: mocks.catalog,
  fetchSchemaIntroduction: mocks.introduction,
  fetchSchemaCollections: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/infrastructure/stateAuthoring', () => ({ fetchAuthoringTarget: vi.fn() }));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const page = (id: string, cursor: string | null = null) => ({
  items: [{ release: { artifactVersionId: id } }],
  next_cursor: cursor,
  has_more: !!cursor,
});
beforeEach(() => vi.clearAllMocks());
describe('catalog request isolation', () => {
  it('discards results from an earlier project and earlier pagination', async () => {
    const old = deferred<ReturnType<typeof page>>();
    mocks.catalog
      .mockResolvedValueOnce(page('a', 'next'))
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(page('b'));
    const { result, rerender } = renderHook(
      ({ project }) => useSchemaCatalog(project, 'limit=24'),
      { initialProps: { project: 'a' } }
    );
    await waitFor(() => expect(result.current.data?.items[0]?.release.artifactVersionId).toBe('a'));
    act(() => {
      void result.current.loadMore();
    });
    rerender({ project: 'b' });
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data?.items[0]?.release.artifactVersionId).toBe('b'));
    await act(async () => {
      old.resolve(page('private-a'));
    });
    expect(result.current.data?.items.map((item) => item.release.artifactVersionId)).toEqual(['b']);
  });
  it('deduplicates pagination and retries a failed initial request', async () => {
    mocks.catalog
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(page('a', 'next'))
      .mockResolvedValueOnce({ ...page('a'), items: [...page('a').items, ...page('b').items] });
    const { result } = renderHook(() => useSchemaCatalog('p', 'q=release'));
    await waitFor(() => expect(result.current.error).toBe('offline'));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.data?.has_more).toBe(true));
    await act(async () => {
      await Promise.all([result.current.loadMore(), result.current.loadMore()]);
    });
    expect(mocks.catalog).toHaveBeenCalledTimes(3);
    expect(mocks.catalog).toHaveBeenLastCalledWith('p', 'q=release&cursor=next');
    expect(result.current.data?.items).toHaveLength(2);
  });
  it('never shows a previous release introduction while a new pin is loading', async () => {
    const old = deferred<null>();
    mocks.introduction.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ digest: 'new' });
    const pin = { projectId: 'a', commitDigest: 'commit-a', presentationDigest: 'intro-a' };
    const { result, rerender } = renderHook(({ reference }) => useSchemaIntroduction(reference), {
      initialProps: { reference: pin },
    });
    rerender({ reference: { ...pin, projectId: 'b' } });
    await waitFor(() => expect(result.current.data?.digest).toBe('new'));
    await act(async () => {
      old.resolve(null);
    });
    expect(result.current.data?.digest).toBe('new');
  });
});
