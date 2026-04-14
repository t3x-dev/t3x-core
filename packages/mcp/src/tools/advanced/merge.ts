/**
 * t3x_merge -- 5-step merge workflow for combining two commits.
 *
 * Actions:
 *   prepare        -- create a merge draft with conflict analysis
 *   show_conflict  -- inspect a specific conflict by index
 *   resolve        -- record a resolution decision (with reasoning)
 *   execute        -- commit the merge
 *   abort          -- cancel the merge draft
 */

import type { SemanticContent } from '@t3x-dev/core';
import { executeMerge, type MergeDecision, type MergeResult, prepareMerge } from '@t3x-dev/core';
import {
  cancelMergeDraft,
  createCommit,
  createMergeDraft,
  getCommit,
  getMergeDraft,
  updateMergeDraft,
} from '@t3x-dev/storage';

import { getDB } from '../../db.js';
import { fail, ok, type ToolDef, type ToolHandler } from '../types.js';

// -- Tool definition --

const ACTIONS = ['prepare', 'show_conflict', 'resolve', 'execute', 'abort'] as const;
type Action = (typeof ACTIONS)[number];

export const mergeDef: ToolDef = {
  name: 't3x_merge',
  description: [
    'Merge two commits via a 5-step workflow.',
    '',
    'Actions:',
    '  prepare        -- Analyze source + target, create merge draft with conflicts.',
    '  show_conflict  -- Show a specific conflict by index from the prepared merge.',
    '  resolve        -- Record a resolution for a conflict (reasoning is REQUIRED).',
    '  execute        -- Commit the resolved merge.',
    '  abort          -- Cancel the merge draft.',
    '',
    'Typical flow:',
    '  1. prepare({ project_id, source_hash, target_hash })',
    '  2. show_conflict({ draft_id, index: 0 })',
    '  3. resolve({ draft_id, index: 0, resolution: "source", reasoning: "..." })',
    '  4. execute({ draft_id, message: "Merge feature into main" })',
    '',
    'Or abort at any time:',
    '  abort({ draft_id })',
  ].join('\n'),
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ACTIONS as unknown as string[],
        description: 'Merge workflow step to execute.',
      },
      project_id: {
        type: 'string',
        description: 'Project ID (required for prepare).',
      },
      source_hash: {
        type: 'string',
        description: 'Source commit hash (required for prepare).',
      },
      target_hash: {
        type: 'string',
        description: 'Target commit hash (required for prepare).',
      },
      draft_id: {
        type: 'string',
        description: 'Merge draft ID (required for show_conflict, resolve, execute, abort).',
      },
      index: {
        type: 'number',
        description: 'Conflict index (required for show_conflict and resolve).',
      },
      resolution: {
        type: 'string',
        enum: ['source', 'target', 'both'],
        description: 'How to resolve the conflict (required for resolve).',
      },
      reasoning: {
        type: 'string',
        description: 'Why this resolution was chosen (required for resolve -- audit trail).',
      },
      message: {
        type: 'string',
        description: 'Commit message (required for execute).',
      },
    },
    required: ['action'],
  },
  annotations: {
    readOnlyHint: false,
    idempotentHint: false,
  },
};

// -- Handler --

export const mergeHandler: ToolHandler = async (args) => {
  const action = args.action as Action | undefined;

  if (!action || !ACTIONS.includes(action as Action)) {
    return fail(`Missing or invalid "action". Must be one of: ${ACTIONS.join(', ')}.`);
  }

  switch (action) {
    case 'prepare':
      return handlePrepare(args);
    case 'show_conflict':
      return handleShowConflict(args);
    case 'resolve':
      return handleResolve(args);
    case 'execute':
      return handleExecute(args);
    case 'abort':
      return handleAbort(args);
  }
};

// -- Action handlers --

