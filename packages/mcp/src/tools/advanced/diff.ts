/**
 * t3x_diff -- compare two commits and return a structured diff.
 *
 * Fetches both commits from storage, extracts their SemanticContent,
 * and delegates to the core diffCommits function.
 */

import { diffCommits } from '@t3x-dev/core';
import { getCommit } from '@t3x-dev/storage';

import { getApiClient, isApiBackend } from '../../backend.js';
import { getDB } from '../../db.js';
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
        description: 'Project ID (optional, for validation).',
      },
    },
    required: ['base', 'target'],
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

  if (!base) {
    return fail('"base" is required.\nProvide the commit hash of the base (older) commit.');
  }
  if (!target) {
    return fail('"target" is required.\nProvide the commit hash of the target (newer) commit.');
  }

  if (isApiBackend()) {
    const client = getApiClient();
    return ok(
      await client.twoWayDiff({
        base_commit_hash: base,
        target_commit_hash: target,
      })
    );
  }

  const db = await getDB();

  const [baseCommit, targetCommit] = await Promise.all([
    getCommit(db, base),
    getCommit(db, target),
  ]);

  if (!baseCommit) {
    return fail(`Base commit not found: ${base}`);
  }
  if (!targetCommit) {
    return fail(`Target commit not found: ${target}`);
  }

  const baseContent = baseCommit.content as { trees: unknown[]; relations: unknown[] };
  const targetContent = targetCommit.content as { trees: unknown[]; relations: unknown[] };

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
