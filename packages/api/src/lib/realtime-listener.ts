/**
 * RealtimeListener — bridge from PostgreSQL pg_notify to our in-process eventBus.
 *
 * Runs once per apps/api process. Subscribes to the 't3x_events' channel; for
 * each notification (which carries an event row id), fetches the row from the
 * events outbox and broadcasts it via eventBus → existing WebSocket fanout.
 *
 * This is what makes MCP / CLI / future workers' writes propagate to WebUI
 * without those processes knowing anything about WebSocket.
 */
import type postgres from 'postgres';
import { pinoLogger } from '../middleware/logger';
import { eventBus, type RealtimeEvent, type RealtimeEventType } from './event-bus';

export interface FetchedEvent {
  id: bigint;
  type: string;
  projectId: string;
  conversationId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: Date;
}

export interface RealtimeListenerDeps {
  pg: Pick<postgres.Sql, 'listen'>;
  fetchEventById: (id: bigint) => Promise<FetchedEvent | null>;
}

let handle: { unlisten: () => Promise<void> } | null = null;

export async function startRealtimeListener(deps: RealtimeListenerDeps): Promise<void> {
  if (handle) return;
  const result = await deps.pg.listen('t3x_events', (payload: string) => {
    void handleNotification(payload, deps.fetchEventById);
  });
  handle = { unlisten: result.unlisten };
  pinoLogger.info('realtime: LISTEN t3x_events started');
}

async function handleNotification(
  payload: string,
  fetchEventById: RealtimeListenerDeps['fetchEventById']
): Promise<void> {
  try {
    const id = BigInt(payload);
    const row = await fetchEventById(id);
    if (!row) {
      pinoLogger.warn({ eventId: payload }, 'realtime: event row missing');
      return;
    }
    const event: RealtimeEvent = {
      type: row.type as RealtimeEventType,
      conversationId: row.conversationId ?? '',
      projectId: row.projectId,
      payload: { ...(row.payload ?? {}), event_id: row.id.toString() },
      timestamp: row.createdAt.getTime(),
    };
    eventBus.broadcast(event);
  } catch (err) {
    pinoLogger.error({ err, payload }, 'realtime: listener handler failed');
  }
}

export async function stopRealtimeListener(): Promise<void> {
  if (handle) {
    await handle.unlisten();
    handle = null;
  }
}

/**
 * Default fetchEventById implementation using the shared storage DB.
 * Apps wire this via:
 *   await startRealtimeListener({
 *     pg: getPostgresClient(),
 *     fetchEventById: defaultFetchEventById,
 *   });
 */
export async function defaultFetchEventById(id: bigint): Promise<FetchedEvent | null> {
  const { getPostgresClient } = await import('@t3x-dev/storage');
  const client = getPostgresClient();
  // Use raw postgres.js to sidestep drizzle-orm type resolution across package boundaries.
  const rows = await client<
    Array<{
      id: string;
      type: string;
      project_id: string;
      conversation_id: string | null;
      payload: Record<string, unknown> | null;
      created_at: Date;
    }>
  >`SELECT id, type, project_id, conversation_id, payload, created_at
    FROM events WHERE id = ${id.toString()}::bigint LIMIT 1`;
  const row = rows[0];
  if (!row) return null;
  return {
    id: BigInt(row.id),
    type: row.type,
    projectId: row.project_id,
    conversationId: row.conversation_id,
    payload: row.payload,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
  };
}
