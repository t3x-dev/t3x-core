/**
 * WebSocket Route — Real-time event stream for conversations and projects.
 *
 * Clients connect to one of:
 *   ws://host/ws?conversation_id=conv_xxx
 *   ws://host/ws?project_id=proj_xxx
 *   ws://host/ws?conversation_id=conv_xxx&project_id=proj_xxx
 *
 * At least one of `conversation_id` / `project_id` must be provided. When both
 * are provided, the connection joins both rooms — `conv:<id>` and
 * `project:<id>` — so that events published to either room are delivered.
 *
 * Authentication:
 *   - Browsers authenticate with the HttpOnly `t3x-session` cookie.
 *   - Non-browser callers may continue supplying API/deployment credentials
 *     as `token=<credential>`, but browser Sessions are forbidden in URLs.
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
import { isCredentialKind } from '@t3x-dev/core';
import { findConversationById, touchLastUsed } from '@t3x-dev/storage';
import { Hono } from 'hono';
import type { UpgradeWebSocket } from 'hono/ws';
import { logAuthorizationDenial } from '../lib/authorization-denial-audit';
import { getDB } from '../lib/db';
import { createError } from '../lib/errors';
import type { RealtimeEvent } from '../lib/event-bus';
import { replayEventsSince } from '../lib/event-replay';
import { evaluateProjectAccess } from '../lib/project-access';
import { WEB_SESSION_TOKEN_PREFIX } from '../lib/request-principal';
import { canReceiveRealtimeEvent, type RoomConnection, roomManager } from '../lib/room-manager';
import { type BearerTokenVerifier, verifyBearerToken } from '../middleware/auth';
import { pinoLogger } from '../middleware/logger';

const RESERVED_IDENTITY_QUERY_FIELDS = [
  'user_id',
  'actor',
  'owner',
  'delegator',
  'role',
  'namespace',
  'scopes',
  'principal',
] as const;

function readSessionCookie(header: string | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name !== 't3x-session') continue;
    try {
      return decodeURIComponent(value.join('='));
    } catch {
      return null;
    }
  }
  return null;
}

function sameOrigin(
  requestUrl: string,
  origin: string | undefined,
  forwardedHost: string | undefined,
  forwardedProto: string | undefined
): boolean {
  if (!origin) return false;
  try {
    const request = new URL(requestUrl);
    const expectedHost = forwardedHost?.split(',')[0]?.trim() || request.host;
    const forwardedProtocol = forwardedProto?.split(',')[0]?.trim();
    const expectedProtocol = forwardedProtocol
      ? `${forwardedProtocol.replace(/:$/, '')}:`
      : request.protocol;
    const source = new URL(origin);
    return source.host === expectedHost && source.protocol === expectedProtocol;
  } catch {
    return false;
  }
}

export function createWsRoute(
  upgradeWebSocket: UpgradeWebSocket,
  verifyToken: BearerTokenVerifier = verifyBearerToken
) {
  const wsRoute = new Hono();

  wsRoute.get('/ws', async (c, next) => {
    const conversationId = c.req.query('conversation_id') ?? null;
    const projectId = c.req.query('project_id') ?? null;
    // Only AUTH_DISABLED local development may trust a caller-supplied
    // presence label. Authenticated connections replace this with the
    // verified principal below.
    let connectionUserId = c.req.query('user_id') ?? 'anonymous';
    let sessionId: string | undefined;
    const authenticationDisabled = process.env.AUTH_DISABLED?.toLowerCase() === 'true';
    let workspaceOwner: RoomConnection['workspaceOwner'];
    const queryToken = c.req.query('token') ?? null;
    const cookieToken = readSessionCookie(c.req.header('cookie'));
    const token = cookieToken ?? queryToken;
    const lastEventIdRaw = c.req.query('last_event_id') ?? null;
    const lastEventId = lastEventIdRaw ? safeBigInt(lastEventIdRaw) : null;

    // Validate: at least one room identifier is required.
    if (!conversationId && !projectId) {
      return c.json(
        createError('INVALID_REQUEST', 'At least one of conversation_id or project_id is required'),
        400
      );
    }

    // Authenticate unless AUTH_DISABLED is explicitly set (case-insensitive).
    // Matches the gate used by authMiddleware.
    if (!authenticationDisabled) {
      if (queryToken?.startsWith(WEB_SESSION_TOKEN_PREFIX)) {
        return c.json(
          createError('INVALID_REQUEST', 'Browser Session tokens are not allowed in URLs'),
          400
        );
      }
      if (
        cookieToken &&
        !sameOrigin(
          c.req.url,
          c.req.header('origin'),
          c.req.header('x-forwarded-host'),
          c.req.header('x-forwarded-proto')
        )
      ) {
        return c.json(createError('FORBIDDEN', 'WebSocket origin denied'), 403);
      }
      if (!token) {
        return c.json(createError('UNAUTHORIZED', 'Missing token'), 401);
      }
      try {
        const db = await getDB();
        const principal = await verifyToken(db, token);
        if (!principal) {
          return c.json(createError('UNAUTHORIZED', 'Invalid token'), 401);
        }
        const identityOverride = RESERVED_IDENTITY_QUERY_FIELDS.find(
          (field) => c.req.query(field) !== undefined
        );
        if (identityOverride) {
          return c.json(
            createError('INVALID_REQUEST', `${identityOverride} is server-controlled`),
            400
          );
        }

        let authorizedProjectId = projectId;
        if (conversationId) {
          const conversation = await findConversationById(db, conversationId);
          if (!conversation) {
            return c.json(
              createError('NOT_FOUND', `Conversation ${conversationId} not found`),
              404
            );
          }
          if (projectId && conversation.projectId !== projectId) {
            logAuthorizationDenial({
              principal,
              action: 'project:read',
              resource: {
                kind: 'project_resource',
                id: conversationId,
                project_id: projectId,
              },
              reason: 'conversation_project_mismatch',
            });
            return c.json(createError('FORBIDDEN', 'Access denied'), 403);
          }
          authorizedProjectId = conversation.projectId;
        }

        if (authorizedProjectId) {
          const decision = await evaluateProjectAccess(
            db,
            authorizedProjectId,
            {
              userId: principal.userId,
              projectId: principal.credential.projectId,
              namespaceId: principal.credential.namespaceId,
              principalKind: principal.subject.kind,
              keyId: principal.subject.principal_id,
            },
            'project:read'
          );
          if (!decision.allowed) {
            if (decision.status === 403) {
              logAuthorizationDenial({
                principal,
                action: 'project:read',
                resource: { kind: 'project', id: authorizedProjectId },
                reason: decision.reason,
              });
            }
            return c.json(createError(decision.code, decision.message), decision.status);
          }
        }
        connectionUserId = principal.actor.id;
        sessionId = principal.sessionId ?? undefined;
        workspaceOwner = principal.workspaceOwner
          ? { kind: principal.workspaceOwner.kind, id: principal.workspaceOwner.principal_id }
          : undefined;
        // Fire-and-forget: update last_used_at only for persisted credentials.
        // Short-lived credentials such as deployment JWTs have no key row.
        // Errors are swallowed so a DB hiccup during touch doesn't poison the
        // handshake.
        if (isCredentialKind(principal.credential.kind) && principal.credential.id) {
          touchLastUsed(db, principal.credential.id).catch(() => {});
        }
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
            userId: connectionUserId,
            sessionId,
            workspaceOwner,
            authenticationDisabled,
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

          // Replay missed events for clients reconnecting with ?last_event_id=N.
          // Requires a project_id to safely scope the query. Runs after the
          // welcome envelope so the client sees 'connected' first, then the
          // replayed event stream, then (via roomManager subscription already
          // set up above) live events. Ordering within replay is id ASC so
          // the client can advance its last_event_id pointer monotonically.
          if (lastEventId !== null && projectId) {
            void (async () => {
              try {
                const db = await getDB();
                const missed = await replayEventsSince(db, {
                  sinceId: lastEventId,
                  projectId,
                  conversationId: conversationId ?? undefined,
                });
                for (const row of missed) {
                  const replayedEvent = {
                    type: row.type as RealtimeEvent['type'],
                    conversationId: row.conversationId ?? '',
                    projectId: row.projectId,
                    payload: { ...(row.payload ?? {}), event_id: row.id.toString() },
                    timestamp: row.createdAt.getTime(),
                  } satisfies RealtimeEvent;
                  if (!canReceiveRealtimeEvent(conn, replayedEvent)) continue;
                  try {
                    ws.send(JSON.stringify(replayedEvent));
                  } catch {
                    // Socket died mid-replay — stop pushing, live subscription cleanup
                    // handles the rest via onClose/onError.
                    break;
                  }
                }
              } catch (err) {
                pinoLogger.warn(
                  { err, lastEventId: lastEventId.toString(), projectId },
                  'ws: replay failed, continuing with live subscription only'
                );
              }
            })();
          }
        },

        onMessage(evt, ws) {
          // Future: handle client messages (triage decisions, cursor, etc.)
          try {
            const msg = JSON.parse(
              typeof evt.data === 'string' ? evt.data : (evt.data as unknown as Buffer).toString()
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

/**
 * Parse a bigint query param safely. Returns null for malformed input so the
 * handshake can proceed without replay (rather than 500ing the connection).
 */
function safeBigInt(s: string): bigint | null {
  try {
    return BigInt(s);
  } catch {
    return null;
  }
}
