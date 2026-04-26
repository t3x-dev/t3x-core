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
 * the same DB transaction as the insert + sync. The supersede query
 * also acquires a per-project advisory transaction lock
 * (`pg_advisory_xact_lock`) on the way in, which is shared with
 * `createCommit`'s race-closing branch. The two paths serialise on
 * that lock for the duration of their respective transactions, so a
 * commit creation that references active yops_log_ids cannot
 * interleave with the supersede in a way that leaves a row both
 * committed AND marked superseded. Neither side alone is sufficient
 * — the contract lives in the pair.
 */

/** biome-ignore-all lint/suspicious/noExplicitAny: yops apply op persists dynamic logs through loosely typed DB transactions pending stricter repository types */

import type { Operation, PipelineEvent } from '@t3x-dev/core';
import { insertYOpsLogEntry, supersedeActiveLLMSuggestions } from '@t3x-dev/storage';
import { syncYOpsToTrees } from '../lib/tree-state-sync';
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

    yield { type: 'step_start', step: 'persist' };
    const { record, supersededIds } = await (db as any).transaction(async (tx: any) => {
      // Supersede + insert + tree sync all share one transaction.
      //
      // Concurrency contract is two-sided:
      //   - This UPDATE excludes commits visible at UPDATE time via
      //     its NOT EXISTS subquery against commits.yops_log_ids.
      //     Inside `supersedeActiveLLMSuggestions` we ALSO acquire the
      //     per-project advisory transaction lock first.
      //   - The other side — commit creation that references active
      //     yops_log_ids — acquires the same advisory lock in
      //     `createCommit` and re-validates `superseded_at IS NULL`
      //     before insert, throwing `SupersededYOpsLogIdsError` on
      //     conflict.
      //
      // Together those two paths serialise the critical section and
      // make the "row both committed AND superseded" outcome
      // unreachable. Neither path alone is sufficient.
      const ids = replaceActiveLLMDraft
        ? await supersedeActiveLLMSuggestions(tx, conversationId)
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