async function handlePrepare(args: Record<string, unknown>) {
  const projectId = args.project_id as string | undefined;
  const sourceHash = args.source_hash as string | undefined;
  const targetHash = args.target_hash as string | undefined;

  if (!projectId) return fail('"project_id" is required for prepare.');
  if (!sourceHash) return fail('"source_hash" is required for prepare.');
  if (!targetHash) return fail('"target_hash" is required for prepare.');

  const db = await getDB();

  const [sourceCommit, targetCommit] = await Promise.all([
    getCommit(db, sourceHash),
    getCommit(db, targetHash),
  ]);

  if (!sourceCommit) return fail(`Source commit not found: ${sourceHash}`);
  if (!targetCommit) return fail(`Target commit not found: ${targetHash}`);

  const sourceContent = sourceCommit.content as SemanticContent;
  const targetContent = targetCommit.content as SemanticContent;

  // Use target as base for two-way merge (no common ancestor)
  const prepared = prepareMerge(targetContent, sourceContent, targetContent);

  const draft = await createMergeDraft(db, {
    projectId,
    sourceHash,
    targetHash,
    prepared,
  });

  return ok({
    draft_id: draft.draftId,
    summary: {
      auto_kept: prepared.autoKept.length,
      conflicts: prepared.conflicts.length,
      only_in_source: prepared.onlyInSource.length,
      only_in_target: prepared.onlyInTarget.length,
    },
    next_steps:
      prepared.conflicts.length > 0
        ? [
            `Use show_conflict with draft_id="${draft.draftId}" and index=0 to inspect the first conflict.`,
            'Resolve each conflict with the resolve action, then execute.',
          ]
        : [
            'No conflicts detected. You can execute the merge immediately.',
            `Use execute with draft_id="${draft.draftId}" and a message.`,
          ],
  });
}

async function handleShowConflict(args: Record<string, unknown>) {
  const draftId = args.draft_id as string | undefined;
  const index = args.index as number | undefined;

  if (!draftId) return fail('"draft_id" is required for show_conflict.');
  if (index === undefined || index === null) return fail('"index" is required for show_conflict.');

  const db = await getDB();
  const draft = await getMergeDraft(db, draftId);

  if (!draft) return fail(`Merge draft not found: ${draftId}`);

  const prepared = JSON.parse(draft.preparedJson) as MergeResult;

  if (index < 0 || index >= prepared.conflicts.length) {
    return fail(
      `Conflict index ${index} out of range. There are ${prepared.conflicts.length} conflicts (0-${prepared.conflicts.length - 1}).`
    );
  }

  const conflict = prepared.conflicts[index];

  return ok({
    draft_id: draftId,
    index,
    total_conflicts: prepared.conflicts.length,
    conflict: {
      path: conflict.path,
      slot_conflicts: conflict.slotConflicts,
    },
    hint: 'Use resolve with resolution="source"|"target"|"both" and reasoning="..." to resolve this conflict.',
  });
}

async function handleResolve(args: Record<string, unknown>) {
  const draftId = args.draft_id as string | undefined;
  const index = args.index as number | undefined;
  const resolution = args.resolution as string | undefined;
  const reasoning = args.reasoning as string | undefined;

  if (!draftId) return fail('"draft_id" is required for resolve.');
  if (index === undefined || index === null) return fail('"index" is required for resolve.');
  if (!resolution)
    return fail('"resolution" is required for resolve. Use "source", "target", or "both".');
  if (!reasoning) {
    return fail(
      '"reasoning" is required for resolve.\nExplain why this resolution was chosen -- this creates an audit trail.'
    );
  }

  const validResolutions = ['source', 'target', 'both'];
  if (!validResolutions.includes(resolution)) {
    return fail(
      `Invalid resolution "${resolution}". Must be one of: ${validResolutions.join(', ')}.`
    );
  }

  const db = await getDB();
  const draft = await getMergeDraft(db, draftId);

  if (!draft) return fail(`Merge draft not found: ${draftId}`);
  if (draft.status !== 'pending') {
    return fail(
      `Merge draft is "${draft.status}", cannot resolve. Only "pending" drafts can be resolved.`
    );
  }

  const prepared = JSON.parse(draft.preparedJson) as MergeResult & {
    resolutions?: Record<string, { resolution: string; reasoning: string }>;
  };

  if (index < 0 || index >= prepared.conflicts.length) {
    return fail(
      `Conflict index ${index} out of range. There are ${prepared.conflicts.length} conflicts (0-${prepared.conflicts.length - 1}).`
    );
  }

  const conflictPath = prepared.conflicts[index].path;

  // Merge new resolution into existing resolutions
  const resolutions = prepared.resolutions ?? {};
  resolutions[conflictPath] = { resolution, reasoning };
  prepared.resolutions = resolutions;

  await updateMergeDraft(db, draftId, { prepared });

  const resolvedCount = Object.keys(resolutions).length;
  const totalConflicts = prepared.conflicts.length;

  return ok({
    draft_id: draftId,
    resolved_path: conflictPath,
    resolution,
    reasoning,
    progress: `${resolvedCount}/${totalConflicts} conflicts resolved`,
    next_steps:
      resolvedCount < totalConflicts
        ? [`Resolve remaining conflicts. Next: show_conflict index=${resolvedCount}.`]
        : ['All conflicts resolved. Use execute to commit the merge.'],
  });
}

