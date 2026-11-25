// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  createStudioPreviewCache,
  invalidateStudioPreviews,
  StudioPreviewCacheContext,
} from '@/hooks/schemas/studioPreviewCache';
import { prefetchBoundStudioPreview, useStudioPreview } from '@/hooks/schemas/useStudioPreview';
import { ApiError } from '@/infrastructure/core';
import { previewStudioSelection } from '@/infrastructure/schemaStudio';

vi.mock('@/infrastructure/schemaStudio', () => ({ previewStudioSelection: vi.fn() }));
describe('Studio preview ownership', () => {
  it('loads a bound Workspace definition without any picker sources', async () => {
    vi.mocked(previewStudioSelection).mockResolvedValueOnce({
      schemaHash: 'snapshot',
      workspace: { id: 'w', revision: 4 },
    } as never);
    const { result } = renderHook(() =>
      useStudioPreview('p', { candidateIds: [], workspaceId: 'w' }, 4)
    );
    await waitFor(() => expect(result.current.data?.schemaHash).toBe('snapshot'));
    expect(previewStudioSelection).toHaveBeenLastCalledWith('p', {
      candidateIds: [],
      workspaceId: 'w',
    });
  });
  it('discards an old selection response and invalidates a review on Workspace revision change', async () => {
    let finishOld: (value: unknown) => void = () => {};
    vi.mocked(previewStudioSelection)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOld = resolve;
          })
      )
      .mockResolvedValueOnce({
        reviewHash: 'new-review',
        workspace: { id: 'w', revision: 2 },
      } as never)
      .mockResolvedValueOnce({
        reviewHash: 'revision-3',
        workspace: { id: 'w', revision: 3 },
      } as never);
    const { result, rerender } = renderHook(
      ({ ids, revision }) =>
        useStudioPreview('p', { candidateIds: ids, workspaceId: 'w' }, revision),
      { initialProps: { ids: ['old'], revision: 1 } }
    );
    rerender({ ids: ['new'], revision: 2 });
    await waitFor(() => expect(result.current.data?.reviewHash).toBe('new-review'));
    await act(async () => finishOld({ reviewHash: 'old-review' }));
    expect(result.current.data?.reviewHash).toBe('new-review');
    rerender({ ids: ['new'], revision: 3 });
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data?.reviewHash).toBe('revision-3'));
  });
  it('reports failed resolution without preserving a successful review', async () => {
    vi.mocked(previewStudioSelection)
      .mockResolvedValueOnce({ reviewHash: 'ok' } as never)
      .mockRejectedValueOnce(new Error('Source no longer authorized'));
    const { result, rerender } = renderHook(
      ({ projectId }) => useStudioPreview(projectId, { candidateIds: ['one'] }),
      { initialProps: { projectId: 'p1' } }
    );
    await waitFor(() => expect(result.current.data).toBeDefined());
    rerender({ projectId: 'p2' });
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.error).toBe('Source no longer authorized'));
  });
  it('rechecks source authority on focus and invalidates the old review', async () => {
    vi.mocked(previewStudioSelection)
      .mockResolvedValueOnce({ reviewHash: 'old' } as never)
      .mockRejectedValueOnce(new Error('Source no longer authorized'));
    const { result } = renderHook(() => useStudioPreview('p', { candidateIds: ['one'] }, 2));
    await waitFor(() => expect(result.current.data?.reviewHash).toBe('old'));
    act(() => window.dispatchEvent(new Event('focus')));
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.error).toBe('Source no longer authorized'));
    expect(result.current.data).toBeUndefined();
  });
});

it('shares an exact bound definition request and reuses the resolved revision on return', async () => {
  const cache = createStudioPreviewCache();
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(StudioPreviewCacheContext.Provider, { value: cache }, children);
  const read = vi.mocked(previewStudioSelection);
  read.mockReset().mockResolvedValue({
    schemaHash: 'r8',
    workspace: { id: 'docs', revision: 8, boundSchema: { nodes: {} } },
  } as never);
  const input = { candidateIds: [], workspaceId: 'docs' };
  const left = renderHook(() => useStudioPreview('project', input, 8), { wrapper });
  const right = renderHook(() => useStudioPreview('project', input, 8), { wrapper });
  await waitFor(() => expect(left.result.current.data?.schemaHash).toBe('r8'));
  expect(right.result.current.data?.schemaHash).toBe('r8');
  left.unmount();
  right.unmount();
  const next = renderHook(() => useStudioPreview('project', input, 8), { wrapper });
  expect(next.result.current.data?.schemaHash).toBe('r8');
  expect(read).toHaveBeenCalledExactlyOnceWith('project', input);
});

