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

import type { MergeDecision, MergeResult } from '@t3x-dev/core';
import {
  cancelMergeDraft,
  createMergeDraft,
  getMergeDraft,
  getTransitionRefHead,
  updateMergeDraft,
} from '@t3x-dev/storage';

import { getApiClient, isApiBackend } from '../../backend.js';
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
    '  prepare        -- Analyze source + target CommitV2 graphs for an explicit target ref.',
    '  show_conflict  -- Show a specific conflict by index from the prepared merge.',
    '  resolve        -- Record a resolution for a conflict (reasoning is REQUIRED).',
    '  execute        -- Commit the resolved merge.',
    '  abort          -- Cancel the merge draft.',
    '',
    'Typical flow:',
    '  1. prepare({ project_id, source_hash, target_hash, source_branch, target_branch })',
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
      source_branch: {
        type: 'string',
        description: 'Source ref name (required for prepare).',
      },
      target_branch: {
        type: 'string',
        description: 'Target ref name (required for prepare and checked with CAS on execute).',
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

  if (isApiBackend()) return handleApiAction(action, args);

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

// -- API-backed action handlers --

type ApiMergeDraft = {
  draftId: string;
  projectId: string;
  sourceHash: string;
  targetHash: string;
  sourceBranch?: string;
  targetBranch?: string;
  status: 'pending' | 'committed' | 'cancelled';
  prepared: MergeResult;
  decisions?: MergeDecision;
  decisionRevision?: number;
};

async function handleApiAction(action: Action, args: Record<string, unknown>) {
  const client = getApiClient();

  switch (action) {
    case 'prepare':
      return handleApiPrepare(client, args);
    case 'show_conflict':
      return handleApiShowConflict(client, args);
    case 'resolve':
      return handleApiResolve(client, args);
    case 'execute':
      return handleApiExecute(client, args);
    case 'abort':
      return handleApiAbort(client, args);
  }
}

async function handleApiPrepare(
  client: ReturnType<typeof getApiClient>,
  args: Record<string, unknown>
) {
  const projectId = args.project_id as string | undefined;
  const sourceHash = args.source_hash as string | undefined;
  const targetHash = args.target_hash as string | undefined;
  const sourceBranch = args.source_branch as string | undefined;
  const targetBranch = args.target_branch as string | undefined;

  if (!projectId) return fail('"project_id" is required for prepare.');
  if (!sourceHash) return fail('"source_hash" is required for prepare.');
  if (!targetHash) return fail('"target_hash" is required for prepare.');
  if (!sourceBranch) return fail('"source_branch" is required for prepare.');
  if (!targetBranch) return fail('"target_branch" is required for prepare.');

  const draft = (await client.createMergeDraft({
    project_id: projectId,
    source_hash: sourceHash,
    target_hash: targetHash,
    source_branch: sourceBranch,
    target_branch: targetBranch,
  })) as ApiMergeDraft;
  const prepared = draft.prepared;

  return ok({
    draft_id: draft.draftId,
    summary: summarizePreparedMerge(prepared),
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

async function handleApiShowConflict(
  client: ReturnType<typeof getApiClient>,
  args: Record<string, unknown>
) {
  const draftId = args.draft_id as string | undefined;
  const index = args.index as number | undefined;

  if (!draftId) return fail('"draft_id" is required for show_conflict.');
  if (index === undefined || index === null) return fail('"index" is required for show_conflict.');

  const draft = (await client.getMergeDraft(draftId)) as ApiMergeDraft;
  return describeConflict(draftId, draft.prepared, index);
}

async function handleApiResolve(
  client: ReturnType<typeof getApiClient>,
  args: Record<string, unknown>
) {
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

  const validResolutions = ['source', 'target', 'both'] as const;
  if (!validResolutions.includes(resolution as (typeof validResolutions)[number])) {
    return fail(
      `Invalid resolution "${resolution}". Must be one of: ${validResolutions.join(', ')}.`
    );
  }

  const draft = (await client.getMergeDraft(draftId)) as ApiMergeDraft;
  if (draft.status !== 'pending') {
    return fail(
      `Merge draft is "${draft.status}", cannot resolve. Only "pending" drafts can be resolved.`
    );
  }
  const prepared = draft.prepared;
  if (index < 0 || index >= prepared.conflicts.length) {
    return fail(
      `Conflict index ${index} out of range. There are ${prepared.conflicts.length} conflicts (0-${prepared.conflicts.length - 1}).`
    );
  }

  const conflictPath = prepared.conflicts[index].path;
  const decisions = mergeDecisionWithResolution(
    draft.decisions ?? defaultMergeDecision(prepared),
    conflictPath,
    resolution as 'source' | 'target' | 'both'
  );
  const updated = (await client.updateMergeDraft(draftId, {
    decisions,
    expected_decision_revision: draft.decisionRevision ?? 0,
  })) as ApiMergeDraft;
  const resolvedCount = Object.keys(updated.decisions?.conflictResolutions ?? {}).length;
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

async function handleApiExecute(
  client: ReturnType<typeof getApiClient>,
  args: Record<string, unknown>
) {
  const draftId = args.draft_id as string | undefined;
  const message = args.message as string | undefined;

  if (!draftId) return fail('"draft_id" is required for execute.');
  if (!message) return fail('"message" is required for execute.');

  const draft = (await client.getMergeDraft(draftId)) as ApiMergeDraft;
  if (draft.status !== 'pending') {
    return fail(
      `Merge draft is "${draft.status}", cannot execute. Only "pending" drafts can be executed.`
    );
  }
  const committed = await client.commitMergeDraft(draftId, {
    message,
    ...(draft.targetBranch === undefined ? {} : { branch: draft.targetBranch }),
  });

  return ok({
    commit_hash: committed.hash,
    branch: committed.branch,
    parents: committed.parents,
    committed_at: committed.committed_at,
    message: committed.message,
    merge_summary: committed.merge_summary,
  });
}

async function handleApiAbort(
  client: ReturnType<typeof getApiClient>,
  args: Record<string, unknown>
) {
  const draftId = args.draft_id as string | undefined;

  if (!draftId) return fail('"draft_id" is required for abort.');

  const result = await client.deleteMergeDraft(draftId);
  return ok({
    draft_id: draftId,
    status: result.deleted ? 'deleted' : 'unchanged',
    message: result.deleted
      ? 'Merge draft deleted by the API boundary.'
      : 'Merge draft was not deleted.',
  });
}

// -- Action handlers --

async function handlePrepare(args: Record<string, unknown>) {
  const projectId = args.project_id as string | undefined;
  const sourceHash = args.source_hash as string | undefined;
  const targetHash = args.target_hash as string | undefined;
  const sourceBranch = args.source_branch as string | undefined;
  const targetBranch = args.target_branch as string | undefined;

  if (!projectId) return fail('"project_id" is required for prepare.');
  if (!sourceHash) return fail('"source_hash" is required for prepare.');
  if (!targetHash) return fail('"target_hash" is required for prepare.');
  if (!sourceBranch) return fail('"source_branch" is required for prepare.');
  if (!targetBranch) return fail('"target_branch" is required for prepare.');

  const db = await getDB();
  const targetHead = await getTransitionRefHead(db, { projectId, refName: targetBranch });
  if (targetHead.format !== 'transition_v2' || targetHead.head !== targetHash) {
    return fail(`Target commit ${targetHash} is not the current head of branch ${targetBranch}.`);
  }
  const { prepareRepositoryYOpsMerge } = await import('@t3x-dev/api/repository-state-transition');
  let prepared: MergeResult;
  try {
    prepared = await prepareRepositoryYOpsMerge({
      db,
      projectId,
      sourceDigest: sourceHash,
      targetDigest: targetHash,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Failed to prepare CommitV2 merge.');
  }

  const draft = await createMergeDraft(db, {
    projectId,
    sourceHash,
    targetHash,
    sourceBranch,
    targetBranch,
    prepared,
  });

  return ok({
    draft_id: draft.draftId,
    summary: summarizePreparedMerge(prepared),
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

  return describeConflict(draftId, prepared, index);
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

async function handleExecute(_args: Record<string, unknown>) {
  return fail(
    [
      't3x_merge execute requires T3X_MCP_BACKEND=api.',
      'CommitV2 merge writes must go through the shared API/application command and authorization kernel.',
      'The legacy storage backend may prepare and record local merge draft choices, but it may not mint actors or advance refs directly.',
    ].join('\n')
  );
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

function summarizePreparedMerge(prepared: MergeResult) {
  return {
    auto_kept: prepared.autoKept.length,
    conflicts: prepared.conflicts.length,
    only_in_source: prepared.onlyInSource.length,
    only_in_target: prepared.onlyInTarget.length,
  };
}

function describeConflict(draftId: string, prepared: MergeResult, index: number) {
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

function defaultMergeDecision(prepared: MergeResult): MergeDecision {
  return {
    conflictResolutions: {},
    keepFromSource: prepared.onlyInSource,
    keepFromTarget: prepared.onlyInTarget,
    keepRelationsFromSource: true,
    keepRelationsFromTarget: true,
  };
}

function mergeDecisionWithResolution(
  current: MergeDecision,
  conflictPath: string,
  resolution: 'source' | 'target' | 'both'
): MergeDecision {
  return {
    ...current,
    conflictResolutions: {
      ...current.conflictResolutions,
      [conflictPath]: resolution,
    },
  };
}
