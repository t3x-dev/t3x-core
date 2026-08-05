/**
 * t3x_diff -- compare two commits and return a structured diff.
 *
 * Fetches both commits from storage, extracts their SemanticContent,
 * and delegates to the core diffCommits function.
 */

import { diffCommits } from '@t3x-dev/core';

import { getApiClient, isApiBackend } from '../../backend.js';
import { getDB } from '../../db.js';
import { getMcpRepositorySemanticCommit } from '../../repository-semantic-commit.js';
import { fail, ok, type ToolDef, type ToolHandler } from '../types.js';

// -- Tool definition --

export const diffDef: ToolDef = {
  name: 't3x_diff',
  description: [
    'Compare two commits and return a structured diff.',
    '',
    'Returns identical nodes, modified nodes (with slot-level diffs),',
    'nodes only in base, nodes only in target, and relation changes.',
    '',
    'Example:',
    '  { "base": "sha256:aaa", "target": "sha256:bbb" }',
  ].join('\n'),
  inputSchema: {
    type: 'object',
    properties: {
      base: {
        type: 'string',
        description: 'Commit hash of the base (older) commit.',
      },
      target: {
        type: 'string',
        description: 'Commit hash of the target (newer) commit.',
      },
      project_id: {
        type: 'string',
        description: 'Project ID required to resolve CommitV2 membership.',
      },
    },
    required: ['base', 'target', 'project_id'],
  },
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
  },
};

// -- Handler --

export const diffHandler: ToolHandler = async (args) => {
  const base = args.base as string | undefined;
  const target = args.target as string | undefined;
  const projectId = args.project_id as string | undefined;

  if (!base) {
    return fail('"base" is required.\nProvide the commit hash of the base (older) commit.');
  }
  if (!target) {
    return fail('"target" is required.\nProvide the commit hash of the target (newer) commit.');
  }
  if (!projectId) {
    return fail('"project_id" is required to resolve CommitV2 membership.');
  }

  if (isApiBackend()) {
    const client = getApiClient();
    return ok(
      await client.twoWayDiff({
        base_commit_hash: base,
        target_commit_hash: target,
        project_id: projectId,
      })
    );
  }

  const db = await getDB();

  const [baseCommit, targetCommit] = await Promise.all([
    getMcpRepositorySemanticCommit(db, projectId, base),
    getMcpRepositorySemanticCommit(db, projectId, target),
  ]);

  if (!baseCommit) {
    return fail(`Base commit not found: ${base}`);
  }
  if (!targetCommit) {
    return fail(`Target commit not found: ${target}`);
  }

  const baseContent = baseCommit.semanticContent;
  const targetContent = targetCommit.semanticContent;

  const diff = diffCommits(
    baseContent as Parameters<typeof diffCommits>[0],
    targetContent as Parameters<typeof diffCommits>[1]
  );

  return ok({
    base: base,
    target: target,
    summary: {
      identical: diff.identical.length,
      modified: diff.modified.length,
      only_in_base: diff.onlyInSource.length,
      only_in_target: diff.onlyInTarget.length,
      relations_added: diff.relationsAdded.length,
      relations_removed: diff.relationsRemoved.length,
    },
    diff,
  });
};
