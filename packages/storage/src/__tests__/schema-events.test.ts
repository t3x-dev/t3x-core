/**
 * Events Outbox Schema Tests
 *
 * Verifies INSERT/SELECT round-trip and monotonically-increasing id
 * (BIGSERIAL) on the events outbox table.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { events } from '../schema-events';
import { createTestDB } from './setup';

describe('events table', () => {
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

  it('can INSERT and SELECT an event', async () => {
    const [row] = await db
      .insert(events)
      .values({
        type: 'commit.created',
        projectId: 'proj_test',
        conversationId: 'conv_test',
        payload: { hello: 'world' },
      })
      .returning();

    expect(typeof row.id).toBe('bigint');
    expect(row.type).toBe('commit.created');
    expect(row.projectId).toBe('proj_test');
    expect(row.conversationId).toBe('conv_test');
    expect(row.payload).toEqual({ hello: 'world' });
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  it('id is monotonically increasing', async () => {
    const [a] = await db
      .insert(events)
      .values({ type: 'x', projectId: 'p' })
      .returning();
    const [b] = await db
      .insert(events)
      .values({ type: 'x', projectId: 'p' })
      .returning();
    expect(b.id > a.id).toBe(true);
  });
});
