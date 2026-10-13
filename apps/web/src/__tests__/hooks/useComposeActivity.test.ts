// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { composeDraftChangeCards } from '@/domain/workspaces/composeDraftChanges';
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
