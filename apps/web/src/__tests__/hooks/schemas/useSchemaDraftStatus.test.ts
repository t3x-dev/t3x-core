// @vitest-environment jsdom

import type { WorkspaceAuthoringView } from '@t3x-dev/api-client';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSchemaDraftStatus } from '@/hooks/schemas/useSchemaDraftStatus';

const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@/infrastructure/sharedApiClient', () => ({
  getSharedApiClient: () => ({ workspaces: { authoring: { read: mocks.read } } }),
}));

beforeEach(() => mocks.read.mockReset());

function draft(workspaceRevision: number, hasChanges = true): WorkspaceAuthoringView {
  return {
    workspaceRevision,
    hasChanges,
    basis: { refName: 'main', refHead: 'sha256:base', baseDigest: 'sha256:content' },
  } as WorkspaceAuthoringView;
}

it('exposes a failed read and recovers through explicit retry without inventing clean status', async () => {
  mocks.read.mockRejectedValueOnce(new Error('Draft status unavailable'));
  const { result } = renderHook(() => useSchemaDraftStatus('project', 'workspace', 4));
  expect(result.current.loading).toBe(true);
  await waitFor(() => expect(result.current.error).toBe('Draft status unavailable'));
  expect(result.current.view).toBeUndefined();
  expect(result.current.loading).toBe(false);

  let finish!: (value: WorkspaceAuthoringView) => void;
  mocks.read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  let retry!: Promise<void>;
  act(() => {
    retry = result.current.refresh();
  });
  expect(result.current.loading).toBe(true);
  expect(result.current.error).toBeUndefined();
  expect(result.current.view).toBeUndefined();
  await act(async () => {
    finish(draft(4, false));
    await retry;
  });
  expect(result.current.view?.hasChanges).toBe(false);
  expect(result.current.loading).toBe(false);
  expect(result.current.error).toBeUndefined();
});

it('reports mismatched revisions until the Workspace revision is refreshed', async () => {
  mocks.read.mockResolvedValue(draft(5, false));
  const { result, rerender } = renderHook(
    ({ revision }) => useSchemaDraftStatus('project', 'workspace', revision),
    { initialProps: { revision: 4 } }
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toContain('Workspace revision changed');
  expect(result.current.view).toBeUndefined();
  rerender({ revision: 5 });
  await waitFor(() => expect(result.current.view?.workspaceRevision).toBe(5));
  expect(result.current.error).toBeUndefined();
});

it('ignores an older successful read when a newer focus refresh fails, then recovers on focus', async () => {
  let finishOld!: (value: WorkspaceAuthoringView) => void;
  mocks.read
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        })
    )
    .mockRejectedValueOnce(new Error('Latest status could not be read'));
  const { result, unmount } = renderHook(() => useSchemaDraftStatus('project', 'workspace', 4));
  act(() => window.dispatchEvent(new Event('focus')));
  await waitFor(() => expect(result.current.error).toBe('Latest status could not be read'));
  await act(async () => {
    finishOld(draft(4, false));
  });
  expect(result.current.view).toBeUndefined();
  expect(result.current.error).toBe('Latest status could not be read');

  mocks.read.mockResolvedValue(draft(4));
  act(() => window.dispatchEvent(new Event('focus')));
  await waitFor(() => expect(result.current.view?.hasChanges).toBe(true));
  expect(result.current.error).toBeUndefined();
  unmount();
  const calls = mocks.read.mock.calls.length;
  act(() => window.dispatchEvent(new Event('focus')));
  expect(mocks.read).toHaveBeenCalledTimes(calls);
});

it('does not apply a delayed response from another Workspace or project', async () => {
  let finishOld!: (value: WorkspaceAuthoringView) => void;
  mocks.read.mockImplementation((project, workspace) =>
    project === 'old-project' && workspace === 'old-workspace'
      ? new Promise((resolve) => {
          finishOld = resolve;
        })
      : Promise.resolve(draft(8))
  );
  const { result, rerender } = renderHook(
    ({ project, workspace, revision }) => useSchemaDraftStatus(project, workspace, revision),
    { initialProps: { project: 'old-project', workspace: 'old-workspace', revision: 4 } }
  );
  rerender({ project: 'new-project', workspace: 'new-workspace', revision: 8 });
  await waitFor(() => expect(result.current.view?.workspaceRevision).toBe(8));
  await act(async () => {
    finishOld(draft(4, false));
  });
  expect(result.current.view?.workspaceRevision).toBe(8);
  expect(result.current.view?.hasChanges).toBe(true);
  expect(result.current.error).toBeUndefined();
});

it('skips uninitialized authoring while disabled, including retry and focus, then reads when enabled', async () => {
  mocks.read.mockResolvedValue(draft(4));
  const { result, rerender } = renderHook(
    ({ enabled }) => useSchemaDraftStatus('project', 'workspace', 4, enabled),
    { initialProps: { enabled: false } }
  );
  expect(result.current).toMatchObject({ view: undefined, loading: false, error: undefined });
  await act(async () => {
    await result.current.refresh();
    window.dispatchEvent(new Event('focus'));
  });
  expect(mocks.read).not.toHaveBeenCalled();
  rerender({ enabled: true });
  await waitFor(() => expect(result.current.view?.hasChanges).toBe(true));
});

it('drops an in-flight read when authoring is disabled and never queries missing identifiers', async () => {
  let finish!: (value: WorkspaceAuthoringView) => void;
  mocks.read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const { result, rerender } = renderHook(
    ({ workspace, enabled }) => useSchemaDraftStatus('project', workspace, 4, enabled),
    { initialProps: { workspace: 'workspace', enabled: true } }
  );
  rerender({ workspace: 'workspace', enabled: false });
  await act(async () => {
    finish(draft(4));
  });
  expect(result.current).toMatchObject({ view: undefined, loading: false, error: undefined });
  rerender({ workspace: '', enabled: true });
  expect(result.current.loading).toBe(false);
  expect(mocks.read).toHaveBeenCalledTimes(1);
});
