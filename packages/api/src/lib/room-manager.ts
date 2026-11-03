/**
 * RoomManager — Manages WebSocket connections grouped by room key.
 *
 * A "room" is identified by a logical roomKey such as:
 *   - `conv:<conversationId>`  — per-conversation subscribers (legacy default)
 *   - `project:<projectId>`    — project-wide subscribers (e.g. WebUI canvas)
 *
 * When a client opens a conversation or project view, it joins the matching
 * room. When backend state changes, the event is broadcast to all clients in
 * that room via the EventBus.
 *
 * Architecture parallel: Liveblocks "Room" concept, but simpler —
 * no CRDT, no persistence, just pub/sub notifications.
 */

import type { WSContext } from 'hono/ws';
import type { RealtimeEvent } from './event-bus';
import { eventBus } from './event-bus';

export interface RoomConnection {
  id: string;
  ws: WSContext;
  userId?: string;
  sessionId?: string;
  workspaceOwner?: { kind: string; id: string };
  authenticationDisabled?: boolean;
  joinedAt: number;
}

/**
 * Workspace events share the project room transport but remain principal
 * private. Events without a Workspace identity are ordinary project events.
 * Legacy/unowned Workspace events are visible only in the explicit local
 * AUTH_DISABLED bypass.
 */
export function canReceiveRealtimeEvent(
  conn: Pick<RoomConnection, 'workspaceOwner' | 'authenticationDisabled'>,
  event: RealtimeEvent
): boolean {
  const workspaceId = event.payload?.workspace_id;
  if (typeof workspaceId !== 'string' || workspaceId.length === 0) return true;
  if (conn.authenticationDisabled) return true;
  const ownerKind = event.payload?.owner_principal_kind;
  const ownerId = event.payload?.owner_principal_id;
  return (
    typeof ownerKind === 'string' &&
    typeof ownerId === 'string' &&
    conn.workspaceOwner?.kind === ownerKind &&
    conn.workspaceOwner.id === ownerId
  );
}

/**
 * Translate a logical room key to the EventBus channel name used by
 * `eventBus.broadcast`.
 *
 *   conv:<conversationId>     → room:<conversationId>
 *   project:<projectId>       → room:project:<projectId>
 *
 * The asymmetry preserves backwards compatibility with the existing per-
 * conversation channel naming while letting project rooms coexist.
 */
function roomKeyToChannel(roomKey: string): string {
  if (roomKey.startsWith('conv:')) {
    return `room:${roomKey.slice('conv:'.length)}`;
  }
  if (roomKey.startsWith('project:')) {
    return `room:project:${roomKey.slice('project:'.length)}`;
  }
  // Fallback: treat as a raw conversationId (legacy callers) — keep
  // existing behavior so nothing else breaks.
  return `room:${roomKey}`;
}

/**
 * Derive a `conversationId` value to use inside `presence.join`/`presence.leave`
 * events. Presence is conceptually conversation-scoped; project rooms are
 * server-push only and won't normally use presence, but the field must remain
 * present so the `RealtimeEvent` type stays valid.
 */
function presenceConversationIdFor(roomKey: string): string {
  if (roomKey.startsWith('conv:')) return roomKey.slice('conv:'.length);
  if (roomKey.startsWith('project:')) return '';
  return roomKey;
}

class RoomManager {
  private rooms = new Map<string, Map<string, RoomConnection>>();
  private listeners: Map<string, { channel: string; listener: (event: RealtimeEvent) => void }> =
    new Map();

  /**
   * Add a WebSocket connection to a room.
   * Automatically subscribes to EventBus for that room.
   */
  join(roomKey: string, conn: RoomConnection): void {
    if (!this.rooms.has(roomKey)) {
      this.rooms.set(roomKey, new Map());
      // Subscribe to EventBus when first client joins this room
      const channel = roomKeyToChannel(roomKey);
      const listener = (event: RealtimeEvent) => {
        // No exclusion — backend events go to ALL clients in the room
        this.broadcastToRoom(roomKey, event);
      };
      eventBus.on(channel, listener);
      this.listeners.set(roomKey, { channel, listener });
    }

    this.rooms.get(roomKey)!.set(conn.id, conn);

    // Notify others in the room
    this.broadcastToRoom(
      roomKey,
      {
        type: 'presence.join',
        conversationId: presenceConversationIdFor(roomKey),
        userId: conn.userId,
        payload: { connectionId: conn.id },
        timestamp: Date.now(),
      },
      conn.id
    );
  }

  /**
   * Remove a WebSocket connection from a room.
   * Cleans up EventBus listener when room is empty.
   */
  leave(roomKey: string, connectionId: string): void {
    const room = this.rooms.get(roomKey);
    if (!room) return;

    const conn = room.get(connectionId);
    room.delete(connectionId);

    // Notify others
    if (conn) {
      this.broadcastToRoom(roomKey, {
        type: 'presence.leave',
        conversationId: presenceConversationIdFor(roomKey),
        userId: conn.userId,
        payload: { connectionId },
        timestamp: Date.now(),
      });
    }

    // Clean up empty room
    if (room.size === 0) {
      this.rooms.delete(roomKey);
      const entry = this.listeners.get(roomKey);
      if (entry) {
        eventBus.off(entry.channel, entry.listener);
        this.listeners.delete(roomKey);
      }
    }
  }

  /**
   * Get all users currently in a room (for presence).
   */
  getPresence(roomKey: string): Array<{ userId?: string; connectionId: string }> {
    const room = this.rooms.get(roomKey);
    if (!room) return [];
    return Array.from(room.values()).map((c) => ({
      userId: c.userId,
      connectionId: c.id,
    }));
  }

  /**
   * Number of connections currently in a room (0 if the room does not exist).
   */
  getRoomSize(roomKey: string): number {
    return this.rooms.get(roomKey)?.size ?? 0;
  }

  /** Close and remove every live socket authenticated by a revoked Session. */
  disconnectSession(sessionId: string): void {
    const connections = new Map<string, RoomConnection>();
    for (const room of this.rooms.values()) {
      for (const conn of room.values()) {
        if (conn.sessionId === sessionId) connections.set(conn.id, conn);
      }
    }
    for (const conn of connections.values()) {
      try {
        conn.ws.close(1008, 'Session revoked');
      } catch {
        // Removal below still prevents further delivery if the socket is already dead.
      }
      for (const roomKey of [...this.rooms.keys()]) this.leave(roomKey, conn.id);
    }
  }

  /**
   * Broadcast an event to all connections in a room.
   * Optionally exclude the sender (to avoid echo).
   */
  private broadcastToRoom(
    roomKey: string,
    event: RealtimeEvent,
    excludeConnectionId?: string
  ): void {
    const room = this.rooms.get(roomKey);
    if (!room) return;

    const message = JSON.stringify(event);

    for (const [id, conn] of room) {
      if (id === excludeConnectionId) continue;
      if (!canReceiveRealtimeEvent(conn, event)) continue;
      try {
        conn.ws.send(message);
      } catch {
        // Connection dead — remove on next tick
        room.delete(id);
      }
    }
  }

  /** Stats for monitoring */
  get stats(): { rooms: number; connections: number } {
    let connections = 0;
    for (const room of this.rooms.values()) connections += room.size;
    return { rooms: this.rooms.size, connections };
  }
}

export const roomManager = new RoomManager();
