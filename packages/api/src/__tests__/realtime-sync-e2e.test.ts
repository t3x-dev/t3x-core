/**
 * End-to-end test for the realtime sync chain:
 *
 *   simulate "MCP" write → DB trigger fires pg_notify
 *     → real LISTEN relay receives notification
 *     → relay fetches row + broadcasts to eventBus
 *     → WebSocket consumers receive the event
 *
 * This is the integration test that the per-task unit tests deliberately
 * stubbed out (PGlite cannot test cross-process pg_notify; they used
 * mocked pg.listen instead). Here we use the real embedded Postgres test
 * server so pg_notify works end-to-end.
 */

import { insertConversation, insertProject, recordEvent, setAliasIfNull } from '@t3x-dev/storage';
import { sql } from 'drizzle-orm';
import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eventBus, type RealtimeEvent } from '../lib/event-bus';
import {
  defaultFetchEventById,
  startRealtimeListener,
  stopRealtimeListener,
} from '../lib/realtime-listener';
import { setupTestDB } from './setup';

describe('realtime sync e2e (real pg_notify)', () => {
  let db: Awaited<ReturnType<typeof setupTestDB>>['db'];
  let cleanup: () => Promise<void>;
  let pg: postgres.Sql;
  const received: RealtimeEvent[] = [];

  // biome-ignore lint/suspicious/noExplicitAny: relay listener is private
  const broadcastListener = (event: RealtimeEvent) => {
    received.push(event);
  };

  beforeAll(async () => {
    const setup = await setupTestDB();
    db = setup.db;
    cleanup = setup.cleanup;
    pg = setup.sql;

    // Start a real LISTEN relay against the embedded Postgres test DB
    await startRealtimeListener({
      pg,
      fetchEventById: async (id) => {
        // Use the same default fetcher pattern but bound to OUR sql client
        // (defaultFetchEventById uses getPostgresDB() which is set by createTestDB)
        return defaultFetchEventById(id);
      },
    });

    // Subscribe to the eventBus to capture broadcasts
    eventBus.on('room:project:proj_e2e', broadcastListener);
    eventBus.on('room:conv_e2e_a', broadcastListener);
    eventBus.on('room:conv_e2e_b', broadcastListener);
  });

  afterAll(async () => {
    eventBus.off('room:project:proj_e2e', broadcastListener);
    eventBus.off('room:conv_e2e_a', broadcastListener);
    eventBus.off('room:conv_e2e_b', broadcastListener);
    await stopRealtimeListener();
    await cleanup();
  });

  /** Wait for `received` to contain at least N events of the given type, up to 2s. */
  async function waitFor(
    type: string,
    minCount: number,
    timeoutMs = 2000
  ): Promise<RealtimeEvent[]> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const matches = received.filter((e) => e.type === type);
      if (matches.length >= minCount) return matches;
      await new Promise((r) => setTimeout(r, 25));
    }
    return received.filter((e) => e.type === type);
  }

  it('Path A — recordEvent → trigger → pg_notify → relay → eventBus', async () => {
    received.length = 0;

    const eventId = await recordEvent(db, {
      type: 'extraction.done',
      projectId: 'proj_e2e',
      conversationId: 'conv_e2e_a',
      payload: { source: 'mcp', draft_id: 'draft_e2e_1' },
    });

    expect(eventId).toBeTypeOf('bigint');

    const events = await waitFor('extraction.done', 1);
    expect(events.length).toBeGreaterThanOrEqual(1);
    const ev = events[0];
    expect(ev.projectId).toBe('proj_e2e');
    expect(ev.conversationId).toBe('conv_e2e_a');
    expect((ev.payload as Record<string, unknown>).source).toBe('mcp');
    expect((ev.payload as Record<string, unknown>).draft_id).toBe('draft_e2e_1');
    expect((ev.payload as Record<string, unknown>).event_id).toBe(eventId.toString());
  });

  it('Path B — conversation rename trigger fires conversation.renamed', async () => {
    received.length = 0;

    const project = await insertProject(db, { name: 'E2E Sync' });
    const conv = await insertConversation(db, {
      projectId: project.projectId,
      title: 'untitled',
    });
    // Subscribe to this conversation room dynamically
    const convRoom = `room:${conv.conversationId}`;
    eventBus.on(convRoom, broadcastListener);

    const written = await setAliasIfNull(db, conv.conversationId, 'first_alias');
    expect(written).toBe('first_alias');

    const events = await waitFor('conversation.renamed', 1);
    eventBus.off(convRoom, broadcastListener);

    expect(events.length).toBeGreaterThanOrEqual(1);
    const renameEvent = events.find((e) => e.conversationId === conv.conversationId);
    expect(renameEvent).toBeDefined();
    expect((renameEvent!.payload as Record<string, unknown>).alias).toBe('first_alias');
    expect((renameEvent!.payload as Record<string, unknown>).previous_alias).toBeNull();
  });

  it('Path C — IS DISTINCT FROM guard prevents duplicate events on no-op UPDATE', async () => {
    received.length = 0;

    const project = await insertProject(db, { name: 'E2E Distinct' });
    eventBus.on(`room:project:${project.projectId}`, broadcastListener);

    const conv = await insertConversation(db, {
      projectId: project.projectId,
      title: 'untitled',
    });
    const convRoom = `room:${conv.conversationId}`;
    eventBus.on(convRoom, broadcastListener);

    // First alias set — should fire
    await setAliasIfNull(db, conv.conversationId, 'distinct_alias');
    await waitFor('conversation.renamed', 1);
    const initialCount = received.filter((e) => e.type === 'conversation.renamed').length;

    // Now do a no-op UPDATE — alias = same value — trigger should NOT fire
    await db.execute(
      sql`UPDATE conversations SET alias = ${'distinct_alias'} WHERE conversation_id = ${conv.conversationId}`
    );
    // Wait briefly to give any erroneous trigger time to fire
    await new Promise((r) => setTimeout(r, 250));
    const finalCount = received.filter((e) => e.type === 'conversation.renamed').length;

    eventBus.off(`room:project:${project.projectId}`, broadcastListener);
    eventBus.off(convRoom, broadcastListener);
    expect(finalCount).toBe(initialCount);
  });
});
