/**
 * Pipeline adapters for the CommitV2 repository merge application service.
 *
 * Both operations accept an explicit project scope. Preparation resolves only
 * verified CommitV2 graphs. Execution treats the client preparation as a UI
 * hint, recomputes the plan server-side, and commits through ref CAS.
 */

import type {
  Author,
  MergeDecision,
  MergeResult,
  MergeSummaryData,
  Operation,
  PipelineEvent,
  SemanticContent,
} from '@t3x-dev/core';
import type { TransitionPolicyBinding } from '@t3x-dev/storage';
import {
  commitRepositoryYOpsMerge,
  prepareRepositoryYOpsMerge,
  RepositoryMergeCommitNotFoundError,
  RepositoryMergeInvalidError,
} from '../lib/repository-state-transition';
import type { ApiPipelineContext } from './context';

export interface MergePrepareInput {
  project_id: string;
  source_hash: string;
  target_hash: string;
}

export interface MergePrepareOutput {
  prepared: MergeResult;
  source_project_id: string;
}

function mapMergeServiceError(error: unknown): never {
  if (error instanceof RepositoryMergeCommitNotFoundError) {
    throw new MergeError('NOT_FOUND', error.message);
  }
  if (error instanceof RepositoryMergeInvalidError) {
    throw new MergeError('INVALID_REQUEST', error.message);
  }
  throw error;
}

export const mergePrepareOp: Operation<MergePrepareInput, MergePrepareOutput> = {
  name: 'merge.prepare',
  async *run(input, ctx): AsyncGenerator<PipelineEvent, MergePrepareOutput> {
    const { db } = ctx as ApiPipelineContext;
    yield { type: 'step_start', step: 'load' };
    let prepared: MergeResult;
    try {
      prepared = await prepareRepositoryYOpsMerge({
        db,
        projectId: input.project_id,
        sourceDigest: input.source_hash,
        targetDigest: input.target_hash,
      });
    } catch (error) {
      mapMergeServiceError(error);
    }
    yield { type: 'step_done', step: 'load' };
    yield { type: 'step_start', step: 'transform' };
    yield { type: 'step_done', step: 'transform' };
    return { prepared, source_project_id: input.project_id };
  },
};

export interface MergeCommitProjection {
  schema: 't3x/commit/v2';
  hash: string;
  parents: string[];
  author: Author;
  committed_at: string;
  content: SemanticContent;
  project_id: string;
  message: string;
  branch: string;
}

export interface MergeExecuteInput extends MergePrepareInput {
  /** UI preparation snapshot; never trusted by the commit path. */
  prepared: MergeResult;
  decisions: MergeDecision;
  message: string;
  branch: string;
  /** Task projection only; never used to derive Decision authority. */
  author: Author;
  /** Server-internal authority derived from authenticated request context. */
  writeAuthority: {
    actor: { kind: 'human' | 'agent' | 'service'; id: string };
    policyBinding?: TransitionPolicyBinding;
  };
}

export interface MergeExecuteOutput {
  commit: MergeCommitProjection;
  merge_summary: MergeSummaryData;
}

export const mergeExecuteOp: Operation<MergeExecuteInput, MergeExecuteOutput> = {
  name: 'merge.execute',
  async *run(input, ctx): AsyncGenerator<PipelineEvent, MergeExecuteOutput> {
    const { db } = ctx as ApiPipelineContext;

    yield { type: 'step_start', step: 'validate' };
    const unresolvedConflicts = input.prepared.conflicts.filter(
      (conflict) => input.decisions.conflictResolutions[conflict.path] === undefined
    );
    if (unresolvedConflicts.length > 0) {
      throw new MergeError(
        'UNRESOLVED_CONFLICTS',
        `${unresolvedConflicts.length} conflict(s) have no resolution`
      );
    }
    yield { type: 'step_done', step: 'validate' };

    yield { type: 'step_start', step: 'load' };
    yield { type: 'step_done', step: 'load' };
    yield { type: 'step_start', step: 'transform' };
    yield { type: 'step_done', step: 'transform' };
    yield { type: 'step_start', step: 'persist' };
    let merged: Awaited<ReturnType<typeof commitRepositoryYOpsMerge>>;
    try {
      merged = await commitRepositoryYOpsMerge({
        db,
        projectId: input.project_id,
        refName: input.branch,
        sourceDigest: input.source_hash,
        targetDigest: input.target_hash,
        decisions: input.decisions,
        actor: input.writeAuthority.actor,
        policyBindingSource: 'server-selected',
        ...(input.writeAuthority.policyBinding === undefined
          ? {}
          : { policyBinding: input.writeAuthority.policyBinding }),
        message: input.message,
      });
    } catch (error) {
      mapMergeServiceError(error);
    }
    yield { type: 'step_done', step: 'persist' };

    return {
      commit: {
        schema: 't3x/commit/v2',
        hash: merged.commitDigest,
        parents: merged.commit.parents.map((parent) => parent.digest),
        author: input.author,
        committed_at: merged.recordedAt,
        content: merged.content,
        project_id: input.project_id,
        message: input.message,
        branch: input.branch,
      },
      merge_summary: merged.mergeSummary,
    };
  },
};

export class MergeError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'MergeError';
  }
}
