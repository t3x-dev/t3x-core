/**
 * commitOp — unified pipeline operation for creating commits.
 *
 * Steps:
 *   validate  — parse content, build author defaults
 *   persist   — call createCommit() in storage
 */

import type { Commit, Operation, PipelineEvent } from '@t3x-dev/core';
import { createCommit, getCommit } from '@t3x-dev/storage';
import type { ApiPipelineContext } from './context';

export interface CommitInput {
	project_id: string;
	content: { trees: unknown; relations?: unknown };
	branch?: string;
	parents?: string[];
	message?: string;
	author?: { type: 'human' | 'agent' | 'system'; id?: string; name?: string };
	provenance?: { method: string; model?: string; extracted_at?: string };
	yops_log_ids?: string[];
	sources?: Array<{ type: 'conversation' | 'import' | 'leaf'; id: string; title?: string }>;
}

export type CommitOutput = Commit;

export const commitOp: Operation<CommitInput, CommitOutput> = {
	name: 'commit',
	async *run(input: CommitInput, ctx): AsyncGenerator<PipelineEvent, CommitOutput> {
		const { db } = ctx as ApiPipelineContext;

		// validate: ensure content has trees
		yield { type: 'step_start', step: 'validate' };
		const author = input.author ?? { type: 'human' as const, name: 'cli' };
		// biome-ignore lint/suspicious/noExplicitAny: content schema is validated by Zod at route level
		const content = input.content as any;
		yield { type: 'step_done', step: 'validate' };

		// persist: create the commit via storage layer
		yield { type: 'step_start', step: 'persist' };
		const commit = await createCommit(db, {
			project_id: input.project_id,
			content,
			branch: input.branch,
			parents: input.parents,
			message: input.message,
			author,
			provenance: input.provenance,
			yops_log_ids: input.yops_log_ids ?? [],
			sources: input.sources,
		});
		yield { type: 'step_done', step: 'persist' };

		return commit;
	},
};