it('rejects a definition returned for a different Workspace revision', async () => {
  vi.mocked(previewStudioSelection)
    .mockReset()
    .mockResolvedValue({
      schemaHash: 'r7',
      workspace: { id: 'docs', revision: 7, boundSchema: { nodes: {} } },
    } as never);
  const { result } = renderHook(() =>
    useStudioPreview('project', { candidateIds: [], workspaceId: 'docs' }, 8)
  );
  await waitFor(() => expect(result.current.error).toMatch(/Workspace changed/));
  expect(result.current.data).toBeUndefined();
});

it('shares an early read and retains the verified definition while checking focus authority', async () => {
  const cache = createStudioPreviewCache();
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(StudioPreviewCacheContext.Provider, { value: cache }, children);
  const input = { candidateIds: [], workspaceId: 'docs' };
  const definition = {
    schemaHash: 'r8',
    reviewHash: 'review8',
    workspace: { id: 'docs', revision: 8, boundSchema: { nodes: {} } },
  } as never;
  const read = vi.mocked(previewStudioSelection).mockReset().mockResolvedValueOnce(definition);
  prefetchBoundStudioPreview(cache, null, 'p', 'docs', 8, 'main');
  const { result } = renderHook(() => useStudioPreview('p', input, 8, 'main'), { wrapper });
  await waitFor(() => expect(result.current.data).toBe(definition));
  expect(read).toHaveBeenCalledOnce();

  let deny!: (error: Error) => void;
  read.mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        deny = reject;
      })
  );
  act(() => window.dispatchEvent(new Event('focus')));
  expect(result.current.data).toBe(definition);
  expect(result.current.loading).toBe(false);
  expect(read).toHaveBeenCalledTimes(2);
  await act(async () => deny(new ApiError('FORBIDDEN', 'Access revoked')));
  expect(result.current.data).toBeUndefined();
  expect(result.current.error).toBe('Access revoked');
  expect(cache.snapshots.size).toBe(0);
});

it('keeps saved drafts distinct and replaces them on revision change', async () => {
  const cache = createStudioPreviewCache();
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(StudioPreviewCacheContext.Provider, { value: cache }, children);
  const bound = {
    schemaHash: 'published',
    workspace: { id: 'docs', revision: 8, boundSchema: { nodes: {} } },
  } as never;
  const draft = {
    schemaHash: 'saved-draft',
    workspace: { id: 'docs', revision: 8 },
    freshness: { candidateId: 'candidate', candidateRevision: 2 },
  } as never;
  const read = vi
    .mocked(previewStudioSelection)
    .mockReset()
    .mockResolvedValueOnce(bound)
    .mockResolvedValueOnce(draft);
  const input = { candidateIds: [], workspaceId: 'docs' };
  const left = renderHook(() => useStudioPreview('p', input, 8, 'main'), { wrapper });
  const right = renderHook(
    () =>
      useStudioPreview(
        'p',
        {
          ...input,
          schemaEditCandidate: { candidateId: 'candidate', revision: 2 },
        },
        8,
        'main'
      ),
    { wrapper }
  );
  await waitFor(() => expect(right.result.current.data).toBe(draft));
  expect(left.result.current.data).toBe(bound);
  expect(cache.snapshots.size).toBe(2);
  right.unmount();

  const returning = renderHook(
    ({ revision, branch }) =>
      useStudioPreview(
        'p',
        {
          ...input,
          schemaEditCandidate: { candidateId: 'candidate', revision: 2 },
        },
        revision,
        branch
      ),
    { wrapper, initialProps: { revision: 8, branch: 'main' } }
  );
  expect(returning.result.current.data).toBe(draft);
  expect(read).toHaveBeenCalledTimes(2);

  read.mockResolvedValueOnce(draft);
  returning.rerender({ revision: 8, branch: 'feature' });
  expect(returning.result.current.data).toBeUndefined();
  await waitFor(() => expect(returning.result.current.data).toBe(draft));
  expect(read).toHaveBeenCalledTimes(3);

  read.mockResolvedValueOnce(draft);
  returning.rerender({ revision: 9, branch: 'feature' });
  expect(returning.result.current.data).toBeUndefined();
  await waitFor(() => expect(returning.result.current.error).toMatch(/Workspace changed/));
});

it('does not repopulate a cached Workspace from a read invalidated by a draft write', async () => {
  const cache = createStudioPreviewCache();
  let finish!: (data: never) => void;
  const read = vi
    .mocked(previewStudioSelection)
    .mockReset()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
  prefetchBoundStudioPreview(cache, null, 'p', 'docs', 8, 'main');
  invalidateStudioPreviews(cache, 'docs');
  await act(async () =>
    finish({
      schemaHash: 'old',
      workspace: { id: 'docs', revision: 8, boundSchema: { nodes: {} } },
    } as never)
  );
  expect(read).toHaveBeenCalledOnce();
  expect(cache.snapshots.size).toBe(0);
});
