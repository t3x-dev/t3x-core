import type { AnyDB } from '@t3x-dev/storage';
import {
  createCommit,
  insertConversation,
  insertProject,
  insertYOpsLogEntry,
  supersedeActiveLLMSuggestions,
} from '@t3x-dev/storage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findUncommittedYOpsIds } from '../../lib/yops-commit-link';
import { setupTestDB, testData } from '../setup';

/**
 * P1 from the review on PR #890: `findUncommittedYOpsIds` previously
 * read the full yops_log, which meant superseded LLM suggestions could
 * still be picked up as commit candidates. Once committed, those
 * stale entries land in `commits.yops_log_ids` and `replayCommittedBaseline`
 * resurrects the replaced facts on every subsequent re-extract — a
 * silent, permanent contamination of the immutable baseline.
 *
 * These tests pin the active-only filter so a regression would fail
 * loudly at the storage boundary.
 */

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

describe('findUncommittedYOpsIds (post supersede integration)', () => {
  let mockDB: AnyDB;
  let cleanup: () => Promise<void>;
  let projectId: string;

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;
    const project = await insertProject(
      mockDB,
      testData.project({ name: 'commit-link supersede regression' })
    );
    projectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  async function freshConv(): Promise<string> {
    const conv = await insertConversation(
      mockDB,
      testData.conversation(projectId, { title: `commit-link ${Date.now()}` })
    );
    return conv.conversationId;
  }

  it('does NOT include superseded entries in the next-commit candidate set', async () => {
    const convId = await freshConv();
    // Round 1: an LLM suggestion that the user later rejects via re-extract.
    const oldSuggestion = await insertYOpsLogEntry(mockDB, {
      conversationId: convId,
      projectId,
      source: 'pipeline',
      yops: [llmOp('rejected_fact')],
    });
    // The user clicks Extract again. The actual flow inside
    // `yopsApplyOp.run` is: supersede first → insert new → tree sync,
    // all in one transaction. Mirror that order here so the test
    // exercises the real boundary, not a contrived state.
    await supersedeActiveLLMSuggestions(mockDB, convId);
    const newSuggestion = await insertYOpsLogEntry(mockDB, {
      conversationId: convId,
      projectId,
      source: 'pipeline',
      yops: [llmOp('current_fact')],
    });
    // The user adds a manual edit on top of the new suggestion before
    // committing.
    const manualEdit = await insertYOpsLogEntry(mockDB, {
      conversationId: convId,
      projectId,
      source: 'manual',
      yops: [humanOp('user_added_slot')],
    });

    const ids = await findUncommittedYOpsIds(mockDB, convId, projectId);

    // The old suggestion is replaceable suggestion state — never a
    // commit candidate.
    expect(ids).not.toContain(oldSuggestion.id);
    // The fresh suggestion + manual edit are both active, both eligible
    // for the next commit.
    expect(ids.sort()).toEqual([newSuggestion.id, manualEdit.id].sort());
  });

  it('still excludes already-committed entries (regression for the existing contract)', async () => {
    const convId = await freshConv();
    const committedEntry = await insertYOpsLogEntry(mockDB, {
      conversationId: convId,
      projectId,
      source: 'pipeline',
      yops: [llmOp('baseline_fact')],
    });
    const draftEntry = await insertYOpsLogEntry(mockDB, {
      conversationId: convId,
      projectId,
      source: 'manual',
      yops: [humanOp('draft_only')],
    });
    await createCommit(mockDB, {
      author: { type: 'human', name: 'test' },
      content: { trees: [], relations: [] },
      project_id: projectId,
      message: 'baseline',
      yops_log_ids: [committedEntry.id],
    });

    const ids = await findUncommittedYOpsIds(mockDB, convId, projectId);

    expect(ids).toEqual([draftEntry.id]);
  });
});
