// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupRoots, renderHook } from '../renderHook';

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
});