async function handleExecute(args: Record<string, unknown>) {
  const draftId = args.draft_id as string | undefined;
  const message = args.message as string | undefined;

  if (!draftId) return fail('"draft_id" is required for execute.');
  if (!message) return fail('"message" is required for execute.');

  const db = await getDB();
  const draft = await getMergeDraft(db, draftId);

  if (!draft) return fail(`Merge draft not found: ${draftId}`);
  if (draft.status !== 'pending') {
    return fail(
      `Merge draft is "${draft.status}", cannot execute. Only "pending" drafts can be executed.`
    );
  }

  const prepared = JSON.parse(draft.preparedJson) as MergeResult & {
    resolutions?: Record<string, { resolution: string; reasoning: string }>;
  };

  // Verify all conflicts are resolved
  const resolvedCount = Object.keys(prepared.resolutions ?? {}).length;
  if (resolvedCount < prepared.conflicts.length) {
    return fail(
      `Only ${resolvedCount}/${prepared.conflicts.length} conflicts resolved. Resolve all conflicts before executing.`
    );
  }

  // Fetch commits to get content for merge execution
  const [sourceCommit, targetCommit] = await Promise.all([
    getCommit(db, draft.sourceHash),
    getCommit(db, draft.targetHash),
  ]);

  if (!sourceCommit) return fail(`Source commit no longer found: ${draft.sourceHash}`);
  if (!targetCommit) return fail(`Target commit no longer found: ${draft.targetHash}`);

  const sourceContent = sourceCommit.content as SemanticContent;
  const targetContent = targetCommit.content as SemanticContent;

  // Build MergeDecision from stored resolutions
  const conflictResolutions: Record<string, 'source' | 'target' | 'both'> = {};
  for (const [path, res] of Object.entries(prepared.resolutions ?? {})) {
    conflictResolutions[path] = res.resolution as 'source' | 'target' | 'both';
  }

  const decisions: MergeDecision = {
    conflictResolutions,
    keepFromSource: prepared.onlyInSource,
    keepFromTarget: prepared.onlyInTarget,
    keepRelationsFromSource: true,
    keepRelationsFromTarget: true,
  };

  const mergedContent = executeMerge(
    targetContent,
    sourceContent,
    targetContent,
    prepared,
    decisions
  );

  const commit = await createCommit(db, {
    parents: [draft.sourceHash, draft.targetHash],
    author: { type: 'human' as const, name: 'mcp' },
    content: mergedContent,
    project_id: draft.projectId,
    message,
    branch: draft.targetBranch ?? 'main',
    provenance: { method: 'human_curation' },
  });

  // Mark draft as committed
  await updateMergeDraft(db, draftId, { status: 'committed' });

  return ok({
    commit_hash: commit.hash,
    branch: commit.branch ?? 'main',
    parents: [draft.sourceHash, draft.targetHash],
    committed_at: commit.committed_at,
    message,
  });
}

async function handleAbort(args: Record<string, unknown>) {
  const draftId = args.draft_id as string | undefined;

  if (!draftId) return fail('"draft_id" is required for abort.');

  const db = await getDB();
  const draft = await getMergeDraft(db, draftId);

  if (!draft) return fail(`Merge draft not found: ${draftId}`);
  if (draft.status !== 'pending') {
    return fail(
      `Merge draft is "${draft.status}", cannot abort. Only "pending" drafts can be aborted.`
    );
  }

  await cancelMergeDraft(db, draftId);

  return ok({
    draft_id: draftId,
    status: 'cancelled',
    message: 'Merge draft cancelled.',
  });
}
