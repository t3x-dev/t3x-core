/**
 * cleanupOldEvents tests
 *
 * Verifies the 7-day retention job deletes stale events from the outbox and
 * leaves fresh events untouched.
 */

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { recordEvent } from '../events';
import { cleanupOldEvents } from '../jobs/cleanup-events';
import { events } from '../schema-events';
import { createTestDB } from './setup';

describe('cleanupOldEvents', () => {
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

  it('deletes events older than retentionDays', async () => {
    const id = await recordEvent(db, {
      type: 'commit.created',
      projectId: 'proj_cleanup_a',
    });

    // Backdate to 10 days old
    await (db as unknown as { execute: (q: unknown) => Promise<unknown> }).execute(
      sql`UPDATE events SET created_at = NOW() - INTERVAL '10 days' WHERE id = ${id}`,
    );

    const deleted = await cleanupOldEvents(db, { retentionDays: 7 });
    expect(deleted).toBeGreaterThan(0);

    const remaining = await db
      .select()
      .from(events)
      .where(sql`project_id = 'proj_cleanup_a'`);
    expect(remaining.length).toBe(0);
  });

  it('keeps events newer than retentionDays', async () => {
    await recordEvent(db, {
      type: 'commit.created',
      projectId: 'proj_cleanup_b',
    });

    await cleanupOldEvents(db, { retentionDays: 7 });

    const remaining = await db
      .select()
      .from(events)
      .where(sql`project_id = 'proj_cleanup_b'`);
    expect(remaining.length).toBeGreaterThan(0);
  });

  it('uses default retentionDays of 7 when not specified', async () => {
    const id = await recordEvent(db, {
      type: 'commit.created',
      projectId: 'proj_cleanup_c',
    });
    await (db as unknown as { execute: (q: unknown) => Promise<unknown> }).execute(
      sql`UPDATE events SET created_at = NOW() - INTERVAL '8 days' WHERE id = ${id}`,
    );

    await cleanupOldEvents(db);

    const remaining = await db
      .select()
      .from(events)
      .where(sql`project_id = 'proj_cleanup_c'`);
    expect(remaining.length).toBe(0);
  });
});
