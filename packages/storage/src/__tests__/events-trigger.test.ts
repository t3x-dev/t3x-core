/**
 * Event trigger integration tests.
 *
 * Verifies that CRUD on core tables automatically inserts into the
 * `events` outbox table. See
 * docs/superpowers/plans/2026-04-15-realtime-sync-mcp.md.
 */

import { asc, eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { createCommit } from '../queries/commits';
import { insertConversation, renameConversation } from '../queries/conversations';
import { insertDraft, updateDraft } from '../queries/drafts';
import { insertProject } from '../queries/projects';
import { insertYOpsLogEntry } from '../queries/yops-log';
import { events } from '../schema-events';
import { createTestDB, testData } from './setup';

describe('event triggers', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;
  let projectId: string;

  beforeEach(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;
    const project = await insertProject(db, testData.project({ name: 'Trigger Test' }));
    projectId = project.projectId;
  });

  afterEach(async () => {
    await cleanup();
  });

  it('INSERT on commits produces commit.created event', async () => {
    const commit = await createCommit(db, {
      author: { type: 'human', name: 'test' },
      content: { trees: [{ key: 'root', slots: { v: '1' }, children: [] }], relations: [] },
      project_id: projectId,
      message: 'trigger test commit',
      branch: 'main',
    });

    const rows = await db
      .select()
      .from(events)
      .where(eq(events.projectId, projectId))
      .orderBy(asc(events.id));

    const commitEvent = rows.find((r) => r.type === 'commit.created');
    expect(commitEvent).toBeDefined();
    expect(commitEvent!.projectId).toBe(projectId);
    const payload = commitEvent!.payload as { hash: string; branch: string };
    expect(payload.hash).toBe(commit.hash);
    expect(payload.branch).toBe('main');
  });

  it('UPDATE on conversations.alias produces conversation.renamed event', async () => {
    const conv = await insertConversation(db, { projectId, title: 'Original' });
    // renameConversation from null → 'foo'
    await renameConversation(db, conv.conversationId, 'foo');
    // rename again 'foo' → 'bar' to get a previous_alias value as well
    await renameConversation(db, conv.conversationId, 'bar');

    const rows = await db
      .select()
      .from(events)
      .where(eq(events.projectId, projectId))
      .orderBy(asc(events.id));

    const renames = rows.filter((r) => r.type === 'conversation.renamed');
    expect(renames.length).toBe(2);

    const first = renames[0].payload as { alias: string; previous_alias: string | null };
    expect(first.alias).toBe('foo');
    expect(first.previous_alias).toBeNull();

    const second = renames[1].payload as { alias: string; previous_alias: string | null };
    expect(second.alias).toBe('bar');
    expect(second.previous_alias).toBe('foo');

    // conversation_id column populated
    expect(renames[0].conversationId).toBe(conv.conversationId);
  });

  it('INSERT on yops_log produces yops.applied event', async () => {
    const conv = await insertConversation(db, { projectId, title: 'YOps Conv' });
    const yopsArray = [
      { op: 'create_tree', key: 'root' },
      { op: 'set_slot', key: 'root', slot: 'v', value: '1' },
    ];
    const entry = await insertYOpsLogEntry(db, {
      conversationId: conv.conversationId,
      projectId,
      source: 'test',
      yops: yopsArray,
    });

    const rows = await db
      .select()
      .from(events)
      .where(eq(events.projectId, projectId))
      .orderBy(asc(events.id));

    const yopsEvent = rows.find((r) => r.type === 'yops.applied');
    expect(yopsEvent).toBeDefined();
    expect(yopsEvent!.conversationId).toBe(conv.conversationId);
    const payload = yopsEvent!.payload as { yops_log_id: string; op_count: number };
    expect(payload.yops_log_id).toBe(entry.id);
    expect(payload.op_count).toBe(2);
  });

  it('UPDATE on drafts (updated_at change) produces draft.changed event', async () => {
    const draft = await insertDraft(db, {
      project_id: projectId,
      title: 'Trigger Draft',
    });

    // Clear any events from the insert path (none expected; insert has no trigger)
    await updateDraft(db, draft.id, { title: 'Renamed Draft' }, draft.revision);

    const rows = await db
      .select()
      .from(events)
      .where(eq(events.projectId, projectId))
      .orderBy(asc(events.id));

    const draftEvents = rows.filter((r) => r.type === 'draft.changed');
    expect(draftEvents.length).toBe(1);
    const payload = draftEvents[0].payload as { draft_id: string; revision: number };
    expect(payload.draft_id).toBe(draft.id);
    // updateDraft increments revision by 1 (starts at 1 on insert → 2 after one update)
    expect(payload.revision).toBe(draft.revision + 1);
  });

  it('UPDATE on drafts without updated_at change does NOT fire draft.changed', async () => {
    const draft = await insertDraft(db, {
      project_id: projectId,
      title: 'No-op Draft',
    });

    const before = await db.select().from(events).where(eq(events.projectId, projectId));

    // Raw UPDATE that sets updated_at to the same value — IS DISTINCT FROM is false,
    // so the trigger body must be skipped.
    await db.execute(sql`UPDATE drafts SET updated_at = updated_at WHERE id = ${draft.id}`);

    const after = await db.select().from(events).where(eq(events.projectId, projectId));

    expect(after.length).toBe(before.length);
    expect(after.filter((r) => r.type === 'draft.changed').length).toBe(0);
  });

  it('UPDATE on conversations without alias change does NOT fire conversation.renamed', async () => {
    const conv = await insertConversation(db, { projectId, title: 'Same Alias' });
    await renameConversation(db, conv.conversationId, 'stable');

    // Raw UPDATE that rewrites alias to the same value — IS DISTINCT FROM is false.
    await db.execute(
      sql`UPDATE conversations SET alias = alias WHERE conversation_id = ${conv.conversationId}`
    );

    const rows = await db
      .select()
      .from(events)
      .where(eq(events.projectId, projectId))
      .orderBy(asc(events.id));

    const renames = rows.filter((r) => r.type === 'conversation.renamed');
    // Only the initial null → 'stable' rename should have fired.
    expect(renames.length).toBe(1);
    const payload = renames[0].payload as { alias: string; previous_alias: string | null };
    expect(payload.alias).toBe('stable');
  });
});
