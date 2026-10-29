// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectWorkspaces } from '@/hooks/workspaces/useProjectWorkspaces';
import { fetchProjectWorkspaces } from '@/queries/workspaces';
import type { WorkspaceCandidate } from '@/types/workspaces';
import { deferred } from '../deferred';

vi.mock('@/queries/workspaces', () => ({ fetchProjectWorkspaces: vi.fn() }));

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  close() {}
}

describe('useProjectWorkspaces', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.mocked(fetchProjectWorkspaces).mockResolvedValue([]);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('does not let a previous project overwrite the selected project', async () => {
    const old = deferred<WorkspaceCandidate[]>();
    const a = [{ id: 'a', projectId: 'a' }] as WorkspaceCandidate[];
    const b = [{ id: 'b', projectId: 'b' }] as WorkspaceCandidate[];
    vi.mocked(fetchProjectWorkspaces)
      .mockResolvedValueOnce(a)
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(b);
    const { result, rerender, unmount } = renderHook(({ id }) => useProjectWorkspaces(id), {
      initialProps: { id: 'a' },
    });
    await waitFor(() => expect(result.current.workspaces).toEqual(a));
    act(() => {
      void result.current.refresh();
    });
    rerender({ id: 'b' });
    expect(result.current.workspaces).toEqual([]);
    await waitFor(() => expect(result.current.workspaces).toEqual(b));
    await act(async () => old.resolve(a));
    expect(result.current.workspaces).toEqual(b);
    unmount();
  });

  it('keeps the newest realtime refresh and ignores late failures', async () => {
    const old = deferred<WorkspaceCandidate[]>();
    const latest = deferred<WorkspaceCandidate[]>();
    vi.mocked(fetchProjectWorkspaces)
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(latest.promise);
    const { result, unmount } = renderHook(() => useProjectWorkspaces('a'));
    act(() => {
      void result.current.refresh();
    });
    await act(async () => old.reject(new Error('old failure')));
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    await act(async () => latest.resolve([]));
    expect(result.current.loading).toBe(false);
    unmount();
  });

  it('disabling a pending list prevents its response from repopulating the list', async () => {
    const pending = deferred<WorkspaceCandidate[]>();
    vi.mocked(fetchProjectWorkspaces).mockReturnValue(pending.promise);
    const { result, rerender, unmount } = renderHook(
      ({ enabled }) => useProjectWorkspaces('a', enabled),
      {
        initialProps: { enabled: true },
      }
    );
    rerender({ enabled: false });
    await act(async () => pending.resolve([{ id: 'a' }] as WorkspaceCandidate[]));
    expect(result.current.workspaces).toEqual([]);
    expect(result.current.loading).toBe(false);
    unmount();
  });

  it('refreshes persisted Workspaces after an external project draft event', async () => {
    const { unmount } = renderHook(() => useProjectWorkspaces('proj_1'));

    await waitFor(() => expect(fetchProjectWorkspaces).toHaveBeenCalledTimes(1));
    expect(FakeWebSocket.instances[0]?.url).toBe('ws://localhost:8000/ws?project_id=proj_1');

    FakeWebSocket.instances[0]?.onmessage?.({
      data: JSON.stringify({
        type: 'draft.changed',
        projectId: 'proj_1',
        payload: { event_id: '42', workspace_id: 'workspace_1' },
      }),
    } as MessageEvent);

    await waitFor(() => expect(fetchProjectWorkspaces).toHaveBeenCalledTimes(2));
    unmount();
  });

  it('recovers a commit missed by realtime when returning to the window', async () => {
    const before = [{ id: 'workspace_1', revision: 2 }] as WorkspaceCandidate[];
    const after = [{ id: 'workspace_1', revision: 3 }] as WorkspaceCandidate[];
    vi.mocked(fetchProjectWorkspaces).mockResolvedValueOnce(before).mockResolvedValueOnce(after);
    const { result, unmount } = renderHook(() => useProjectWorkspaces('proj_1'));
    await waitFor(() => expect(result.current.workspaces).toEqual(before));
    act(() => window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(result.current.workspaces).toEqual(after));
    unmount();
    window.dispatchEvent(new Event('focus'));
    expect(fetchProjectWorkspaces).toHaveBeenCalledTimes(2);
  });

  it('ignores duplicate and cross-project events', async () => {
    const { unmount } = renderHook(() => useProjectWorkspaces('proj_1'));
    await waitFor(() => expect(fetchProjectWorkspaces).toHaveBeenCalledTimes(1));

    const socket = FakeWebSocket.instances[0];
    const event = {
      type: 'draft.changed',
      projectId: 'proj_1',
      payload: { event_id: '42' },
    };
    socket?.onmessage?.({ data: JSON.stringify(event) } as MessageEvent);
    socket?.onmessage?.({ data: JSON.stringify(event) } as MessageEvent);
    socket?.onmessage?.({
      data: JSON.stringify({ ...event, projectId: 'proj_other', payload: { event_id: '43' } }),
    } as MessageEvent);

    await waitFor(() => expect(fetchProjectWorkspaces).toHaveBeenCalledTimes(2));
    unmount();
  });

  it('refreshes the effective binding after a local or cross-window Schema save', async () => {
    const { unmount } = renderHook(() => useProjectWorkspaces('proj_1'));
    await waitFor(() => expect(fetchProjectWorkspaces).toHaveBeenCalledTimes(1));
    act(() => {
      window.dispatchEvent(
        new CustomEvent('t3x-schema-candidate-updated', {
          detail: { projectId: 'proj_other', workspaceId: 'workspace_1' },
        })
      );
    });
    expect(fetchProjectWorkspaces).toHaveBeenCalledTimes(1);
    act(() => {
      window.dispatchEvent(
        new CustomEvent('t3x-schema-candidate-updated', {
          detail: { projectId: 'proj_1', workspaceId: 'workspace_1' },
        })
      );
    });
    await waitFor(() => expect(fetchProjectWorkspaces).toHaveBeenCalledTimes(2));
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 't3x-schema-candidate-updated',
          newValue: JSON.stringify({ projectId: 'proj_1' }),
        })
      );
    });
    await waitFor(() => expect(fetchProjectWorkspaces).toHaveBeenCalledTimes(3));
    unmount();
    window.dispatchEvent(
      new CustomEvent('t3x-schema-candidate-updated', { detail: { projectId: 'proj_1' } })
    );
    expect(fetchProjectWorkspaces).toHaveBeenCalledTimes(3);
  });
});
