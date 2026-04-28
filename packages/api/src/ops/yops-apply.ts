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

import {
  applyYOps,
  extractOpsFromEntries,
  type Operation,
  type PipelineEvent,
  type SemanticContent,
  type YOp,
} from '@t3x-dev/core';
import {
  insertYOpsLogEntry,
  supersedeActiveLLMSuggestions,
  supersedeActiveUncommittedYOpsLogEntries,
  supersedeYOpsLogEntryForRepair,
} from '@t3x-dev/storage';
import { syncYOpsToTrees } from '../lib/tree-state-sync';
import { replayActiveDraftOnBaseline } from '../lib/yops-log-utils';
import type { ApiPipelineContext } from './context';

export interface YopsApplyInput {
  conversationId: string;
  source: string; // 'pipeline' | 'manual' | 'answer' | 'collapse' | 'compress'
  turnHash?: string;
  yops: any[]; // YOp[] — use any[] to match current route behavior
  metadata?: Record<string, unknown>;
  /**
   * When true, mark every active-draft LLM-sourced entry for this
   * conversation as superseded inside the same transaction as the
   * insert. HumanSource ops are never touched. Default false.
   */
  replaceActiveLLMDraft?: boolean;
  /**
   * Explicit repair mode: use this replay-failing yops_log row as the repair
   * target, supersede the conversation's active uncommitted script rows, then
   * insert the edited script. If the target row is missing, already
   * superseded, or committed into an immutable baseline, apply fails before
   * inserting anything.
   */
  repairYopsLogId?: string;
  /**
   * Full active-script replacement mode for editing the already-applied
   * Script editor mirror. Supersedes active uncommitted rows, dry-runs the
   * edited full script on the remaining active baseline, then inserts it.
   */
  replaceActiveScript?: boolean;
}

export interface YopsApplyOutput {
  id: string;
  conversation_id: string;
  project_id: string;
  source: string;
  turn_hash: string | null;
  yops: any;
  created_at: string;
  metadata: Record<string, unknown> | null;
  superseded_at: string | null;
  is_committed: boolean;
  committed_by: string[];
  /** IDs of entries marked superseded by this call (empty when the flag wasn't set). */
  superseded_ids: string[];
}

interface PreparedEditedScript {
  yopsForInsert: unknown[];
  opsForDryRun: YOp[];
  droppedBaselineDefinePaths: string[];
}

function collectTreePaths(content: SemanticContent): Set<string> {
  const paths = new Set<string>();
  const visit = (node: SemanticContent['trees'][number], prefix?: string) => {
    const path = prefix ? `${prefix}/${node.key}` : node.key;
    paths.add(path);
    for (const child of node.children) {
      visit(child, path);
    }
  };

  for (const tree of content.trees) {
    visit(tree);
  }

  return paths;
}

function getDefinePath(rawOp: unknown): string | null {
  if (!rawOp || typeof rawOp !== 'object') return null;
  const maybeDefine = (rawOp as Record<string, unknown>).define;
  if (!maybeDefine || typeof maybeDefine !== 'object') return null;
  const path = (maybeDefine as Record<string, unknown>).path;
  return typeof path === 'string' && path.length > 0 ? path : null;
}

