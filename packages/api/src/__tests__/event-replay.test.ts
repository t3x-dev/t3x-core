/**
 * replayEventsSince tests — real PGlite DB, no mocks.
 */
import { type AnyDB, recordEvent } from '@t3x-dev/storage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { replayEventsSince } from '../lib/event-replay';
import { setupTestDB } from './setup';

describe('replayEventsSince', () => {
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

  it('returns events with id > sinceId for given project', async () => {
    const id1 = await recordEvent(db, { type: 'commit.created', projectId: 'proj_r' });
    const id2 = await recordEvent(db, { type: 'draft.changed', projectId: 'proj_r' });
    await recordEvent(db, { type: 'commit.created', projectId: 'other' });

    const replayed = await replayEventsSince(db, {
      sinceId: id1,
      projectId: 'proj_r',
    });
    expect(replayed.map((e) => e.id)).toEqual([id2]);
    expect(replayed.every((e) => e.projectId === 'proj_r')).toBe(true);
  });

  it('filters by conversationId when provided', async () => {
    const id1 = await recordEvent(db, {
      type: 'draft.changed',
      projectId: 'proj_c',
      conversationId: 'conv_a',
    });
    await recordEvent(db, {
      type: 'draft.changed',
      projectId: 'proj_c',
      conversationId: 'conv_b',
    });

    const replayed = await replayEventsSince(db, {
      sinceId: id1 - 1n,
      projectId: 'proj_c',
      conversationId: 'conv_a',
    });
    expect(replayed.map((e) => e.id)).toEqual([id1]);
  });

  it('returns empty array when no events match', async () => {
    const id1 = await recordEvent(db, { type: 'commit.created', projectId: 'proj_e' });
    const replayed = await replayEventsSince(db, {
      sinceId: id1,
      projectId: 'proj_e',
    });
    expect(replayed).toEqual([]);
  });

  it('respects limit parameter', async () => {
    const idsBefore: bigint[] = [];
    for (let i = 0; i < 5; i++) {
      idsBefore.push(await recordEvent(db, { type: 'commit.created', projectId: 'proj_l' }));
    }
    const replayed = await replayEventsSince(db, {
      sinceId: idsBefore[0] - 1n,
      projectId: 'proj_l',
      limit: 3,
    });
    expect(replayed.length).toBe(3);
  });

  it('orders results by id ascending', async () => {
    const ids: bigint[] = [];
    for (let i = 0; i < 4; i++) {
      ids.push(await recordEvent(db, { type: 'commit.created', projectId: 'proj_o' }));
    }
    const replayed = await replayEventsSince(db, {
      sinceId: ids[0] - 1n,
      projectId: 'proj_o',
    });
    expect(replayed.map((e) => e.id)).toEqual(ids);
  });
});
