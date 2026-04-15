/**
 * recordEvent helper tests
 *
 * Verifies the only supported application-level entry point for emitting
 * realtime events (see packages/storage/src/events.ts).
 */

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { ALLOWED_EVENT_TYPES, recordEvent } from '../events';
import { events } from '../schema-events';
import { createTestDB } from './setup';

describe('recordEvent', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('inserts an event row with typed payload', async () => {
    const id = await recordEvent(db, {
      type: 'extraction.done',
      projectId: 'proj_a',
      conversationId: 'conv_a',
      payload: { nodeCount: 42 },
    });

    const [row] = await db.select().from(events).where(eq(events.id, id));
    expect(row.type).toBe('extraction.done');
    expect(row.projectId).toBe('proj_a');
    expect(row.conversationId).toBe('conv_a');
    expect(row.payload).toEqual({ nodeCount: 42 });
  });

  it('whitelist contains all expected event types', () => {
    expect(ALLOWED_EVENT_TYPES).toContain('commit.created');
    expect(ALLOWED_EVENT_TYPES).toContain('draft.changed');
    expect(ALLOWED_EVENT_TYPES).toContain('yops.applied');
    expect(ALLOWED_EVENT_TYPES).toContain('conversation.renamed');
    expect(ALLOWED_EVENT_TYPES).toContain('extraction.started');
    expect(ALLOWED_EVENT_TYPES).toContain('extraction.done');
    expect(ALLOWED_EVENT_TYPES).toHaveLength(6);
  });

  it('accepts null conversationId for project-level events', async () => {
    const id = await recordEvent(db, {
      type: 'commit.created',
      projectId: 'proj_b',
      conversationId: null,
    });
    expect(typeof id).toBe('bigint');
  });

  it('accepts omitted conversationId (treated as null)', async () => {
    const id = await recordEvent(db, {
      type: 'commit.created',
      projectId: 'proj_c',
    });
    const [row] = await db.select().from(events).where(eq(events.id, id));
    expect(row.conversationId).toBeNull();
  });

  it('accepts omitted payload (treated as null)', async () => {
    const id = await recordEvent(db, {
      type: 'commit.created',
      projectId: 'proj_d',
    });
    const [row] = await db.select().from(events).where(eq(events.id, id));
    expect(row.payload).toBeNull();
  });

  it('rejects unknown event types at compile time', () => {
    // Smoke test: the EventType union must refuse strings outside the whitelist.
    // If this starts compiling, the whitelist type has regressed to `string`.
    // @ts-expect-error — 'presence.join' is intentionally excluded (ephemeral)
    void (async () => recordEvent(db, { type: 'presence.join', projectId: 'proj_x' }));
    // @ts-expect-error — arbitrary strings must not be accepted
    void (async () => recordEvent(db, { type: 'not.a.real.event', projectId: 'proj_x' }));
  });
});