function prepareEditedScriptForBaseline(
  base: SemanticContent,
  yops: unknown[]
): PreparedEditedScript {
  try {
    extractOpsFromEntries([{ id: 'edited-script', yops }]);
  } catch (err) {
    throw new Error(
      `Edited script failed dry-run parse: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const baselinePaths = collectTreePaths(base);
  const yopsForInsert: unknown[] = [];
  const droppedBaselineDefinePaths: string[] = [];

  for (const rawOp of yops) {
    const definePath = getDefinePath(rawOp);
    if (definePath && baselinePaths.has(definePath)) {
      droppedBaselineDefinePaths.push(definePath);
      continue;
    }
    yopsForInsert.push(rawOp);
  }

  let opsForDryRun: YOp[];
  try {
    opsForDryRun = extractOpsFromEntries([{ id: 'edited-script', yops: yopsForInsert }]);
  } catch (err) {
    throw new Error(
      `Edited script failed dry-run parse: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return { yopsForInsert, opsForDryRun, droppedBaselineDefinePaths };
}

function assertEditedOpsApply(base: SemanticContent, ops: YOp[]): void {
  const result = applyYOps(base, ops);
  if (!result.ok) {
    throw new Error(
      `Edited script failed dry-run at op ${result.applied}: ${result.error?.message ?? 'unknown replay error'}`
    );
  }
}

function parseOpsForDryRun(yops: unknown[], label: string): YOp[] {
  try {
    return extractOpsFromEntries([{ id: label, yops }]);
  } catch (err) {
    throw new Error(
      `${label} failed dry-run parse: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

function assertNewOpsApply(base: SemanticContent, ops: YOp[]): void {
  const result = applyYOps(base, ops);
  if (!result.ok) {
    throw new Error(
      `YOps entry failed dry-run at op ${result.applied}: ${result.error?.message ?? 'unknown replay error'}`
    );
  }
}

function buildLineageMetadata(input: {
  base?: Record<string, unknown>;
  repairYopsLogId?: string;
  replaceActiveScript?: boolean;
  supersededIds: string[];
  droppedBaselineDefinePaths?: string[];
}): Record<string, unknown> | undefined {
  const normalized =
    input.droppedBaselineDefinePaths && input.droppedBaselineDefinePaths.length > 0
      ? { dropped_baseline_define_paths: input.droppedBaselineDefinePaths }
      : {};

  if (input.repairYopsLogId) {
    return {
      ...(input.base ?? {}),
      ...normalized,
      repair_of: input.repairYopsLogId,
      supersedes: input.supersededIds,
      repair_reason: input.base?.repair_reason ?? 'user_edited_replay_failure',
    };
  }

  if (input.replaceActiveScript) {
    return {
      ...(input.base ?? {}),
      ...normalized,
      supersedes: input.supersededIds,
      replacement_reason: input.base?.replacement_reason ?? 'user_replaced_active_script',
    };
  }

  return input.base && Object.keys(input.base).length > 0 ? input.base : undefined;
}

export const yopsApplyOp: Operation<YopsApplyInput, YopsApplyOutput> = {
  name: 'yops-apply',
  async *run(input: YopsApplyInput, ctx): AsyncGenerator<PipelineEvent, YopsApplyOutput> {
    const {
      conversationId,
      source,
      turnHash,
      yops,
      metadata,
      replaceActiveLLMDraft,
      repairYopsLogId,
      replaceActiveScript,
    } = input;
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
      let ids: string[] = [];
      let yopsForInsert: unknown[] = yops;
      let droppedBaselineDefinePaths: string[] = [];
      if (repairYopsLogId) {
        ids = await supersedeYOpsLogEntryForRepair(tx, conversationId, repairYopsLogId);
        if (!ids.includes(repairYopsLogId)) {
          throw new Error(
            `Cannot repair yops_log entry ${repairYopsLogId}: row is missing, already superseded, or committed`
          );
        }
        const repairBaseline = await replayActiveDraftOnBaseline(tx, conversationId);
        const prepared = prepareEditedScriptForBaseline(repairBaseline, yops);
        yopsForInsert = prepared.yopsForInsert;
        droppedBaselineDefinePaths = prepared.droppedBaselineDefinePaths;
        assertEditedOpsApply(repairBaseline, prepared.opsForDryRun);
      } else if (replaceActiveScript) {
        ids = await supersedeActiveUncommittedYOpsLogEntries(tx, conversationId);
        const replacementBaseline = await replayActiveDraftOnBaseline(tx, conversationId);
        const prepared = prepareEditedScriptForBaseline(replacementBaseline, yops);
        yopsForInsert = prepared.yopsForInsert;
        droppedBaselineDefinePaths = prepared.droppedBaselineDefinePaths;
        assertEditedOpsApply(replacementBaseline, prepared.opsForDryRun);
      } else if (replaceActiveLLMDraft) {
        ids = await supersedeActiveLLMSuggestions(tx, conversationId);
        const baseline = await replayActiveDraftOnBaseline(tx, conversationId);
        assertNewOpsApply(baseline, parseOpsForDryRun(yops, 'YOps entry'));
      } else {
        const baseline = await replayActiveDraftOnBaseline(tx, conversationId);
        assertNewOpsApply(baseline, parseOpsForDryRun(yops, 'YOps entry'));
      }
      const entryMetadata = buildLineageMetadata({
        base: metadata,
        repairYopsLogId,
        replaceActiveScript,
        supersededIds: ids,
        droppedBaselineDefinePaths,
      });
      const rec = await insertYOpsLogEntry(tx, {
        conversationId,
        projectId,
        source,
        turnHash: turnHash ?? undefined,
        yops: yopsForInsert,
        ...(entryMetadata ? { metadata: entryMetadata } : {}),
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
      metadata: (record.metadata as Record<string, unknown> | null | undefined) ?? null,
      superseded_at: null,
      is_committed: false,
      committed_by: [],
      superseded_ids: supersededIds,
    };
  },
};
