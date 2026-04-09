/**
 * commitOp — unified pipeline operation for creating commits.
 *
 * Steps:
 *   validate  — parse content, build author defaults, run validateTree
 *   persist   — call createCommit() in storage
 *
 * validateTree runs ylint (structural hygiene) on the content before commit.
 * Errors block the commit. Warnings are emitted as pipeline events.
 */

import type { Commit, Operation, PipelineEvent, SemanticContent } from '@t3x-dev/core';
import { validateTree } from '@t3x-dev/core';
import { createCommit } from '@t3x-dev/storage';
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
  /** Skip validateTree check (e.g., for internal/system commits). */
  skip_validation?: boolean;
}

export type CommitOutput = Commit & {
  /** Validation advisories (warnings/info that didn't block the commit). */
  advisories?: Array<{ rule: string; path: string; message: string; severity: string }>;
};

export const commitOp: Operation<CommitInput, CommitOutput> = {
  name: 'commit',
  async *run(input: CommitInput, ctx): AsyncGenerator<PipelineEvent, CommitOutput> {
    const { db } = ctx as ApiPipelineContext;

    // validate: ensure content has trees + run validateTree
    yield { type: 'step_start', step: 'validate' };
    const author = input.author ?? { type: 'human' as const, name: 'cli' };
    // biome-ignore lint/suspicious/noExplicitAny: content schema is validated by Zod at route level
    const content = input.content as any;

    let advisories: CommitOutput['advisories'];

    if (!input.skip_validation && content.trees) {
      const semanticContent: SemanticContent = {
        trees: content.trees ?? [],
        relations: content.relations ?? [],
      };
      const validation = validateTree(semanticContent);

      // Block on errors
      if (!validation.valid) {
        const errors = validation.warnings
          .filter((w) => w.severity === 'error')
          .map((w) => `${w.rule}: ${w.message}`)
          .join('; ');
        throw new Error(`Validation failed: ${errors}`);
      }

      // Collect advisories (warn/info)
      if (validation.warnings.length > 0) {
        advisories = validation.warnings.map((w) => ({
          rule: w.rule,
          path: w.path,
          message: w.message,
          severity: w.severity,
        }));
        yield {
          type: 'step_info',
          step: 'validate',
          message: `${validation.warnings.length} advisory warning(s)`,
        };
      }
    }
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

    return { ...commit, advisories };
  },
};
