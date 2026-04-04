/**
 * RoomManager — Manages WebSocket connections grouped by conversation (room).
 *
 * Each conversation is a "room". When a client opens a conversation,
 * it joins the room. When backend state changes, the event is broadcast
 * to all clients in that room.
 *
 * Architecture parallel: Liveblocks "Room" concept, but simpler —
 * no CRDT, no persistence, just pub/sub notifications.
 */

import type { WSContext } from 'hono/ws';
import type { RealtimeEvent } from './event-bus';
import { eventBus } from './event-bus';

interface RoomConnection {
  id: string;
  ws: WSContext;
  userId?: string;
  joinedAt: number;
}

class RoomManager {
  private rooms = new Map<string, Map<string, RoomConnection>>();

  /**
   * Add a WebSocket connection to a conversation room.
   * Automatically subscribes to EventBus for that room.
   */
  join(conversationId: string, conn: RoomConnection): void {
    if (!this.rooms.has(conversationId)) {
      this.rooms.set(conversationId, new Map());
      // Subscribe to EventBus when first client joins this room
      eventBus.on(`room:${conversationId}`, (event: RealtimeEvent) => {
        this.broadcastToRoom(conversationId, event, conn.id);
      });
    }

    this.rooms.get(conversationId)!.set(conn.id, conn);

    // Notify others in the room
    this.broadcastToRoom(conversationId, {
      type: 'presence.join',
      conversationId,
      userId: conn.userId,
      payload: { connectionId: conn.id },
      timestamp: Date.now(),
    }, conn.id);
  }

  /**
   * Remove a WebSocket connection from a room.
   * Cleans up EventBus listener when room is empty.
   */
  leave(conversationId: string, connectionId: string): void {
    const room = this.rooms.get(conversationId);
    if (!room) return;

    const conn = room.get(connectionId);
    room.delete(connectionId);

    // Notify others
    if (conn) {
      this.broadcastToRoom(conversationId, {
        type: 'presence.leave',
        conversationId,
        userId: conn.userId,
        payload: { connectionId },
        timestamp: Date.now(),
      });
    }

    // Clean up empty room
    if (room.size === 0) {
      this.rooms.delete(conversationId);
      eventBus.removeAllListeners(`room:${conversationId}`);
    }
  }

  /**
   * Get all users currently in a room (for presence).
   */
  getPresence(conversationId: string): Array<{ userId?: string; connectionId: string }> {
    const room = this.rooms.get(conversationId);
    if (!room) return [];
    return Array.from(room.values()).map((c) => ({
      userId: c.userId,
      connectionId: c.id,
    }));
  }

  /**
   * Broadcast an event to all connections in a room.
   * Optionally exclude the sender (to avoid echo).
   */
  private broadcastToRoom(
    conversationId: string,
    event: RealtimeEvent,
    excludeConnectionId?: string,
  ): void {
    const room = this.rooms.get(conversationId);
    if (!room) return;

    const message = JSON.stringify(event);

    for (const [id, conn] of room) {
      if (id === excludeConnectionId) continue;
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
