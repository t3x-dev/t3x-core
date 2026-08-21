import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupWebSocket, WS_HEARTBEAT_INTERVAL_MS } from '../lib/ws';

describe('Node WebSocket setup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('provides the node-server v2 upgrade helper and a no-server ws instance', () => {
    const { upgradeWebSocket, websocket } = setupWebSocket();

    expect(upgradeWebSocket).toBeTypeOf('function');
    expect(websocket.server.options.noServer).toBe(true);

    websocket.server.emit('close');
  });

  it('pings responsive clients and terminates clients that miss a heartbeat', async () => {
    const { websocket } = setupWebSocket();
    const socket = Object.assign(new EventEmitter(), {
      ping: vi.fn(),
      terminate: vi.fn(),
    });
    websocket.server.clients.add(socket as never);
    websocket.server.emit('connection', socket as never, {} as never);

    await vi.advanceTimersByTimeAsync(WS_HEARTBEAT_INTERVAL_MS);
    expect(socket.ping).toHaveBeenCalledTimes(1);
    expect(socket.terminate).not.toHaveBeenCalled();

    socket.emit('pong');
    await vi.advanceTimersByTimeAsync(WS_HEARTBEAT_INTERVAL_MS);
    expect(socket.ping).toHaveBeenCalledTimes(2);
    expect(socket.terminate).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(WS_HEARTBEAT_INTERVAL_MS);
    expect(socket.terminate).toHaveBeenCalledTimes(1);

    websocket.server.emit('close');
  });

  it('clears the heartbeat timer when the server closes', () => {
    const { websocket } = setupWebSocket();

    expect(vi.getTimerCount()).toBe(1);
    websocket.server.emit('close');

    expect(vi.getTimerCount()).toBe(0);
  });
});
