// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  StudioPreviewCacheContext,
  type StudioPreviewSnapshot,
} from '@/hooks/schemas/studioPreviewCache';
import { useStudioPreview } from '@/hooks/schemas/useStudioPreview';
import { previewStudioSelection } from '@/infrastructure/schemaStudio';

vi.mock('@/infrastructure/schemaStudio', () => ({ previewStudioSelection: vi.fn() }));
describe('Studio preview ownership', () => {
  it('loads a bound Workspace definition without any picker sources', async () => {
    vi.mocked(previewStudioSelection).mockResolvedValueOnce({ schemaHash: 'snapshot' } as never);
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
      .mockResolvedValueOnce({ reviewHash: 'new-review' } as never)
      .mockResolvedValueOnce({ reviewHash: 'revision-3' } as never);
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
  const cache = new Map<string, StudioPreviewSnapshot>();
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
