/**
 * replayEventsSince — fetch events from the outbox that occurred after a
 * given event id, scoped to a project (and optionally a conversation).
 *
 * Used by the WebSocket connection handler to replay missed events when a
 * client reconnects with `?last_event_id=N`. This is what makes realtime
 * sync resilient to short-lived client disconnects.
 *
 * The query is backed by composite indexes
 *   events_project_id_idx(project_id, id)
 *   events_conversation_id_idx(conversation_id, id)
 * so `WHERE project_id = ? AND id > ? ORDER BY id ASC` stays O(log N).
 *
 * NOTE: Results are capped by `limit` (default 500). A client that has been
 * offline long enough to accumulate more than `limit` missed events will
 * receive a truncated replay and should fall back to a full refresh — but
 * see the outbox retention policy: rows older than 7 days are cleaned up,
 * so practically the cap only bites for very bursty projects.
 */

import { type AnyDB, events } from '@t3x-dev/storage';
import { and, asc, eq, gt } from 'drizzle-orm';

const DEFAULT_LIMIT = 500;

export interface ReplayInput {
  sinceId: bigint;
  projectId: string;
  conversationId?: string;
  limit?: number;
}

export interface ReplayedEvent {
  id: bigint;
  type: string;
  projectId: string;
  conversationId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: Date;
}

export async function replayEventsSince(db: AnyDB, input: ReplayInput): Promise<ReplayedEvent[]> {
  const conditions = [gt(events.id, input.sinceId), eq(events.projectId, input.projectId)];
  if (input.conversationId) {
    conditions.push(eq(events.conversationId, input.conversationId));
  }
  const rows = await db
    .select()
    .from(events)
    .where(and(...conditions))
    .orderBy(asc(events.id))
    .limit(input.limit ?? DEFAULT_LIMIT);

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    projectId: row.projectId,
    conversationId: row.conversationId,
    payload: row.payload as Record<string, unknown> | null,
    createdAt: row.createdAt,
  }));
}
