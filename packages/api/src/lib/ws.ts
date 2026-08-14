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
import { WebSocketServer } from 'ws';

/**
 * Initialize WebSocket support for the Node.js adapter.
 * Must be called BEFORE registering WS routes.
 * Returns the route middleware and the `serve()` WebSocket option.
 */
export function setupWebSocket() {
  const server = new WebSocketServer({ noServer: true });
  return {
    upgradeWebSocket,
    websocket: { server },
  };
}
