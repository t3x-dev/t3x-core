import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { createCommit, SupersededYOpsLogIdsError } from '../queries/commits';
import { insertConversation } from '../queries/conversations';
import { insertProject } from '../queries/projects';
import {
  deleteYOpsLogEntry,
  getYOpsLogEntry,
  insertYOpsLogEntry,
  listActiveYOpsLogByConversation,
  listYOpsLogByConversation,
  supersedeActiveLLMSuggestions,
} from '../queries/yops-log';
import { createTestDB, sleep, testData } from './setup';

/**
 * Build a single sourced YOp suitable for `yops_log.yops` (which is an
 * array of ops constrained by `yops_log_source_required`). Tests don't
 * care about op semantics; they care about shape.
 */
const makeOp = (path: string) => ({
  define: { path },
  source: { type: 'human', author: 'test', at: '2026-04-25T00:00:00.000Z' },
});

describe('YOps Log Storage', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let testConversationId: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;

    const project = await insertProject(db, testData.project({ name: 'YOpsLog Test' }));
    testProjectId = project.projectId;

    const conv = await insertConversation(
      db,
      testData.conversation(testProjectId, { title: 'YL Conv' })
    );
    testConversationId = conv.conversationId;
  });

  afterAll(async () => {
    await cleanup();
  });

  // =========================================================================
  // insertYOpsLogEntry + getYOpsLogEntry
  // =========================================================================
  describe('insertYOpsLogEntry', () => {
    it('inserts and retrieves a yops log entry', async () => {
      const yops = [makeOp('TypeScript')];
      const entry = await insertYOpsLogEntry(db, {
        conversationId: testConversationId,
        projectId: testProjectId,
        source: 'pipeline',
        turnHash: 'sha256:abc123',
        yops,
      });

      expect(entry).toBeDefined();
      expect(entry.id).toMatch(/^yl_/);
      expect(entry.id.length).toBe(15); // "yl_" + 12 chars
      expect(entry.conversationId).toBe(testConversationId);
      expect(entry.projectId).toBe(testProjectId);
      expect(entry.source).toBe('pipeline');
      expect(entry.turnHash).toBe('sha256:abc123');
      expect(entry.yops).toEqual(yops);
      expect(entry.createdAt).toBeDefined();

      // Retrieve by ID
      const fetched = await getYOpsLogEntry(db, entry.id);
      expect(fetched).toBeDefined();
      expect(fetched!.id).toBe(entry.id);
      expect(fetched!.yops).toEqual(yops);
    });

    it('inserts entry without optional turnHash', async () => {
      const entry = await insertYOpsLogEntry(db, {
        conversationId: testConversationId,
        projectId: testProjectId,
        source: 'manual',
        yops: [makeOp('removed')],
      });

      expect(entry.turnHash).toBeNull();
      expect(entry.source).toBe('manual');
    });

    it('generates unique IDs with yl_ prefix', async () => {
      const entry1 = await insertYOpsLogEntry(db, {
        conversationId: testConversationId,
        projectId: testProjectId,
        source: 'manual',
        yops: [makeOp('a')],
      });
      const entry2 = await insertYOpsLogEntry(db, {
        conversationId: testConversationId,
        projectId: testProjectId,
        source: 'manual',
        yops: [makeOp('b')],
      });

      expect(entry1.id).toMatch(/^yl_/);
      expect(entry2.id).toMatch(/^yl_/);
      expect(entry1.id).not.toBe(entry2.id);
    });

    it('preserves source field correctly', async () => {
      for (const source of ['pipeline', 'manual', 'answer', 'collapse']) {
        const entry = await insertYOpsLogEntry(db, {
          conversationId: testConversationId,
          projectId: testProjectId,
          source,
          yops: [makeOp(`src_${source}`)],
        });
        expect(entry.source).toBe(source);
      }
    });
  });

  // =========================================================================
  // getYOpsLogEntry
  // =========================================================================
  describe('getYOpsLogEntry', () => {
    it('returns undefined for non-existent ID', async () => {
      const result = await getYOpsLogEntry(db, 'yl_nonexistent');
      expect(result).toBeUndefined();
    });
  });

  // =========================================================================
  // listYOpsLogByConversation
  // =========================================================================
  describe('listYOpsLogByConversation', () => {
    it('lists entries in chronological order (ASC)', async () => {
      // Create a second conversation for isolation
      const conv2 = await insertConversation(
        db,
        testData.conversation(testProjectId, { title: 'YL Conv 2' })
      );

      await insertYOpsLogEntry(db, {
        conversationId: conv2.conversationId,
        projectId: testProjectId,
        source: 'pipeline',
        yops: [makeOp('order_1')],
      });
      await sleep(10);
      await insertYOpsLogEntry(db, {
        conversationId: conv2.conversationId,
        projectId: testProjectId,
        source: 'manual',
        yops: [makeOp('order_2')],
      });
      await sleep(10);
      await insertYOpsLogEntry(db, {
        conversationId: conv2.conversationId,
        projectId: testProjectId,
        source: 'manual',
        yops: [makeOp('order_3')],
      });

      const list = await listYOpsLogByConversation(db, conv2.conversationId);
      expect(list.length).toBe(3);

      // Verify ASC order
      for (let i = 1; i < list.length; i++) {
        expect(new Date(list[i - 1].createdAt!).getTime()).toBeLessThanOrEqual(
          new Date(list[i].createdAt!).getTime()
        );
      }

      // Verify content order — first op's path encodes the insertion order
      const firstOp = (list[0].yops as Array<{ define: { path: string } }>)[0];
      const lastOp = (list[2].yops as Array<{ define: { path: string } }>)[0];
      expect(firstOp.define.path).toBe('order_1');
      expect(lastOp.define.path).toBe('order_3');
    });

    it('returns empty array for conversation with no entries', async () => {
      const conv3 = await insertConversation(
        db,
        testData.conversation(testProjectId, { title: 'YL Conv Empty' })
      );
      const list = await listYOpsLogByConversation(db, conv3.conversationId);
      expect(list).toEqual([]);
    });
  });

  // =========================================================================
  // deleteYOpsLogEntry
  // =========================================================================
  describe('deleteYOpsLogEntry', () => {
    it('deletes an entry and returns the deleted record', async () => {
      const entry = await insertYOpsLogEntry(db, {
        conversationId: testConversationId,
        projectId: testProjectId,
        source: 'manual',
        yops: [makeOp('to_delete')],
      });

      const deleted = await deleteYOpsLogEntry(db, entry.id);
      expect(deleted).toBeDefined();
      expect(deleted!.id).toBe(entry.id);

      // Verify it no longer exists
      const fetched = await getYOpsLogEntry(db, entry.id);
      expect(fetched).toBeUndefined();
    });

    it('returns undefined for non-existent ID', async () => {
      const result = await deleteYOpsLogEntry(db, 'yl_nonexistent');
      expect(result).toBeUndefined();
    });
  });

  // =========================================================================
  // Suggestion-vs-baseline (RFC 2026-04-26): superseded_at column behavior
  // =========================================================================
  describe('supersedeActiveLLMSuggestions + listActiveYOpsLogByConversation', () => {
    /**
     * Each test creates its own conversation so timestamps and IDs don't
     * bleed across cases. Using the suite-level conversation would mix
     * entries from earlier tests into the supersede candidate set.
     */
    async function freshConv(): Promise<string> {
      const conv = await insertConversation(
        db,
        testData.conversation(testProjectId, { title: `Supersede ${Date.now()}` })
      );
      return conv.conversationId;
    }

    const llmOp = (path: string) => ({
      define: { path },
      source: {
        type: 'llm' as const,
        model: 'claude-sonnet-4-6',
        at: '2026-04-26T00:00:00.000Z',
        turn_ref: { turn_hash: 'sha256:t1', quote: 'q' },
      },
    });

    const humanOp = (path: string) => ({
      define: { path },
      source: { type: 'human' as const, author: 'test', at: '2026-04-26T00:00:00.000Z' },
    });

    it('marks LLM-sourced active entries superseded; preserves HumanSource entries', async () => {
      const convId = await freshConv();
      const llmEntry = await insertYOpsLogEntry(db, {
        conversationId: convId,
        projectId: testProjectId,
        source: 'pipeline',
        yops: [llmOp('foo')],
      });
      const humanEntry = await insertYOpsLogEntry(db, {
        conversationId: convId,
        projectId: testProjectId,
        source: 'manual',
        yops: [humanOp('bar')],
      });

      const supersededIds = await supersedeActiveLLMSuggestions(db, convId);

      expect(supersededIds).toEqual([llmEntry.id]);
      const llm = await getYOpsLogEntry(db, llmEntry.id);
      const human = await getYOpsLogEntry(db, humanEntry.id);
      expect(llm?.supersededAt).toBeInstanceOf(Date);
      // Manual edits are explicitly preserved by the v1 contract — the
      // RFC's load-bearing rule is that Extract has no authority to
      // overwrite HumanSource ops.
      expect(human?.supersededAt).toBeNull();
    });

    it('preserves mixed rows (any HumanSource op present → row stays active)', async () => {
      // The drift `keep_both_together` handler in tree-answer.openapi.ts
      // bundles LLM-extracted ops together with a deterministic
      // server-side `relate` op carrying a HumanSource into the same
      // yops_log row. An "any-LLM-op" supersede rule would silently
      // discard the user's relation choice on the next re-extract —
      // P2 from the review on this PR. The supersede must operate at
      // row granularity: a row with at least one HumanSource op stays
      // active in its entirety.
      const convId = await freshConv();
      const mixedEntry = await insertYOpsLogEntry(db, {
        conversationId: convId,
        projectId: testProjectId,
        source: 'collapse',
        yops: [llmOp('extracted_root'), humanOp('relate_decision')],
      });
      const pureLlmEntry = await insertYOpsLogEntry(db, {
        conversationId: convId,
        projectId: testProjectId,
        source: 'pipeline',
        yops: [llmOp('only_llm')],
      });

      const supersededIds = await supersedeActiveLLMSuggestions(db, convId);

      // Only the all-LLM row is marked. The mixed row survives untouched.
      expect(supersededIds).toEqual([pureLlmEntry.id]);
      const mixed = await getYOpsLogEntry(db, mixedEntry.id);
      const pure = await getYOpsLogEntry(db, pureLlmEntry.id);
      expect(mixed?.supersededAt).toBeNull();
      expect(pure?.supersededAt).toBeInstanceOf(Date);
    });

    it('atomically excludes committed entries via the SQL WHERE clause (no read-then-update race)', async () => {
      // Replaces the prior `excludeIds` parameter test. Committed
      // entries are excluded by the supersede query's own NOT EXISTS
      // subquery against commits.yops_log_ids — there is no caller-
      // facing parameter that a concurrent commit could miss.
      const convId = await freshConv();
      const committedEntry = await insertYOpsLogEntry(db, {
        conversationId: convId,
        projectId: testProjectId,
        source: 'pipeline',
        yops: [llmOp('committed_root')],
      });
      const draftEntry = await insertYOpsLogEntry(db, {
        conversationId: convId,
        projectId: testProjectId,
        source: 'pipeline',
        yops: [llmOp('draft_root')],
      });
      // Promote one entry to a real commit — this is the boundary the
      // supersede query treats as immutable baseline.
      await createCommit(db, {
        author: { type: 'human', name: 'test' },
        content: { trees: [], relations: [] },
        project_id: testProjectId,
        message: 'baseline',
        yops_log_ids: [committedEntry.id],
      });

      const supersededIds = await supersedeActiveLLMSuggestions(db, convId);

      expect(supersededIds).toEqual([draftEntry.id]);
      const committed = await getYOpsLogEntry(db, committedEntry.id);
      const draft = await getYOpsLogEntry(db, draftEntry.id);
      // Committed entry is part of the immutable baseline. Even though
      // its source.type === 'llm' and it would otherwise qualify, the
      // query must never touch it.
      expect(committed?.supersededAt).toBeNull();
      expect(draft?.supersededAt).toBeInstanceOf(Date);
    });

    it('is idempotent: a second call after the first leaves already-superseded rows untouched', async () => {
      const convId = await freshConv();
      const llmEntry = await insertYOpsLogEntry(db, {
        conversationId: convId,
        projectId: testProjectId,
        source: 'pipeline',
        yops: [llmOp('foo')],
      });

      const firstIds = await supersedeActiveLLMSuggestions(db, convId);
      const firstStamp = (await getYOpsLogEntry(db, llmEntry.id))?.supersededAt;
      await sleep(10);
      const secondIds = await supersedeActiveLLMSuggestions(db, convId);
      const secondStamp = (await getYOpsLogEntry(db, llmEntry.id))?.supersededAt;

      expect(firstIds).toEqual([llmEntry.id]);
      expect(secondIds).toEqual([]);
      expect(firstStamp?.getTime()).toBe(secondStamp?.getTime());
    });

    it('createCommit and supersede serialise on the per-project advisory lock (no superseded-AND-committed outcome)', async () => {
      // The actual race the prior reviewer flagged: a re-extract running
      // in parallel with createCommit, after the caller's
      // findUncommittedYOpsIds snapshot. Without serialisation, the
      // supersede UPDATE could land between createCommit's check and
      // its INSERT, freezing now-superseded ids into the baseline.
      // With the per-project advisory transaction lock: whichever
      // path acquires the lock first runs to completion; the other
      // waits and then operates against the committed result.
      //
      // Note: this test calls supersedeActiveLLMSuggestions(db, ...)
      // with a plain db handle. The function internally wraps in a
      // transaction (and its enforcement of that wrap is what makes
      // the advisory lock meaningful), so the lock is acquired
      // correctly here.
      const convId = await freshConv();
      const targetEntry = await insertYOpsLogEntry(db, {
        conversationId: convId,
        projectId: testProjectId,
        source: 'pipeline',
        yops: [llmOp('contested_fact')],
      });

      // Race two independent transactions, each acquiring the same
      // per-project advisory lock at the start of its critical section.
      const commitPromise = createCommit(db, {
        author: { type: 'human', name: 'test' },
        content: { trees: [], relations: [] },
        project_id: testProjectId,
        message: 'concurrent-with-supersede',
        yops_log_ids: [targetEntry.id],
      });

      // Either:
      //   (a) supersede acquires the advisory lock FIRST: it marks the
      //       row superseded, releases the lock at tx commit. commit
      //       acquires the lock, post-lock SELECT sees superseded_at
      //       != NULL, throws SupersededError.
      //   (b) commit acquires the lock FIRST: it inserts, releases at
      //       tx commit. supersede acquires the lock, runs UPDATE; the
      //       NOT EXISTS subquery now sees the new commits row,
      //       excludes the id.
      // Both outcomes preserve the invariant. The bug we're guarding
      // against would be a third outcome — both succeed and the row
      // ends up both superseded AND in baseline.
      const supersedePromise = supersedeActiveLLMSuggestions(db, convId);
      const [commitResult, supersededIds] = await Promise.allSettled([
        commitPromise,
        supersedePromise,
      ]);

      const finalEntry = await getYOpsLogEntry(db, targetEntry.id);

      if (commitResult.status === 'fulfilled') {
        // Outcome (b): commit succeeded → row must NOT be superseded
        // (the FOR SHARE blocked the UPDATE; after release, the
        // NOT EXISTS subquery excluded the now-committed row).
        expect(finalEntry?.supersededAt).toBeNull();
        if (supersededIds.status === 'fulfilled') {
          expect(supersededIds.value).not.toContain(targetEntry.id);
        }
      } else {
        // Outcome (a): commit threw SupersededError → row must BE
        // superseded.
        expect(commitResult.reason).toBeInstanceOf(SupersededYOpsLogIdsError);
        expect(finalEntry?.supersededAt).toBeInstanceOf(Date);
      }
    });

    it('createCommit refuses yops_log_ids that have been superseded since the caller fetched them', async () => {
      // Defense in depth against the residual concurrency race the
      // review on this PR flagged: a re-extract can supersede ids
      // between a commit caller's `findUncommittedYOpsIds` snapshot
      // and the actual commit insert. Without this guard those ids
      // would land in `commits.yops_log_ids` and `replayCommittedBaseline`
      // would resurrect the replaced facts forever.
      const convId = await freshConv();
      const llmEntry = await insertYOpsLogEntry(db, {
        conversationId: convId,
        projectId: testProjectId,
        source: 'pipeline',
        yops: [llmOp('replaced_fact')],
      });
      // Simulate the re-extract supersede landing between
      // findUncommittedYOpsIds and createCommit.
      await supersedeActiveLLMSuggestions(db, convId);

      await expect(
        createCommit(db, {
          author: { type: 'human', name: 'test' },
          content: { trees: [], relations: [] },
          project_id: testProjectId,
          message: 'race condition',
          yops_log_ids: [llmEntry.id],
        })
      ).rejects.toBeInstanceOf(SupersededYOpsLogIdsError);
    });

    it('listActiveYOpsLogByConversation excludes superseded rows; full-list query still returns them', async () => {
      const convId = await freshConv();
      const llmEntry = await insertYOpsLogEntry(db, {
        conversationId: convId,
        projectId: testProjectId,
        source: 'pipeline',
        yops: [llmOp('foo')],
      });
      const humanEntry = await insertYOpsLogEntry(db, {
        conversationId: convId,
        projectId: testProjectId,
        source: 'manual',
        yops: [humanOp('bar')],
      });

      await supersedeActiveLLMSuggestions(db, convId);

      const active = await listActiveYOpsLogByConversation(db, convId);
      const all = await listYOpsLogByConversation(db, convId);

      expect(active.map((e) => e.id)).toEqual([humanEntry.id]);
      // The audit / GET-all path still surfaces the superseded entry —
      // history must remain readable.
      expect(all.map((e) => e.id).sort()).toEqual([llmEntry.id, humanEntry.id].sort());
    });
  });
});
