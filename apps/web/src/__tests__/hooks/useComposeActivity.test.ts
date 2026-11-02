// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { composeDraftChangeCards } from '@/domain/workspaces/composeDraftChanges';
import { useComposeActivity } from '@/hooks/workspaces/useComposeActivity';
import type { WorkspaceCandidate } from '@/types/workspaces';
import { deferred } from './deferred';

const { read, reconcile } = vi.hoisted(() => ({ read: vi.fn(), reconcile: vi.fn() }));
vi.mock('@/infrastructure/sharedApiClient', () => ({
  getSharedApiClient: () => ({ workspaces: { authoring: { read, reconcile } } }),
}));

it('does not let an old Workspace activity load replace the selected Workspace', async () => {
  read.mockReset();
  const old = deferred<unknown>();
  const next = {
    actions: [],
    netDiff: [],
    selected: null,
    nextBeforeSequence: null,
    workspaceRevision: 9,
  };
  read.mockReturnValueOnce(old.promise).mockResolvedValueOnce(next);
  const candidate = { id: 'same-id', projectId: 'a', revision: 1 } as WorkspaceCandidate;
  const { result, rerender, unmount } = renderHook(
    ({ workspace }) => useComposeActivity(workspace, true),
    {
      initialProps: { workspace: candidate },
    }
  );
  rerender({ workspace: { ...candidate, projectId: 'b' } });
  await waitFor(() => expect(result.current.view).toEqual(next));
  await act(async () => old.resolve({ ...next, workspaceRevision: 1 }));
  expect(result.current.view).toEqual(next);
  unmount();
});

it('only the latest activity refresh can finish loading or update the projection', async () => {
  read.mockReset();
  const old = deferred<unknown>();
  const latest = deferred<unknown>();
  read.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
  const candidate = { id: 'ws', projectId: 'p', revision: 1 } as WorkspaceCandidate;
  const { result, unmount } = renderHook(() => useComposeActivity(candidate, true));
  let pending!: ReturnType<typeof result.current.loadLatest>;
  act(() => {
    pending = result.current.loadLatest();
  });
  const view = {
    actions: [],
    netDiff: [],
    selected: null,
    nextBeforeSequence: null,
    workspaceRevision: 1,
  };
  await act(async () => old.resolve(view));
  expect(result.current.view).toBeNull();
  expect(result.current.loading).toBe(true);
  await act(async () => {
    latest.resolve({ ...view, workspaceRevision: 2 });
    await pending;
  });
  expect(result.current.view?.workspaceRevision).toBe(2);
  expect(result.current.loading).toBe(false);
  unmount();
});

