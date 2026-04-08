/**
 * WebSocket Route — Real-time event stream for conversations.
 *
 * Clients connect to: ws://host/ws?conversation_id=conv_xxx
 *
 * Server pushes events when backend state changes:
 *   - extraction.done — extraction completed (by any source)
 *   - draft.changed   — draft content modified
 *   - yops.applied    — YOps applied to draft
 *   - commit.created  — new commit created
 *   - presence.join   — another user opened this conversation
 *   - presence.leave  — another user left
 *
 * Client can send (future):
 *   - triage.decision — accept/reject node
 *   - presence.cursor — cursor position
 */

import { Hono } from 'hono';
import type { UpgradeWebSocket } from 'hono/ws';
import { roomManager } from '../lib/room-manager';

export function createWsRoute(upgradeWebSocket: UpgradeWebSocket) {
  const wsRoute = new Hono();

  wsRoute.get(
    '/ws',
    upgradeWebSocket((c) => {
      const conversationId = c.req.query('conversation_id');
      const userId = c.req.query('user_id');
      const connectionId = crypto.randomUUID();

      return {
        onOpen(_evt, ws) {
          if (!conversationId) {
            ws.send(JSON.stringify({ type: 'error', message: 'conversation_id required' }));
            ws.close(1008, 'conversation_id required');
            return;
          }

          roomManager.join(`conv:${conversationId}`, {
            id: connectionId,
            ws,
            userId: userId || undefined,
            joinedAt: Date.now(),
          });

          // Send initial presence state
          const presence = roomManager.getPresence(`conv:${conversationId}`);
          ws.send(JSON.stringify({
            type: 'connected',
            connectionId,
            conversationId,
            presence,
            timestamp: Date.now(),
          }));
        },

        onMessage(evt, ws) {
          // Future: handle client messages (triage decisions, cursor, etc.)
          try {
            const msg = JSON.parse(typeof evt.data === 'string' ? evt.data : evt.data.toString());

            if (msg.type === 'ping') {
              ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            }

            // Future message handlers:
            // if (msg.type === 'triage.decision') { ... }
            // if (msg.type === 'presence.cursor') { ... }
          } catch {
            // Ignore malformed messages
          }
        },

        onClose() {
          if (conversationId) {
            roomManager.leave(`conv:${conversationId}`, connectionId);
          }
        },

        onError() {
          if (conversationId) {
            roomManager.leave(`conv:${conversationId}`, connectionId);
          }
        },
      };
    }),
  );

  return wsRoute;
}
