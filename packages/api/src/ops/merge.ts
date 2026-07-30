/**
 * mergePrepareOp + mergeExecuteOp — unified pipeline operations for merge.
 *
 * mergePrepareOp:
 *   load      — fetch source, target, and their nearest common ancestor
 *   transform — call prepareMerge() from core (three-way)
 *
 * mergeExecuteOp:
 *   validate  — verify all conflicts have resolutions
 *   load      — fetch source and target commits from DB
 *   transform — call executeMerge() from core
 *   persist   — create merged commit (which atomically advances the branch head)
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
import { type AnyDB, createCommit, findBranchByName, getCommitUnified } from '@t3x-dev/storage';
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
    if (targetCommit.project_id !== sourceCommit.project_id) {
      throw new MergeError(
        'INVALID_REQUEST',
        'Source and target commits must belong to the same project'
      );
    }
    yield { type: 'step_done', step: 'load' };

    const baseCommit = await findMergeBase(db, sourceCommit, targetCommit);

    // transform: prepare a real three-way merge from the nearest common ancestor
    yield { type: 'step_start', step: 'transform' };
    const baseContent: SemanticContent = baseCommit?.content ?? { trees: [], relations: [] };
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
  /** Skip the operation's transaction when the caller already owns one. */
  manage_transaction?: boolean;
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
    if (!targetCommit) {
      throw new MergeError('NOT_FOUND', `Target commit not found: ${input.target_hash}`);
    }
    if (targetCommit.project_id !== projectId) {
      throw new MergeError(
        'INVALID_REQUEST',
        `Target commit ${input.target_hash} does not belong to project ${projectId}`
      );
    }
    const targetBranch = input.branch ?? targetCommit.branch;
    const baseCommit = await findMergeBase(db, sourceCommit, targetCommit);
    const baseContent: SemanticContent = baseCommit?.content ?? { trees: [], relations: [] };
    yield { type: 'step_done', step: 'load' };

    // transform: execute merge
    yield { type: 'step_start', step: 'transform' };
    const mergedContent = executeMerge(
      baseContent,
      sourceCommit.content,
      targetCommit.content,
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

    // persist: create merged commit; createCommit advances the branch head atomically
    yield { type: 'step_start', step: 'persist' };
    const persist = async (txOrDb: AnyDB): Promise<Commit> => {
      if (input.branch) {
        const branchRecord = await findBranchByName(txOrDb, projectId, targetBranch);
        if (!branchRecord) {
          throw new MergeError('NOT_FOUND', `Target branch not found: ${targetBranch}`);
        }
      }

      const saved = await createCommit(txOrDb, {
        parents: [input.target_hash, input.source_hash],
        author: {
          type: input.author.type as 'human' | 'agent' | 'system',
          name: input.author.name,
          id: input.author.id,
        },
        content: mergedContent,
        project_id: projectId,
        message: input.message,
        branch: targetBranch,
        provenance: { method: 'merge' },
        yops_log_ids: [],
        enforceBranchLinearity: true,
      });

      return saved;
    };

    const savedCommit =
      input.branch && input.manage_transaction !== false
        ? await (
            db as unknown as {
              transaction: (callback: (tx: unknown) => Promise<Commit>) => Promise<Commit>;
            }
          ).transaction((tx) => persist(tx as AnyDB))
        : await persist(db);
    yield { type: 'step_done', step: 'persist' };

    return { commit: savedCommit, merge_summary: mergeSummary };
  },
};

interface CommitDistance {
  commit: Commit;
  distance: number;
}

/** Find a deterministic nearest common ancestor in the commit DAG. */
async function findMergeBase(
  db: AnyDB,
  sourceCommit: Commit,
  targetCommit: Commit
): Promise<Commit | null> {
  const projectId = sourceCommit.project_id;
  if (!projectId) return null;

  const cache = new Map<string, Commit>([
    [sourceCommit.hash, sourceCommit],
    [targetCommit.hash, targetCommit],
  ]);

  const collectAncestors = async (start: Commit): Promise<Map<string, CommitDistance>> => {
    const distances = new Map<string, CommitDistance>();
    const queue: CommitDistance[] = [{ commit: start, distance: 0 }];

    for (let index = 0; index < queue.length; index++) {
      const current = queue[index];
      const previous = distances.get(current.commit.hash);
      if (previous && previous.distance <= current.distance) continue;
      distances.set(current.commit.hash, current);

      for (const parentHash of current.commit.parents) {
        let parent = cache.get(parentHash) ?? null;
        if (!parent) {
          parent = await getCommitUnified(db, parentHash);
          if (parent) cache.set(parentHash, parent);
        }
        if (parent?.project_id === projectId) {
          queue.push({ commit: parent, distance: current.distance + 1 });
        }
      }
    }

    return distances;
  };

  const [sourceAncestors, targetAncestors] = await Promise.all([
    collectAncestors(sourceCommit),
    collectAncestors(targetCommit),
  ]);

  const candidates = [...sourceAncestors.entries()]
    .filter(([hash]) => targetAncestors.has(hash))
    .map(([hash, source]) => ({
      hash,
      commit: source.commit,
      sourceDistance: source.distance,
      targetDistance: targetAncestors.get(hash)!.distance,
    }))
    .sort(
      (a, b) =>
        a.sourceDistance + a.targetDistance - (b.sourceDistance + b.targetDistance) ||
        Math.max(a.sourceDistance, a.targetDistance) -
          Math.max(b.sourceDistance, b.targetDistance) ||
        a.hash.localeCompare(b.hash)
    );

  return candidates[0]?.commit ?? null;
}

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