it('invalidates node pagination when a different node is selected', async () => {
  read.mockReset();
  const view = { actions: [], selected: null, nextBeforeSequence: null, workspaceRevision: 1 };
  read.mockResolvedValueOnce(view);
  const { result, unmount } = renderHook(() =>
    useComposeActivity({ id: 'ws', projectId: 'p' } as WorkspaceCandidate, true)
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  const entries = Array.from({ length: 20 }, (_, sequence) => ({ sequence }));
  read.mockResolvedValueOnce({ ...view, node: { id: 'a', entries } });
  await act(async () => result.current.inspectNode('a'));
  const older = deferred<unknown>();
  read
    .mockReturnValueOnce(older.promise)
    .mockResolvedValueOnce({ ...view, node: { id: 'b', entries: [{ sequence: 40 }] } });
  let pending!: ReturnType<typeof result.current.loadOlderNode>;
  act(() => {
    pending = result.current.loadOlderNode('a');
  });
  await act(async () => result.current.inspectNode('b'));
  await act(async () => {
    older.resolve({ ...view, node: { id: 'a', entries: [{ sequence: -1 }] } });
    await pending;
  });
  expect(result.current.node).toEqual({ id: 'b', entries: [{ sequence: 40 }] });
  unmount();
});

it('clears node selection and ignores its late response when switching Workspace', async () => {
  read.mockReset();
  const view = { actions: [], selected: null, nextBeforeSequence: null, workspaceRevision: 1 };
  read.mockResolvedValue(view);
  const candidate = { id: 'a', projectId: 'p' } as WorkspaceCandidate;
  const { result, rerender, unmount } = renderHook(
    ({ workspace }) => useComposeActivity(workspace, true),
    {
      initialProps: { workspace: candidate },
    }
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  const node = deferred<unknown>();
  read.mockReturnValueOnce(node.promise);
  let pending!: ReturnType<typeof result.current.inspectNode>;
  act(() => {
    pending = result.current.inspectNode('node-a');
  });
  rerender({ workspace: { ...candidate, id: 'b' } });
  expect(result.current.nodeLoading).toBe(false);
  await act(async () => {
    node.resolve({ ...view, node: { entries: [] } });
    expect(await pending).toBeNull();
  });
  expect(result.current.node).toBeNull();
  unmount();
});

it('syncs using fresh preconditions and preserves the visible Draft if reconciliation conflicts', async () => {
  read.mockReset();
  reconcile.mockReset();
  const old = {
    actions: [],
    netDiff: [],
    selected: null,
    nextBeforeSequence: null,
    workspaceRevision: 2,
    compositionRevision: 0,
    synchronization: { required: true, currentRefHead: 'head-b' },
  };
  read.mockResolvedValue(old);
  const candidate = { id: 'ws', projectId: 'p', revision: 1 } as WorkspaceCandidate;
  const { result, unmount } = renderHook(() => useComposeActivity(candidate, true));
  await waitFor(() => expect(result.current.view).toEqual(old));
  reconcile.mockRejectedValueOnce(new Error('Overlapping changes'));
  await act(async () => {
    expect(await result.current.reconcile()).toBe(false);
  });
  expect(result.current.view).toEqual(old);
  expect(result.current.reconciliationError).toBe('Overlapping changes');
  const next = {
    ...old,
    workspaceRevision: 3,
    synchronization: { required: false, currentRefHead: 'head-b' },
  };
  reconcile.mockImplementationOnce(async () => {
    read.mockResolvedValue(next);
  });
  await act(async () => {
    expect(await result.current.reconcile()).toBe(true);
  });
  expect(reconcile).toHaveBeenLastCalledWith(
    'p',
    'ws',
    expect.objectContaining({ expected_workspace_revision: 2, expected_ref_head: 'head-b' })
  );
  expect(result.current.view).toEqual(next);
  unmount();
});

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

it('detects branch-head changes even when the composition revision stays at zero', async () => {
  read.mockReset();
  const interval = vi.spyOn(window, 'setInterval');
  const first = {
    actions: [],
    netDiff: [],
    selected: null,
    nextBeforeSequence: null,
    workspaceRevision: 1,
    compositionRevision: 0,
    synchronization: { currentRefHead: 'a', required: false },
  };
  read.mockResolvedValue(first);
  const candidate = { id: 'ws', projectId: 'p', revision: 1 } as WorkspaceCandidate;
  const { result, unmount } = renderHook(() => useComposeActivity(candidate, true));
  try {
    await waitFor(() => expect(result.current.view).toEqual(first));
    const poll = interval.mock.calls.find(([, delay]) => delay === 5000)?.[0] as () => void;
    const next = { ...first, synchronization: { currentRefHead: 'b', required: true } };
    read.mockResolvedValue(next);
    await act(async () => {
      poll?.();
    });
    expect(result.current.newActivity).toEqual(next);
    expect(result.current.view).toEqual(first);
  } finally {
    unmount();
    interval.mockRestore();
  }
});

it('keeps the selected field path when a historical action expands into several fields', async () => {
  read.mockReset();
  const action = {
    actionId: 'a1',
    sequence: 1,
    beforeRevision: 0,
    afterRevision: 1,
    channel: 'import',
    actor: { id: 'human:local-user', kind: 'human' },
    publishedAt: '2026-10-09T11:00:00Z',
    operations: [],
    reason: 'Imported draft',
  };
  const card = {
    nodeId: 'content-node',
    path: 'content',
    after: {
      trees: [
        {
          key: 'prd',
          slots: { title: 'Release' },
          children: [{ key: 'requirement', slots: { title: 'Approval' }, children: [] }],
        },
      ],
      relations: [],
    },
  };
  read.mockResolvedValue({
    actions: [action],
    netDiff: [card],
    selected: { action, cards: [card] },
    nextBeforeSequence: null,
    workspaceRevision: 1,
    compositionRevision: 1,
    node: null,
  });
  const candidate = { id: 'ws-a', projectId: 'p', revision: 1 } as WorkspaceCandidate;
  const { result, unmount } = renderHook(() => useComposeActivity(candidate, true));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => {
    const selected = await result.current.selectActionNode(
      'a1',
      'content-node',
      'content/trees/[key=prd]/slots/title'
    );
    expect(selected?.operation).toMatchObject({
      id: 'content-node',
      path: 'content/trees/[key=prd]/slots/title',
      afterValue: 'Release',
    });
  });
  unmount();
});

it('projects scalar history and the net draft onto their snapshot object while preserving API identities', async () => {
  read.mockReset();
  const path = 'tasks/[key=plane]';
  const task = { key: 'plane', slots: { goal: '开飞机', done: false }, children: [] };
  const after = { ...task, slots: { ...task.slots, done: true } };
  const action = {
    actionId: 'a1',
    sequence: 1,
    beforeRevision: 0,
    afterRevision: 1,
    channel: 'manual',
    actor: { id: 'human:local-user', kind: 'human' },
    publishedAt: '2026-10-12T08:00:00Z',
    operations: [],
    reason: 'Complete task',
  };
  const field = {
    nodeId: 'actual-done-id',
    path: `${path}/slots/done`,
    before: false,
    after: true,
  };
  read.mockResolvedValue({
    actions: [action],
    netDiff: [field],
    selected: { action, cards: [field], before: { tasks: [task] }, after: { tasks: [after] } },
    base: { tasks: [task] },
    current: { tasks: [after] },
    nextBeforeSequence: null,
    workspaceRevision: 1,
    compositionRevision: 1,
    node: null,
  });
  const { result, unmount } = renderHook(() =>
    useComposeActivity({ id: 'ws', projectId: 'p', revision: 1 } as WorkspaceCandidate, true)
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.cards.a1).toHaveLength(1);
  expect(result.current.cards.a1[0]).toMatchObject({
    nodeId: 'actual-done-id',
    path,
    before: task,
    after,
  });
  expect(
    composeDraftChangeCards(
      result.current.view!.netDiff,
      result.current.view?.base,
      result.current.view?.current
    )[0].path
  ).toBe(path);
  expect(result.current.view?.netDiff[0]).toEqual(field);
  await act(async () => {
    const selected = await result.current.selectActionNode('a1', 'actual-done-id', path);
    expect(selected?.operation).toMatchObject({
      id: 'actual-done-id',
      path,
      beforeValue: task,
      afterValue: after,
    });
  });
  expect(read).toHaveBeenLastCalledWith('p', 'ws', { action_id: 'a1', node_id: 'actual-done-id' });
  unmount();
});
