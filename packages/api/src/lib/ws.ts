/**
 * WebSocket Setup — Real-time communication layer.
 *
 * Provides the Hono WebSocket upgrade middleware and the no-server `ws`
 * instance consumed by `@hono/node-server` v2.
 *
 * Usage:
 *   const { upgradeWebSocket, websocket } = setupWebSocket();
 *   // ... register WS routes using upgradeWebSocket ...
 *   const server = serve({ fetch: app.fetch, websocket });
 */

import { upgradeWebSocket } from '@hono/node-server';
import { type WebSocket, WebSocketServer } from 'ws';

export const WS_HEARTBEAT_INTERVAL_MS = 30_000;

type LivenessTrackedSocket = WebSocket & { isAlive?: boolean };

/**
 * Install protocol-level ping/pong liveness checks on the shared ws server.
 * Browsers answer WebSocket ping frames automatically, so these frames do not
 * enter the application's JSON event protocol.
 */
export function installWebSocketHeartbeat(
  server: WebSocketServer,
  heartbeatIntervalMs = WS_HEARTBEAT_INTERVAL_MS
): () => void {
  const onConnection = (socket: WebSocket) => {
    const tracked = socket as LivenessTrackedSocket;
    tracked.isAlive = true;
    socket.on('pong', () => {
      tracked.isAlive = true;
    });
  };

  server.on('connection', onConnection);

  const timer = setInterval(() => {
    for (const socket of server.clients) {
      const tracked = socket as LivenessTrackedSocket;
      if (tracked.isAlive === false) {
        tracked.terminate();
        continue;
      }

      tracked.isAlive = false;
      try {
        tracked.ping();
      } catch {
        tracked.terminate();
      }
    }
  }, heartbeatIntervalMs);
  timer.unref?.();

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    server.off('connection', onConnection);
    server.off('close', stop);
  };
  server.once('close', stop);

  return stop;
}

/**
 * Initialize WebSocket support for the Node.js adapter.
 * Must be called BEFORE registering WS routes.
 * Returns the route middleware and the `serve()` WebSocket option.
 */
export function setupWebSocket() {
  const server = new WebSocketServer({ noServer: true });
  installWebSocketHeartbeat(server);
  return {
    upgradeWebSocket,
    websocket: { server },
  };
}
