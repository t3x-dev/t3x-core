/**
 * Squash E2E Test — Full replay-based squash lifecycle.
 *
 * Creates commits incrementally with YOps, then squashes them,
 * verifying replay correctness and superseded filtering.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyYOps, extractOpsFromEntries, verifyReplay } from '@t3x-dev/core';
import type { SemanticContent } from '@t3x-dev/core';
import type { AnyDB } from '../adapters';
import { collectYOpsForCommitRange, createCommit, listCommits } from '../queries/commits';
import { insertRewrite, isCommitSuperseded, listRewrites } from '../queries/commit-rewrites';
import { getYOpsForCommit, insertYOpsLogEntry } from '../queries/yops-log';
import { insertConversation } from '../queries/conversations';
import { insertProject } from '../queries/projects';
import { createTestDB, testData } from './setup';

describe('Squash E2E', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;
  let projectId: string;
  let conversationId: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;
    const project = await insertProject(db, testData.project({ name: 'Squash E2E' }));
    projectId = project.projectId;
    const conversation = await insertConversation(db, testData.conversation(projectId, { title: 'Squash Conv' }));
    conversationId = conversation.conversationId;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('full squash cycle: 3 commits → 1', async () => {
    // 1. Create yops log entries (simulating extraction pipeline)
    const yl1 = await insertYOpsLogEntry(db, {
      conversationId,
      projectId,
      source: 'pipeline',
      yops: [{ add: { parent: '', node: { trip: { budget: 5000 } }, source: { budget: 'about 5k' }, from: 'T1' } }],
    });
    const yl2 = await insertYOpsLogEntry(db, {
      conversationId,
      projectId,
      source: 'pipeline',
      yops: [{ set: { path: 'trip/style', value: 'casual', source: 'casual style', from: 'T2' } }],
    });
    const yl3 = await insertYOpsLogEntry(db, {
      conversationId,
      projectId,
      source: 'pipeline',
      yops: [{ set: { path: 'trip/duration', value: 7, source: 'seven days', from: 'T3' } }],
    });

    // 2. Build commits incrementally (each commit applies its yops to previous state)
    const base: SemanticContent = { trees: [], relations: [] };

    const r1 = applyYOps(base, [{ add: { parent: '', node: { trip: { budget: 5000 } }, source: { budget: 'about 5k' }, from: 'T1' } }]);
    const c1 = await createCommit(db, {
      author: { type: 'human', name: 'test' },
      content: { trees: r1.trees, relations: r1.relations },
      project_id: projectId,
      message: 'c1: add trip',
      branch: 'main',
      yops_log_ids: [yl1.id],
    });

    const r2 = applyYOps({ trees: r1.trees, relations: r1.relations }, [{ set: { path: 'trip/style', value: 'casual', source: 'casual style', from: 'T2' } }]);
    const c2 = await createCommit(db, {
      author: { type: 'human', name: 'test' },
      content: { trees: r2.trees, relations: r2.relations },
      project_id: projectId,
      parents: [c1.hash],
      message: 'c2: add style',
      branch: 'main',
      yops_log_ids: [yl2.id],
    });

    const r3 = applyYOps({ trees: r2.trees, relations: r2.relations }, [{ set: { path: 'trip/duration', value: 7, source: 'seven days', from: 'T3' } }]);
    const c3 = await createCommit(db, {
      author: { type: 'human', name: 'test' },
      content: { trees: r3.trees, relations: r3.relations },
      project_id: projectId,
      parents: [c2.hash],
      message: 'c3: add duration',
      branch: 'main',
      yops_log_ids: [yl3.id],
    });

    // 3. Collect ops from range
    const allYopsIds = await collectYOpsForCommitRange(db, [c1.hash, c2.hash, c3.hash]);
    expect(allYopsIds).toEqual([yl1.id, yl2.id, yl3.id]);

    // 4. Fetch yops entries and extract ops
    const entries = await getYOpsForCommit(db, allYopsIds);
    const ops = extractOpsFromEntries(entries.map((e) => ({ id: e.id, yops: e.yops })));
    expect(ops).toHaveLength(3);

    // 5. Verify replay matches c3's content
    const verification = verifyReplay(base, ops, c3.content);
    expect(verification.match).toBe(true);
    expect(verification.opsApplied).toBe(3);

    // 6. Create squashed commit
    const squashed = await createCommit(db, {
      parents: [],
      author: { type: 'human', name: 'test' },
      content: verification.replayedContent,
      project_id: projectId,
      message: 'Squash 3 commits',
      branch: 'main',
      provenance: { method: 'squash', source_commits: [c1.hash, c2.hash, c3.hash] },
      yops_log_ids: allYopsIds,
    });

    // 7. Record rewrite
    const rw = await insertRewrite(db, {
      projectId,
      branch: 'main',
      operation: 'squash',
      sourceHashes: [c1.hash, c2.hash, c3.hash],
      resultHash: squashed.hash,
      baseHash: null,
      opsReplayed: 3,
      yopsLogIds: allYopsIds,
      author: { type: 'human', name: 'test' },
    });
    expect(rw.sourceHashes).toEqual([c1.hash, c2.hash, c3.hash]);

    // 8. Verify squashed commit content
    const tripTree = squashed.content.trees.find((t) => t.key === 'trip');
    expect(tripTree).toBeDefined();
    expect(tripTree!.slots.budget).toBe(5000);
    expect(tripTree!.slots.style).toBe('casual');
    expect(tripTree!.slots.duration).toBe(7);
    expect(squashed.yops_log_ids).toEqual(allYopsIds);

    // 9. Verify superseded filtering
    const activeCommits = await listCommits(db, { projectId });
    const activeHashes = activeCommits.map((c) => c.hash);
    expect(activeHashes).not.toContain(c1.hash);
    expect(activeHashes).not.toContain(c2.hash);
    expect(activeHashes).not.toContain(c3.hash);
    expect(activeHashes).toContain(squashed.hash);

    // 10. Verify includeSuperseded works
    const allCommits = await listCommits(db, { projectId, includeSuperseded: true });
    expect(allCommits.length).toBeGreaterThan(activeCommits.length);

    // 11. Verify isCommitSuperseded
    expect(await isCommitSuperseded(db, projectId, c1.hash)).toBe(true);
    expect(await isCommitSuperseded(db, projectId, squashed.hash)).toBe(false);

    // 12. Verify rewrite log
    const rewrites = await listRewrites(db, projectId);
    const squashRewrites = rewrites.filter((r) => r.resultHash === squashed.hash);
    expect(squashRewrites).toHaveLength(1);
    expect(squashRewrites[0].opsReplayed).toBe(3);
  });

  it('replay mismatch is detected when content diverges', async () => {
    // Create a yops entry
    const yl = await insertYOpsLogEntry(db, {
      conversationId,
      projectId,
      source: 'pipeline',
      yops: [{ add: { parent: '', node: { food: { type: 'pizza' } }, source: { type: 'pizza' }, from: 'T1' } }],
    });

    // Create commit with DIFFERENT content than what the ops would produce
    const c1 = await createCommit(db, {
      author: { type: 'human', name: 'test' },
      content: { trees: [{ key: 'food', slots: { type: 'sushi' }, children: [] }], relations: [] },
      project_id: projectId,
      message: 'tampered',
      branch: 'main',
      yops_log_ids: [yl.id],
    });

    // Verify replay detects the mismatch
    const entries = await getYOpsForCommit(db, [yl.id]);
    const ops = extractOpsFromEntries(entries.map((e) => ({ id: e.id, yops: e.yops })));
    const base: SemanticContent = { trees: [], relations: [] };

    const verification = verifyReplay(base, ops, c1.content);
    expect(verification.match).toBe(false);
    expect(verification.mismatch).toBeDefined();
  });
});
