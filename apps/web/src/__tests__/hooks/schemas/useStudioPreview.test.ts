// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useStudioPreview } from '@/hooks/schemas/useStudioPreview';
import { previewStudioSelection } from '@/infrastructure/schemaStudio';

vi.mock('@/infrastructure/schemaStudio', () => ({ previewStudioSelection: vi.fn() }));
describe('Studio preview ownership', () => {
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
});
