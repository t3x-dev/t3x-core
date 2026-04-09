/**
 * WebSocket Route — Real-time event stream for conversations and projects.
 *
 * Clients connect to one of:
 *   ws://host/ws?conversation_id=conv_xxx&token=t3xk_...
 *   ws://host/ws?project_id=proj_xxx&token=t3xk_...
 *   ws://host/ws?conversation_id=conv_xxx&project_id=proj_xxx&token=t3xk_...
 *
 * At least one of `conversation_id` / `project_id` must be provided. When both
 * are provided, the connection joins both rooms — `conv:<id>` and
 * `project:<id>` — so that events published to either room are delivered.
 *
 * Authentication:
 *   - Required by default: clients must supply `token=<api_key>` as a query
 *     parameter. The token is validated via `verifyBearerToken`, which looks
 *     up the hashed key in storage.
 *   - Skipped only when `AUTH_DISABLED=true` (case-insensitive) in the env.
 *     Mirrors the case-insensitive gate used by `authMiddleware`.
 *
 * Server pushes events when backend state changes:
 *   - extraction.done      — extraction completed
 *   - draft.changed        — draft content modified
 *   - yops.applied         — YOps applied to draft
 *   - commit.created       — new commit created
 *   - conversation.renamed — conversation alias/title updated
 *   - presence.join        — another user opened this room
 *   - presence.leave       — another user left
 *
 * Client can send (future):
 *   - triage.decision — accept/reject node
 *   - presence.cursor — cursor position
 *
 * NOTE: When a single WebSocket joins both the conv: and project: room for
 * the same logical entity, it will receive duplicate deliveries of events
 * that are dual-emitted by the event bus. Per-connection dedup is out of
 * scope for this task and tracked as follow-up work.
 */

import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import type { UpgradeWebSocket } from 'hono/ws';
import { getDB } from '../lib/db';
import { createError } from '../lib/errors';
import { type RoomConnection, roomManager } from '../lib/room-manager';
import { verifyBearerToken } from '../middleware/auth';
import { pinoLogger } from '../middleware/logger';

export function createWsRoute(upgradeWebSocket: UpgradeWebSocket) {
  const wsRoute = new Hono();

  wsRoute.get('/ws', async (c, next) => {
    const conversationId = c.req.query('conversation_id') ?? null;
    const projectId = c.req.query('project_id') ?? null;
    const userId = c.req.query('user_id') ?? 'anonymous';
    const token = c.req.query('token') ?? null;

    // Validate: at least one room identifier is required.
    if (!conversationId && !projectId) {
      return c.json(
        createError('INVALID_REQUEST', 'At least one of conversation_id or project_id is required'),
        400
      );
    }

    // Authenticate unless AUTH_DISABLED is explicitly set (case-insensitive).
    // Matches the gate used by authMiddleware.
    if (process.env.AUTH_DISABLED?.toLowerCase() !== 'true') {
      if (!token) {
        return c.json(createError('UNAUTHORIZED', 'Missing token'), 401);
      }
      try {
        const db = await getDB();
        const principal = await verifyBearerToken(db, token);
        if (!principal) {
          return c.json(createError('UNAUTHORIZED', 'Invalid token'), 401);
        }
        // Fire-and-forget: update last_used_at on the API key.
        // `verifyBearerToken` is intentionally side-effect-free, so we mirror
        // the bookkeeping done by `authMiddleware` here. Errors are swallowed
        // so a DB hiccup during touch doesn't poison the handshake.
        const { touchLastUsed } = await import('@t3x-dev/storage');
        touchLastUsed(db, principal.keyId).catch(() => {});
      } catch (err) {
        pinoLogger.error({ err }, 'ws auth failed');
        return c.json(createError('INTERNAL_ERROR', 'Authentication error'), 500);
      }
    }

    // Precompute all room keys this connection will join.
    const roomKeys: string[] = [];
    if (conversationId) roomKeys.push(`conv:${conversationId}`);
    if (projectId) roomKeys.push(`project:${projectId}`);

    // Build the upgrade handler. Once all checks pass we delegate to
    // `upgradeWebSocket(...)`, which returns a Hono middleware that we then
    // invoke manually with `(c, next)`. This lets us gate the upgrade behind
    // async auth — something Hono's static-middleware pattern cannot do.
    const upgradeHandler = upgradeWebSocket((_c) => {
      const connectionId = `c_${randomUUID()}`;

      return {
        onOpen(_evt, ws) {
          const conn: RoomConnection = {
            id: connectionId,
            ws: ws as unknown as RoomConnection['ws'],
            userId,
            joinedAt: Date.now(),
          };
          for (const key of roomKeys) {
            roomManager.join(key, conn);
          }

          // Send initial connected envelope (legacy contract). Presence
          // snapshot for the first room helps clients render an initial
          // viewer list.
          // roomKeys is non-empty here because we 400-rejected the empty case above.
          const presence = roomManager.getPresence(roomKeys[0]);
          try {
            ws.send(
              JSON.stringify({
                type: 'connected',
                connectionId,
                conversationId,
                projectId,
                presence,
                timestamp: Date.now(),
              })
            );
          } catch {
            // If the socket is already dead we silently ignore — join/leave
            // bookkeeping will still fire via onClose/onError.
          }
        },

        onMessage(evt, ws) {
          // Future: handle client messages (triage decisions, cursor, etc.)
          try {
            const msg = JSON.parse(
              typeof evt.data === 'string' ? evt.data : (evt.data as Buffer).toString()
            );

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
          for (const key of roomKeys) {
            roomManager.leave(key, connectionId);
          }
        },

        onError() {
          for (const key of roomKeys) {
            roomManager.leave(key, connectionId);
          }
        },
      };
    });

    return upgradeHandler(c, next);
  });

  return wsRoute;
}
