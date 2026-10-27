// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { usePullRequestChangePreview } from '@/hooks/projects/usePullRequestChangePreview';

const read = vi.hoisted(() => vi.fn());
vi.mock('@/infrastructure/commits', () => ({ getApiCommit: read }));
const commit = (hash: string, title: string) => ({
  hash,
  project_id: 'project',
  content: { trees: [{ key: 'prd', slots: { title }, children: [] }], relations: [] },
});
beforeEach(() => read.mockReset());
it('compares pinned revisions and hides stale results when the branch selection changes', async () => {
  read.mockImplementation(async (hash: string) => commit(hash, hash));
  const view = renderHook(({ source }) => usePullRequestChangePreview('project', source, 'base'), {
    initialProps: { source: 'first' },
  });
  await waitFor(() => expect(view.result.current.changes?.[0]?.afterValue).toContain('first'));
  let resolve!: (value: unknown) => void;
  read.mockImplementation((hash: string) =>
    hash === 'second'
      ? new Promise((done) => {
          resolve = done;
        })
      : Promise.resolve(commit(hash, hash))
  );
  view.rerender({ source: 'second' });
  expect(view.result.current.loading).toBe(true);
  expect(view.result.current.changes).toBeUndefined();
  await act(async () => resolve(commit('second', 'Updated title')));
  await waitFor(() =>
    expect(view.result.current.changes?.[0]?.afterValue).toContain('Updated title')
  );
  expect(read).toHaveBeenCalledWith('second', 'project');
  expect(read).toHaveBeenCalledWith('base', 'project');
});
it('rejects revisions from another project instead of showing their fields', async () => {
  read.mockImplementation(async (hash: string) => ({ ...commit(hash, hash), project_id: 'other' }));
  const { result } = renderHook(() => usePullRequestChangePreview('project', 'source', 'base'));
  await waitFor(() => expect(result.current.error).toBeTruthy());
  expect(result.current.changes).toEqual([]);
});
