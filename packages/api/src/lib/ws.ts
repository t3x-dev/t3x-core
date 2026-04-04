/**
 * WebSocket Setup — Real-time communication layer.
 *
 * Provides `upgradeWebSocket` middleware for Hono routes and
 * `injectWebSocket` to attach to the HTTP server.
 *
 * Usage:
 *   const { upgradeWebSocket, injectWebSocket } = setupWebSocket(app);
 *   // ... register WS routes using upgradeWebSocket ...
 *   const server = serve(app);
 *   injectWebSocket(server);
 */

import { createNodeWebSocket } from '@hono/node-ws';
import type { Hono } from 'hono';

let wsInstance: ReturnType<typeof createNodeWebSocket> | null = null;

/**
 * Initialize WebSocket support for the Hono app.
 * Must be called BEFORE registering WS routes.
 * Returns upgradeWebSocket middleware for route handlers.
 */
export function setupWebSocket(app: Hono) {
  wsInstance = createNodeWebSocket({ app: app as Parameters<typeof createNodeWebSocket>[0]['app'] });
  return wsInstance;
}

/**
 * Get the injectWebSocket function for the HTTP server.
 * Call after setupWebSocket() and serve().
 */
export function getWebSocketInjector() {
  if (!wsInstance) throw new Error('setupWebSocket() must be called first');
  return wsInstance.injectWebSocket;
}
