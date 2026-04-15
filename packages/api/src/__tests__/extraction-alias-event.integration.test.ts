/**
 * Integration test: setAliasIfNull → conversation.renamed trigger.
 *
 * Uses a real PGlite/Postgres DB so that the DB-level trigger runs. The
 * per-file extraction-pipeline-alias.test.ts mocks storage, so it cannot
 * verify that a trigger fires. This test covers that gap.
 */

import { type AnyDB, events, insertConversation, insertProject, setAliasIfNull } from '@t3x-dev/storage';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupTestDB } from './setup';

describe('setAliasIfNull → conversation.renamed event (trigger integration)', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const setup = await setupTestDB();
    db = setup.db;
    cleanup = setup.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('inserts a conversation.renamed row when alias goes from null to value', async () => {
    const project = await insertProject(db, { name: 'Alias Test' });
    const conv = await insertConversation(db, {
      projectId: project.projectId,
      title: 'untitled',
    });

    const written = await setAliasIfNull(db, conv.conversationId, 'first_alias');
    expect(written).toBe('first_alias');

    const matches = await db
      .select()
      .from(events)
      .where(
        and(
          eq(events.conversationId, conv.conversationId),
          eq(events.type, 'conversation.renamed')
        )
      );
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect((matches[0].payload as { alias: string }).alias).toBe('first_alias');
  });
});
