/**
 * EventBus — Global in-process event bus for real-time notifications.
 *
 * Any write operation (extraction, yops, commit) broadcasts an event.
 * The RoomManager listens and pushes to connected WebSocket clients.
 *
 * Current: in-process EventEmitter (single server).
 * Future: swap to Redis pub/sub for multi-server (only this file changes).
 */

import { EventEmitter } from 'node:events';

export type RealtimeEventType =
  | 'draft.changed'
  | 'extraction.started'
  | 'extraction.done'
  | 'yops.applied'
  | 'commit.created'
  | 'presence.join'
  | 'presence.leave';

export interface RealtimeEvent {
  type: RealtimeEventType;
  conversationId: string;
  projectId?: string;
  userId?: string;
  payload?: Record<string, unknown>;
  timestamp: number;
}

class EventBus extends EventEmitter {
  broadcast(event: RealtimeEvent) {
    this.emit(`room:${event.conversationId}`, event);
  }
}

export const eventBus = new EventBus();
// Prevent MaxListeners warnings for many rooms
eventBus.setMaxListeners(1000);
