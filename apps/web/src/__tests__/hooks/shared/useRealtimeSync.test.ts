// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupRoots, renderHook } from '../renderHook';

const hydrateMock = vi.fn();

vi.mock('@/hooks/conversations/hydrateConversationToStore', () => ({
  hydrateConversationToStore: (...args: unknown[]) => hydrateMock(...args),
}));

class FakeWebSocket {
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readyState = FakeWebSocket.OPEN;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  close() {
    this.readyState = 3;
    this.onclose?.({} as CloseEvent);
  }
}

async function loadHook() {
  vi.resetModules();
  return import('@/hooks/shared/useRealtimeSync');
}

describe('useRealtimeSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    hydrateMock.mockReset();
    hydrateMock.mockResolvedValue(undefined);
    FakeWebSocket.instances = [];
    process.env.NODE_ENV = 'development';
    delete process.env.NEXT_PUBLIC_API_URL;
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });

  afterEach(() => {
    cleanupRoots();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('connects to the API WebSocket host in local development', async () => {
    const { useRealtimeSync } = await loadHook();

    const { unmount } = renderHook(() => useRealtimeSync('conv_1'));

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0].url).toBe('ws://localhost:8000/ws?conversation_id=conv_1');
    unmount();
  });

  it('does not reconnect after cleanup closes the old socket', async () => {
    const { useRealtimeSync } = await loadHook();

    const { unmount } = renderHook(() => useRealtimeSync('conv_1'));
    unmount();

    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(5000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('reconnects when an active socket closes unexpectedly', async () => {
    const { useRealtimeSync } = await loadHook();

    const { unmount } = renderHook(() => useRealtimeSync('conv_1'));
    FakeWebSocket.instances[0].close();

    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(5000);
    expect(FakeWebSocket.instances).toHaveLength(2);
    unmount();
  });

  it('joins the active project room when a project is selected', async () => {
    const { useRealtimeSync } = await loadHook();
    const { useChatStore } = await import('@/store/chatStore');
    useChatStore.getState().setActiveConversation('conv_1', 'proj_1');

    const { unmount } = renderHook(() => useRealtimeSync('conv_1'));

    expect(FakeWebSocket.instances[0].url).toBe(
      'ws://localhost:8000/ws?conversation_id=conv_1&project_id=proj_1'
    );
    unmount();
  });

  it('hydrates the current conversation on matching commit.created', async () => {
    const { useRealtimeSync } = await loadHook();
    const { useChatStore } = await import('@/store/chatStore');
    useChatStore.getState().setActiveConversation('conv_1', 'proj_1');

    const { unmount } = renderHook(() => useRealtimeSync('conv_1'));
    FakeWebSocket.instances[0].onmessage?.({
      data: JSON.stringify({
        type: 'commit.created',
        conversationId: '',
        projectId: 'proj_1',
        payload: { hash: 'sha256:abc' },
        timestamp: Date.now(),
      }),
    } as MessageEvent);

    expect(hydrateMock).toHaveBeenCalledWith('proj_1', 'conv_1');
    unmount();
  });

  it('deduplicates repeated realtime deliveries with the same event_id', async () => {
    const { useRealtimeSync } = await loadHook();
    const { useChatStore } = await import('@/store/chatStore');
    useChatStore.getState().setActiveConversation('conv_1', 'proj_1');

    const { unmount } = renderHook(() => useRealtimeSync('conv_1'));
    const event = {
      type: 'commit.created',
      conversationId: '',
      projectId: 'proj_1',
      payload: { hash: 'sha256:abc', event_id: '42' },
      timestamp: Date.now(),
    };
    FakeWebSocket.instances[0].onmessage?.({ data: JSON.stringify(event) } as MessageEvent);
    FakeWebSocket.instances[0].onmessage?.({ data: JSON.stringify(event) } as MessageEvent);

    expect(hydrateMock).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('hydrates conservatively on commit.created when event project scope is missing', async () => {
    const { useRealtimeSync } = await loadHook();
    const { useChatStore } = await import('@/store/chatStore');
    useChatStore.getState().setActiveConversation('conv_1', 'proj_1');

    const { unmount } = renderHook(() => useRealtimeSync('conv_1'));
    FakeWebSocket.instances[0].onmessage?.({
      data: JSON.stringify({
        type: 'commit.created',
        conversationId: '',
        payload: { hash: 'sha256:abc' },
        timestamp: Date.now(),
      }),
    } as MessageEvent);

    expect(hydrateMock).toHaveBeenCalledWith('proj_1', 'conv_1');
    unmount();
  });

  it('ignores commit.created for a different active project', async () => {
    const { useRealtimeSync } = await loadHook();
    const { useChatStore } = await import('@/store/chatStore');
    useChatStore.getState().setActiveConversation('conv_1', 'proj_1');

    const { unmount } = renderHook(() => useRealtimeSync('conv_1'));
    FakeWebSocket.instances[0].onmessage?.({
      data: JSON.stringify({
        type: 'commit.created',
        conversationId: '',
        projectId: 'proj_other',
        payload: { hash: 'sha256:abc' },
        timestamp: Date.now(),
      }),
    } as MessageEvent);

    expect(hydrateMock).not.toHaveBeenCalled();
    unmount();
  });
});
