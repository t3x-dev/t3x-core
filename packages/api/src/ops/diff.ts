/**
 * diff Operation
 *
 * Read-only pipeline operation for frame-based semantic diff between two commits.
 *
 * Steps:
 *   load      — fetch both commits from DB by hash
 *   transform — call diffCommits() from @t3x-dev/core
 */

import type { Operation, PipelineEvent, TreeDiff } from '@t3x-dev/core';
import { diffCommits } from '@t3x-dev/core';
import { getCommitUnified } from '@t3x-dev/storage';
import type { ApiPipelineContext } from './context';

export interface DiffInput {
	base_commit_hash: string;
	target_commit_hash: string;
}

interface CommitMeta {
	hash: string;
	message: string | null;
	author: unknown;
	committed_at: string;
	branch: string;
}

export interface DiffOutput {
	diff: TreeDiff;
	base: CommitMeta;
	target: CommitMeta;
}

function commitMeta(commit: { hash: string; message?: string | null; author: unknown; committed_at: string; branch: string }): CommitMeta {
	return {
		hash: commit.hash,
		message: commit.message ?? null,
		author: commit.author,
		committed_at: commit.committed_at,
		branch: commit.branch,
	};
}

export const diffOp: Operation<DiffInput, DiffOutput> = {
	name: 'diff',
	async *run(
		input: DiffInput,
		ctx,
	): AsyncGenerator<PipelineEvent, DiffOutput> {
		const { base_commit_hash, target_commit_hash } = input;
		const { db } = ctx as ApiPipelineContext;

		// load: fetch both commits
		yield { type: 'step_start', step: 'load' };
		const [baseCommit, targetCommit] = await Promise.all([
			getCommitUnified(db as any, base_commit_hash),
			getCommitUnified(db as any, target_commit_hash),
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
		const diff: TreeDiff = diffCommits(baseCommit.content, targetCommit.content);
		yield { type: 'step_done', step: 'transform' };

		return {
			diff,
			base: commitMeta(baseCommit),
			target: commitMeta(targetCommit),
		};
	},
};
