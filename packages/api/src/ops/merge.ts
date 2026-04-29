/**
 * mergePrepareOp + mergeExecuteOp — unified pipeline operations for merge.
 *
 * mergePrepareOp:
 *   load      — fetch source and target commits from DB
 *   transform — call prepareMerge() from core (two-way, empty base)
 *
 * mergeExecuteOp:
 *   validate  — verify all conflicts have resolutions
 *   load      — fetch source and target commits from DB
 *   transform — call executeMerge() from core
 *   persist   — create merged commit and optionally update branch head
 */

import type {
  Author,
  Commit,
  MergeSummaryData,
  Operation,
  PipelineEvent,
  SemanticContent,
} from '@t3x-dev/core';
import {
  executeMerge,
  flattenTrees,
  type MergeDecision,
  type MergeResult,
  prepareMerge,
} from '@t3x-dev/core';
import { createCommit, getCommitUnified, updateBranchHead } from '@t3x-dev/storage';
import type { ApiPipelineContext } from './context';

// ---------------------------------------------------------------------------
// mergePrepareOp
// ---------------------------------------------------------------------------

export interface MergePrepareInput {
  source_hash: string;
  target_hash: string;
}

export interface MergePrepareOutput {
  prepared: MergeResult;
  source_project_id: string | undefined;
}

export const mergePrepareOp: Operation<MergePrepareInput, MergePrepareOutput> = {
  name: 'merge.prepare',
  async *run(input, ctx): AsyncGenerator<PipelineEvent, MergePrepareOutput> {
    const { db } = ctx as ApiPipelineContext;

    // load: fetch source and target commits
    yield { type: 'step_start', step: 'load' };
    const sourceCommit = await getCommitUnified(db, input.source_hash);
    if (!sourceCommit) {
      throw new MergeError('NOT_FOUND', `Source commit not found: ${input.source_hash}`);
    }
    const targetCommit = await getCommitUnified(db, input.target_hash);
    if (!targetCommit) {
      throw new MergeError('NOT_FOUND', `Target commit not found: ${input.target_hash}`);
    }
    yield { type: 'step_done', step: 'load' };

    // transform: prepare frame-level merge (empty base = two-way mode)
    yield { type: 'step_start', step: 'transform' };
    const baseContent: SemanticContent = { trees: [], relations: [] };
    const prepared = prepareMerge(baseContent, sourceCommit.content, targetCommit.content);
    yield { type: 'step_done', step: 'transform' };

    return {
      prepared,
      source_project_id: sourceCommit.project_id,
    };
  },
};

// ---------------------------------------------------------------------------
// mergeExecuteOp
// ---------------------------------------------------------------------------

export interface MergeExecuteInput {
  source_hash: string;
  target_hash: string;
  prepared: MergeResult;
  decisions: MergeDecision;
  message?: string;
  branch?: string;
  author: Author;
}

export interface MergeExecuteOutput {
  commit: Commit;
  merge_summary: MergeSummaryData;
}

export const mergeExecuteOp: Operation<MergeExecuteInput, MergeExecuteOutput> = {
  name: 'merge.execute',
  async *run(input, ctx): AsyncGenerator<PipelineEvent, MergeExecuteOutput> {
    const { db } = ctx as ApiPipelineContext;

    // validate: ensure all conflicts have resolutions
    yield { type: 'step_start', step: 'validate' };
    const unresolvedConflicts = input.prepared.conflicts.filter(
      (conf: { path: string }) => !input.decisions.conflictResolutions[conf.path]
    );
    if (unresolvedConflicts.length > 0) {
      throw new MergeError(
        'UNRESOLVED_CONFLICTS',
        `${unresolvedConflicts.length} conflict(s) have no resolution`
      );
    }
    yield { type: 'step_done', step: 'validate' };

    // load: fetch source and target commits
    yield { type: 'step_start', step: 'load' };
    const sourceCommit = await getCommitUnified(db, input.source_hash);
    if (!sourceCommit) {
      throw new MergeError('NOT_FOUND', `Source commit not found: ${input.source_hash}`);
    }
    if (!sourceCommit.project_id) {
      throw new MergeError('INVALID_REQUEST', 'Source commit has no project_id');
    }
    const projectId = sourceCommit.project_id;

    const targetCommit = await getCommitUnified(db, input.target_hash);
    const emptyContent: SemanticContent = { trees: [], relations: [] };
    yield { type: 'step_done', step: 'load' };

    // transform: execute merge
    yield { type: 'step_start', step: 'transform' };
    const mergedContent = executeMerge(
      emptyContent,
      sourceCommit.content,
      targetCommit?.content ?? emptyContent,
      input.prepared as unknown as MergeResult,
      input.decisions as unknown as MergeDecision
    );

    const keptFromSource = input.decisions.keepFromSource?.length ?? 0;
    const keptFromTarget = input.decisions.keepFromTarget?.length ?? 0;
    const discardedSource = input.prepared.onlyInSource.length - keptFromSource;
    const discardedTarget = input.prepared.onlyInTarget.length - keptFromTarget;
    const mergeSummary: MergeSummaryData = {
      kept_identical: input.prepared.autoKept.length,
      resolved_conflicts: input.prepared.conflicts.length,
      kept_from_source: keptFromSource,
      kept_from_target: keptFromTarget,
      discarded: discardedSource + discardedTarget,
      total_nodes: flattenTrees(mergedContent.trees).length,
    };
    yield { type: 'step_done', step: 'transform' };

    // persist: create merged commit and update branch head
    yield { type: 'step_start', step: 'persist' };
    const savedCommit = await createCommit(db, {
      parents: [input.source_hash, input.target_hash],
      author: {
        type: input.author.type as 'human' | 'agent' | 'system',
        name: input.author.name,
        id: input.author.id,
      },
      content: mergedContent,
      project_id: projectId,
      message: input.message,
      branch: input.branch || undefined,
      provenance: { method: 'merge' },
      yops_log_ids: [],
      enforceBranchLinearity: true,
    });

    if (input.branch && projectId) {
      await updateBranchHead(db, projectId, input.branch, savedCommit.hash);
    }
    yield { type: 'step_done', step: 'persist' };

    return { commit: savedCommit, merge_summary: mergeSummary };
  },
};

// ---------------------------------------------------------------------------
// Typed error for merge operations
// ---------------------------------------------------------------------------

export class MergeError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'MergeError';
  }
}
