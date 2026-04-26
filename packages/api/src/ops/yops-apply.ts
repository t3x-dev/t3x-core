/**
 * yops-apply Operation
 *
 * Persists a batch of YOps to the log and syncs the materialised trees.
 * This is the first concrete Operation in the unified pipeline.
 *
 * Note: validation runs at commit time (commitOp), not on every edit.
 * This keeps edits fast — validate when you're ready to commit.
 *
 * Steps:
 *   persist — atomic transaction: (optional) supersedeActiveLLMSuggestions
 *             + insertYOpsLogEntry + syncYOpsToTrees
 *
 * When `replaceActiveLLMDraft: true`, the supersede step runs *inside*
 * the same DB transaction as the insert + sync. That's the atomicity
 * guarantee from the suggestion-vs-baseline RFC: a re-extract either
 * fully replaces the visible LLM draft or is a no-op — no half-state
 * where the new entry exists but the old suggestions are still active.
 */

/** biome-ignore-all lint/suspicious/noExplicitAny: yops apply op persists dynamic logs through loosely typed DB transactions pending stricter repository types */

import type { Operation, PipelineEvent } from '@t3x-dev/core';
import { insertYOpsLogEntry, supersedeActiveLLMSuggestions } from '@t3x-dev/storage';
import { syncYOpsToTrees } from '../lib/tree-state-sync';
import { listCommittedYOpsLogIds } from '../lib/yops-log-utils';
import type { ApiPipelineContext } from './context';

export interface YopsApplyInput {
  conversationId: string;
  source: string; // 'pipeline' | 'manual' | 'answer' | 'collapse' | 'compress'
  turnHash?: string;
  yops: any[]; // YOp[] — use any[] to match current route behavior
  /**
   * When true, mark every active-draft LLM-sourced entry for this
   * conversation as superseded inside the same transaction as the
   * insert. HumanSource ops are never touched. Default false.
   */
  replaceActiveLLMDraft?: boolean;
}

export interface YopsApplyOutput {
  id: string;
  conversation_id: string;
  project_id: string;
  source: string;
  turn_hash: string | null;
  yops: any;
  created_at: string;
  /** IDs of entries marked superseded by this call (empty when the flag wasn't set). */
  superseded_ids: string[];
}

export const yopsApplyOp: Operation<YopsApplyInput, YopsApplyOutput> = {
  name: 'yops-apply',
  async *run(input: YopsApplyInput, ctx): AsyncGenerator<PipelineEvent, YopsApplyOutput> {
    const { conversationId, source, turnHash, yops, replaceActiveLLMDraft } = input;
    const { db, projectId } = ctx as ApiPipelineContext;

    // Committed-id list is read OUTSIDE the transaction because it
    // involves a join against the commits table — fine to be slightly
    // stale (a brand-new commit landing during this exact window is
    // implausible and the worst case is one extra entry surviving the
    // supersede, which the next re-extract corrects). Inside the
    // transaction we only do the targeted UPDATE + INSERT + sync.
    const committedIds = replaceActiveLLMDraft
      ? await listCommittedYOpsLogIds(db, conversationId)
      : [];

    yield { type: 'step_start', step: 'persist' };
    const { record, supersededIds } = await (db as any).transaction(async (tx: any) => {
      const ids = replaceActiveLLMDraft
        ? await supersedeActiveLLMSuggestions(tx, conversationId, committedIds)
        : [];
      const rec = await insertYOpsLogEntry(tx, {
        conversationId,
        projectId,
        source,
        turnHash: turnHash ?? undefined,
        yops,
      });
      await syncYOpsToTrees(tx, conversationId, projectId);
      return { record: rec, supersededIds: ids };
    });
    yield { type: 'step_done', step: 'persist' };

    return {
      id: record.id,
      conversation_id: record.conversationId,
      project_id: record.projectId,
      source: record.source,
      turn_hash: record.turnHash ?? null,
      yops: record.yops,
      created_at: record.createdAt.toISOString(),
      superseded_ids: supersededIds,
    };
  },
};
