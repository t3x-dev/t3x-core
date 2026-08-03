/**
 * diff Operation
 *
 * Read-only pipeline operation for frame-based structured diff between two commits.
 *
 * Steps:
 *   load      — fetch both commits from DB by hash
 *   transform — call diffCommits() from @t3x-dev/core
 */

/** biome-ignore-all lint/suspicious/noExplicitAny: diff op bridges DB helpers with wider runtime shapes pending stricter transaction typing */

import type { Operation, PipelineEvent, TreeDiff } from '@t3x-dev/core';
import { diffCommits } from '@t3x-dev/core';
import {
  getRepositorySemanticCommit,
  type RepositorySemanticCommitProjection,
} from '../lib/repository-state-transition';
import type { ApiPipelineContext } from './context';

export interface DiffInput {
  base_commit_hash: string;
  target_commit_hash: string;
}

interface CommitMeta {
  digest: string;
  rationale: string | null;
  actor: unknown;
  recorded_at: string;
}

export interface DiffOutput {
  diff: TreeDiff;
  base: CommitMeta;
  target: CommitMeta;
}

function commitMeta(commit: RepositorySemanticCommitProjection): CommitMeta {
  return {
    digest: commit.digest,
    rationale: commit.rationale,
    actor: commit.actor,
    recorded_at: commit.recordedAt,
  };
}

export const diffOp: Operation<DiffInput, DiffOutput> = {
  name: 'diff',
  async *run(input: DiffInput, ctx): AsyncGenerator<PipelineEvent, DiffOutput> {
    const { base_commit_hash, target_commit_hash } = input;
    const { db } = ctx as ApiPipelineContext;

    // load: fetch both commits
    yield { type: 'step_start', step: 'load' };
    const [baseCommit, targetCommit] = await Promise.all([
      getRepositorySemanticCommit(db as any, base_commit_hash),
      getRepositorySemanticCommit(db as any, target_commit_hash),
    ]);

    if (!baseCommit) {
      throw new Error(`Base commit ${base_commit_hash} not found`);
    }
    if (!targetCommit) {
      throw new Error(`Target commit ${target_commit_hash} not found`);
    }
    yield { type: 'step_done', step: 'load' };

    // transform: compute diff
    yield { type: 'step_start', step: 'transform' };
    const diff: TreeDiff = diffCommits(baseCommit.semanticContent, targetCommit.semanticContent);
    yield { type: 'step_done', step: 'transform' };

    return {
      diff,
      base: commitMeta(baseCommit),
      target: commitMeta(targetCommit),
    };
  },
};
