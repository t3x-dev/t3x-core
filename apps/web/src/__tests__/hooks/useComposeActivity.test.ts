// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useComposeActivity } from '@/hooks/workspaces/useComposeActivity';
import type { WorkspaceCandidate } from '@/types/workspaces';

const { read } = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@/infrastructure/sharedApiClient', () => ({
  getSharedApiClient: () => ({ workspaces: { authoring: { read } } }),
}));

it('retains the visible projection during revision refreshes and resets on workspace switches', async () => {
  const first = {
    actions: [],
    netDiff: [],
    selected: null,
    nextBeforeSequence: null,
    workspaceRevision: 1,
  };
  read.mockResolvedValueOnce(first);
  const candidate = { id: 'ws-a', projectId: 'p', revision: 1 } as WorkspaceCandidate;
  const { result, rerender, unmount } = renderHook(
    ({ workspace }) => useComposeActivity(workspace, true),
    { initialProps: { workspace: candidate } }
  );
  await waitFor(() => expect(result.current.view?.workspaceRevision).toBe(1));
  const visible = result.current.view;
  let resolveRefresh!: (value: typeof first) => void;
  read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveRefresh = resolve;
      })
  );
  rerender({ workspace: { ...candidate, revision: 2 } });
  expect(result.current.view).toBe(visible);
  expect(result.current.loading).toBe(true);
  await act(async () => {
    resolveRefresh({ ...first, workspaceRevision: 2 });
  });
  expect(result.current.view?.workspaceRevision).toBe(2);
  read.mockImplementationOnce(() => new Promise(() => {}));
  rerender({ workspace: { ...candidate, id: 'ws-b' } });
  expect(result.current.view).toBeNull();
  unmount();
});
