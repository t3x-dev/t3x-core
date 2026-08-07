// @vitest-environment jsdom

import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectWorkspaces } from '@/hooks/workspaces/useProjectWorkspaces';
import { fetchProjectWorkspaces } from '@/queries/workspaces';

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
});
