/**
 * yops-apply Operation
 *
 * Persists a batch of YOps to the log and syncs the materialised trees.
 * This is the first concrete Operation in the unified pipeline.
 *
 * Steps:
 *   persist — atomic transaction: insertYOpsLogEntry + syncYOpsToTrees
 */

import type { Operation, PipelineEvent } from '@t3x-dev/core';
import { insertYOpsLogEntry } from '@t3x-dev/storage';
import { syncYOpsToTrees } from '../lib/tree-state-sync';
import type { ApiPipelineContext } from './context';

export interface YopsApplyInput {
  conversationId: string;
  source: string; // 'pipeline' | 'manual' | 'answer' | 'collapse' | 'compress'
  turnHash?: string;
  yops: any[]; // YOp[] — use any[] to match current route behavior
}

export interface YopsApplyOutput {
  id: string;
  conversation_id: string;
  project_id: string;
  source: string;
  turn_hash: string | null;
  yops: any;
  created_at: string;
}

export const yopsApplyOp: Operation<YopsApplyInput, YopsApplyOutput> = {
  name: 'yops-apply',
  async *run(input: YopsApplyInput, ctx): AsyncGenerator<PipelineEvent, YopsApplyOutput> {
    const { conversationId, source, turnHash, yops } = input;
    const { db, projectId } = ctx as ApiPipelineContext;

    // persist: atomic transaction — insertYOpsLogEntry + syncYOpsToTrees
    yield { type: 'step_start', step: 'persist' };
    const record = await (db as any).transaction(async (tx: any) => {
      const rec = await insertYOpsLogEntry(tx, {
        conversationId,
        projectId,
        source,
        turnHash: turnHash ?? undefined,
        yops,
      });
      await syncYOpsToTrees(tx, conversationId, projectId);
      return rec;
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
    };
  },
};
